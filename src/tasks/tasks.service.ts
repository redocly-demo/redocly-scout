import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, map, catchError } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { ConfigSchema } from '../config';
import { ScoutJob } from '../jobs/types';
import { GenericWebhookEvent } from '../git/adapters/types';
import { ProcessGitRepoTodoType } from './dto/create-todo.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { RetryOnFail } from '../common/decorators/retry-on-fail.decorator';

@Injectable()
export class TasksService {
  readonly logger = new Logger(TasksService.name);
  private readonly orgId: string;
  private readonly portalId: string;

  constructor(
    private config: ConfigService<ConfigSchema>,
    private readonly httpService: HttpService,
  ) {
    this.orgId = this.config.getOrThrow('REDOCLY_ORG_ID');
    this.portalId = this.config.getOrThrow('REDOCLY_PORTAL_ID');
  }

  @RetryOnFail
  async createProcessRepositoryTask(
    webhook: GenericWebhookEvent,
  ): Promise<ScoutJob> {
    const url = `/orgs/${this.orgId}/portals/${this.portalId}/scout/todos`;

    const task: ProcessGitRepoTodoType = {
      type: 'PROCESS_GIT_REPO',
      namespaceId: webhook.source.namespaceId,
      providerType: webhook.source.providerType,
      repositoryId: webhook.source.repositoryId,
      branch: webhook.source.branchName,
      isMainBranch: webhook.isMainBranch,
      commitSha: webhook.commit.sha,
      prId: webhook.prId,
    };

    const job = await firstValueFrom(
      this.httpService.post<ScoutJob>(url, task).pipe(map((res) => res.data)),
    ).catch((e) => {
      throw e;
    });

    this.logger.debug({ jobId: job.id, type: job.type }, 'Job created');

    return job;
  }

  async startTask(): Promise<ScoutJob> {
    const url = `/orgs/${this.orgId}/portals/${this.portalId}/scout/tasks`;

    const job = await firstValueFrom(
      this.httpService.post<ScoutJob>(url).pipe(map((res) => res.data)),
    );

    if (job) {
      this.logger.debug({ jobId: job.id, type: job.type }, 'Fetched a new job');
    } else {
      this.logger.debug('No pending jobs found');
    }

    return job;
  }

  @RetryOnFail
  async updateStatus({ id, status }: UpdateTaskStatusDto): Promise<ScoutJob> {
    const url = `/orgs/${this.orgId}/portals/${this.portalId}/scout/tasks/${id}`;

    const job = await firstValueFrom(
      this.httpService.patch<ScoutJob>(url, { status }).pipe(
        map((res) => res.data),
        catchError((err) => {
          this.logger.error(
            { err, jobId: id, status },
            'Failed to update job status',
          );
          throw err;
        }),
      ),
    );

    this.logger.debug(
      { jobId: job.id, status: job.status },
      'Updated job status',
    );

    return job;
  }
}
