import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { TasksService } from '../tasks/tasks.service';
import { ConfigService } from '@nestjs/config';
import { ConfigSchema } from '../config';
import { ScoutJob } from './types';
import { GitService } from '../git/git.service';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { RemotesService } from '../remotes/remotes.service';
import path from 'path';
import { ContentSource } from '../git/adapters/types';
import { ApiDefinitionsService } from '../api-definitions/api-definitions.service';
import { DefinitionsValidationService } from '../api-definitions/definitions-validation.service';
import { HealthService } from '../healthcheck/health.service';
import { TaskMetadata } from '../tasks/dto/update-task-status.dto';

const HANDLE_JOB_INTERVAL = 5 * 1000; // 5 sec
const TRIGGER_NEXT_JOB_POLL_TIMEOUT = 100; // 100 ms
const HEALTH_JOB_INTERVAL = 5 * 60 * 1000; // 5 min

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private readonly dataFolder: string;
  private readonly apiFolder: string;
  private readonly maxConcurrentJobs: number;
  private readonly activeJobs: Map<string, any>;

  constructor(
    private readonly config: ConfigService<ConfigSchema>,
    private readonly tasksService: TasksService,
    private readonly healthService: HealthService,
    private readonly gitService: GitService,
    private readonly remotesService: RemotesService,
    private readonly apiDefinitionsService: ApiDefinitionsService,
    private readonly definitionsValidationService: DefinitionsValidationService,
  ) {
    this.dataFolder = this.config.getOrThrow('DATA_FOLDER');
    this.maxConcurrentJobs = this.config.getOrThrow('MAX_CONCURRENT_JOBS');
    this.apiFolder = this.config.getOrThrow('API_FOLDER');
    this.activeJobs = new Map<string, ScoutJob>();
  }

  // TODO: we could move to dynamic intervals later
  @Interval(HANDLE_JOB_INTERVAL)
  async pollJob() {
    if (this.activeJobs.size >= this.maxConcurrentJobs) {
      this.logger.debug(
        { activeJobs: this.activeJobs.size },
        'Max concurrent jobs limit reached',
      );

      return;
    }

    const job = await this.tasksService.startTask();

    if (!job) {
      return;
    }

    this.triggerPollJob();

    try {
      this.logger.log({ jobId: job.id, jobType: job.type }, 'Starting a job');
      this.activeJobs.set(job.id, job);
      const jobResultMetadata = await this.handleJob(job);
      try {
        this.logger.log({ jobId: job.id, jobType: job.type }, 'Job completed');
        await this.tasksService.updateStatus({
          id: job.id,
          status: 'COMPLETED',
          metadata: jobResultMetadata,
        });
      } catch (err) {
        // Do not update job status to "FAILED" in case when job processed but status update failed
      }
    } catch (err) {
      this.logger.error(
        { jobId: job.id, jobType: job.type, err },
        'Job failed',
      );
      await this.tasksService.updateStatus({
        id: job.id,
        status: 'FAILED',
        metadata: {
          errorMessage: err.message,
          errorStack: err.stack,
        },
      });
    } finally {
      this.activeJobs.delete(job.id);
      this.triggerPollJob();
    }
  }

  @Interval(HEALTH_JOB_INTERVAL)
  async updateScoutHealthStatus() {
    try {
      await this.gitService.checkConnectivity();
      await this.healthService.report(this.activeJobs.size);
    } catch (err) {
      this.logger.error({ err }, 'Failed to update Scout health status');
    }
  }

  async handleJob(job: ScoutJob): Promise<TaskMetadata | undefined> {
    switch (job.type) {
      case 'PROCESS_GIT_REPO':
        return this.handleProcessGitRepositoryJob(job);
      case 'UPDATE_STATUS':
        return this.handleUpdateStatusJob(job);
      default:
        throw Error(`Unknown job type ${job.type}`);
    }
  }

  async handleProcessGitRepositoryJob(
    job: ScoutJob,
  ): Promise<TaskMetadata | undefined> {
    const sourceDetails = this.convertToContentSource(job);
    const jobWorkDir = this.getJobWorkDir(job, this.dataFolder);

    try {
      await this.gitService.checkout(
        sourceDetails,
        job.prId,
        job.commitSha,
        jobWorkDir,
      );

      const discoveryResult =
        await this.apiDefinitionsService.discoverApiDefinitions(
          jobWorkDir,
          this.apiFolder,
        );

      await this.definitionsValidationService.publishValidationStartedStatus(
        job,
      );

      const validationResults =
        await this.definitionsValidationService.validate(
          job.id,
          discoveryResult.definitions,
        );

      await this.definitionsValidationService.publishValidationResults(
        validationResults,
        discoveryResult,
        job,
        jobWorkDir,
      );

      if (validationResults.some(({ result }) => !result.isValid)) {
        return;
      }

      const uploadTargets = this.apiDefinitionsService.convertToUploadTargets(
        discoveryResult.definitions,
        job,
        jobWorkDir,
      );

      const commitDetails = await this.gitService.getCommitDetails(
        job.commitSha,
        sourceDetails,
      );

      const remoteIds = await this.remotesService.pushUploadTargets(
        uploadTargets,
        job,
        commitDetails,
      );

      return { remoteIds };
    } finally {
      this.logger.debug({ jobWorkDir, jobId: job.id }, 'Clean up job workdir');
      fs.rm(jobWorkDir, { recursive: true, force: true });
    }
  }

  async handleUpdateStatusJob(job: ScoutJob) {
    const { commitSha, checks } = job;
    if (!checks) {
      this.logger.warn({ jobId: job.id }, 'No checks in job');
      return undefined;
    }
    const sourceDetails = this.convertToContentSource(job);
    await this.gitService.upsertCommitStatuses(
      commitSha,
      checks,
      sourceDetails,
    );

    const checkLogs = checks
      .filter((check) => check.status === 'FAILED' && check.logs?.length)
      .map(
        ({ name, description, logs }) =>
          `<details><summary><b>${name} - ${description}</b> ❌</summary>\n\n\`\`\`\n${logs
            ?.map(({ log, date }) => `${date} ${log}`)
            .join('\n')}\n\`\`\`\n</details>`,
      )
      .join('\n');

    if (checkLogs) {
      const existingComment = await this.gitService.getSummaryComment(
        sourceDetails,
        job.commitSha,
        job.prId,
      );

      if (existingComment.includes(job.commitSha)) {
        const header = existingComment.includes('Failed checks')
          ? ''
          : '\n\n## Failed checks';
        await this.gitService.upsertSummaryComment(
          `${header}\n\n${checkLogs}`,
          sourceDetails,
          job.commitSha,
          job.prId,
          false,
        );
      }
    }
  }

  private getJobWorkDir(job: ScoutJob, rootPath: string): string {
    const jobWorkDir = path.join(
      rootPath,
      job.namespaceId,
      job.repositoryId,
      job.commitSha,
      `${job.id}-${job.attempts.toString()}`,
    );

    if (!existsSync(jobWorkDir)) {
      fs.mkdir(jobWorkDir, { recursive: true });
    }

    return jobWorkDir;
  }

  private convertToContentSource(job: ScoutJob): ContentSource {
    return {
      providerType: job.providerType,
      namespaceId: job.namespaceId,
      repositoryId: job.repositoryId,
      branchName: job.branch,
    };
  }

  private triggerPollJob() {
    setTimeout(async () => {
      try {
        await this.pollJob();
      } catch (err) {
        this.logger.error({ err }, 'Failed to poll job');
      }
    }, TRIGGER_NEXT_JOB_POLL_TIMEOUT);
  }
}
