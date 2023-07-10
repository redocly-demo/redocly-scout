import { Injectable, Logger } from '@nestjs/common';
import {
  ApiDefinitionMetadata,
  DefinitionValidationResult,
  DiscoveredDefinition,
  ValidationResult,
  ValidationSummary,
} from './types';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, map } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { ConfigSchema } from '../config';
import { relative } from 'path';
import { ScoutJob } from '../jobs/types';
import { GitService } from '../git/git.service';
import { RetryOnFail } from '../common/decorators/retry-on-fail.decorator';

@Injectable()
export class DefinitionsValidationService {
  readonly logger = new Logger(DefinitionsValidationService.name);
  private readonly orgId: string;
  private readonly portalId: string;

  constructor(
    private config: ConfigService<ConfigSchema>,
    private readonly httpService: HttpService,
    private readonly gitService: GitService,
  ) {
    this.orgId = this.config.getOrThrow('REDOCLY_ORG_ID');
    this.portalId = this.config.getOrThrow('REDOCLY_PORTAL_ID');
  }

  async validate(
    definitions: DiscoveredDefinition[],
  ): Promise<DefinitionValidationResult[]> {
    return Promise.all(
      definitions.map(async (definition) => {
        const result = await this.validateMetadata(definition.metadata);
        this.logger.debug(
          { definitionPath: definition.path },
          'Metadata validated',
        );
        return { definition, result };
      }),
    );
  }

  @RetryOnFail
  async publishValidationResults(
    results: DefinitionValidationResult[],
    job: ScoutJob,
    jobWorkDir: string,
  ) {
    if (!results.length) {
      this.logger.debug({ jobId: job.id }, 'There is no API definitions');
      return;
    }
    const sourceDetails = {
      providerType: job.providerType,
      namespaceId: job.namespaceId,
      repositoryId: job.repositoryId,
      branchName: job.branch,
    };
    const { status, details, message } = this.getValidationSummary(
      results,
      job.commitSha,
      jobWorkDir,
    );

    await this.gitService.upsertSummaryComment(
      details,
      sourceDetails,
      job.commitSha,
      job.prId,
    );

    await this.gitService.upsertCommitStatuses(
      job.commitSha,
      [{ status, name: 'Redocly Scout', description: message }],
      sourceDetails,
    );
  }

  async publishValidationStartedStatus(job: ScoutJob) {
    const { repositoryId, namespaceId, branch, commitSha } = job;
    const sourceDetails = {
      providerType: job.providerType,
      namespaceId: namespaceId,
      repositoryId: repositoryId,
      branchName: branch,
    };

    await this.gitService.upsertCommitStatuses(
      job.commitSha,
      [
        {
          status: 'IN_PROGRESS',
          name: 'Redocly Scout',
          description: 'Metadata validation started',
        },
      ],
      sourceDetails,
    );
    this.logger.debug(
      { jobId: job.id, namespaceId, repositoryId, branch, commitSha },
      'Metadata validation started',
    );
  }

  private getValidationSummary(
    results: DefinitionValidationResult[],
    commitSha: string,
    rootPath: string,
  ): ValidationSummary {
    const validationResult = results
      .map(({ result, definition }) => {
        const definitionPath = relative(rootPath, definition.path);
        if (result.isValid) {
          return `**${definitionPath}** ✅`;
        } else {
          const errors = JSON.stringify(result.errors, null, 2);
          return `<details><summary><b>${definitionPath}</b> ❌</summary>\n\n\`\`\`json\n${errors}\n\`\`\`\n</details>`;
        }
      })
      .join('\n\n');

    const success = results.every(({ result }) => result.isValid);
    const status = success ? 'SUCCEEDED' : 'FAILED';

    return {
      message: `Metadata validation ${success ? 'successful' : 'failed'}`,
      details: `### Redocly scout: metadata validation\n\nCommit: ${commitSha}\n\n${validationResult}`,
      status,
    };
  }

  @RetryOnFail
  private async validateMetadata(
    metadata: ApiDefinitionMetadata,
  ): Promise<ValidationResult> {
    const url = `/orgs/${this.orgId}/portals/${this.portalId}/scout/metadata/validate`;

    const validationResult = await firstValueFrom(
      this.httpService
        .post<ValidationResult>(url, metadata)
        .pipe(map((res) => res.data)),
    );

    const team = DefinitionsValidationService.getTeamFromMetadata(metadata);

    if (!team && validationResult.isValid) {
      return {
        isValid: false,
        errors: [{ message: '"team" attribute is required in the x-metadata' }],
      };
    }

    return validationResult;
  }

  static getTeamFromMetadata(metadata: ApiDefinitionMetadata) {
    return metadata.team || metadata.owner;
  }
}
