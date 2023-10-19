import { Injectable, Logger } from '@nestjs/common';
import {
  ApiDefinitionMetadata,
  DefinitionDiscoveryResult,
  DefinitionValidationResult,
  DiscoveredDefinition,
  ValidationError,
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
import { getValueByPath } from '../remotes/get-value-by-path';
import { JOB_ID_HEADER } from '../common/constants';

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
    jobId: string,
    definitions: DiscoveredDefinition[],
  ): Promise<DefinitionValidationResult[]> {
    return Promise.all(
      definitions.map(async (definition) => {
        const result = await this.validateMetadata(jobId, definition.metadata);
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
    validationResults: DefinitionValidationResult[],
    discoveryResult: DefinitionDiscoveryResult,
    job: ScoutJob,
    jobWorkDir: string,
  ) {
    const sourceDetails = {
      providerType: job.providerType,
      namespaceId: job.namespaceId,
      repositoryId: job.repositoryId,
      branchName: job.branch,
    };

    const { status, details, message } = this.getValidationSummary(
      validationResults,
      discoveryResult,
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

  getValidationSummary(
    results: DefinitionValidationResult[],
    discoveryResult: DefinitionDiscoveryResult,
    commitSha: string,
    rootPath: string,
  ): ValidationSummary {
    const filesDetails = results.map((result) =>
      this.getValidationResultMessage(result, rootPath),
    );

    const detailsHeader = `### Redocly scout\n\nCommit: ${commitSha}\n\n## Metadata validation\n\n`;

    if (results.length > 0) {
      const success = results.every(({ result }) => result.isValid);

      return {
        message: `Metadata validation ${success ? 'successful' : 'failed'}`,
        details: `${detailsHeader}${filesDetails.join('\n\n')}`,
        status: success ? 'SUCCEEDED' : 'FAILED',
      };
    }

    if (!this.config.get('REDOCLY_METADATA_REQUIRED')) {
      const apiFolder = this.config.get('API_FOLDER');
      return {
        message: `Metadata validation skipped`,
        details: discoveryResult.isApiFolderMissing
          ? `${detailsHeader}APIs folder \`${apiFolder}\` not found`
          : `${detailsHeader}APIs not found`,
        status: 'SUCCEEDED',
      };
    }

    if (discoveryResult.isApiFolderMissing) {
      const apiFolder = this.config.get('API_FOLDER');
      return {
        message: `APIs folder not found`,
        details: `${detailsHeader}APIs folder \`${apiFolder}\` not found`,
        status: 'FAILED',
      };
    }

    // there is no redocly.yaml
    if (!discoveryResult.hasRedoclyConfig) {
      return {
        message: `redocly.yaml file not found`,
        details: `${detailsHeader}redocly.yaml file not found`,
        status: 'FAILED',
      };
    }

    // there is redocly.yaml but without metadata
    return {
      message: `metadata.yaml not found`,
      details: `${detailsHeader}metadata.yaml not found`,
      status: 'FAILED',
    };
  }

  private getValidationResultMessage(
    { result, definition }: DefinitionValidationResult,
    rootPath: string,
  ): string {
    const definitionPath = relative(rootPath, definition.path);
    const warning = definition.empty
      ? '\n\n>[!WARNING]\n>API spec file not found'
      : '';

    if (result.isValid) {
      return `**${definitionPath}** ✅${warning}`;
    }
    const errors = JSON.stringify(result.errors, null, 2);
    return `<details><summary><b>${definitionPath}</b> ❌</summary>\n\n\`\`\`json\n${errors}\n\`\`\`\n</details>${warning}`;
  }

  @RetryOnFail
  private async validateMetadata(
    jobId: string,
    metadata: ApiDefinitionMetadata,
  ): Promise<ValidationResult> {
    const url = `/orgs/${this.orgId}/portals/${this.portalId}/scout/metadata/validate`;
    const headers = { [JOB_ID_HEADER]: jobId };

    const schemaValidationResult = await firstValueFrom(
      this.httpService
        .post<ValidationResult>(url, metadata, { headers })
        .pipe(map((res) => res.data)),
    );

    const metadataVariablesValidationResult =
      this.validateMountPathMetadataVariables(metadata);

    let isValid = true;
    const errors: ValidationError[] = [];

    if (!schemaValidationResult.isValid) {
      isValid = false;
      errors.push(...(schemaValidationResult.errors || []));
    }

    if (!metadataVariablesValidationResult.isValid) {
      isValid = false;
      errors.push(...(metadataVariablesValidationResult.errors || []));
    }

    return { isValid, errors };
  }

  private validateMountPathMetadataVariables(
    metadata: ApiDefinitionMetadata,
  ): ValidationResult {
    const variablesMatches = this.config
      .getOrThrow('REDOCLY_DEST_FOLDER_PATH')
      .matchAll(/{metadata\.(.+?)}/g);

    const variables = [...variablesMatches].map(([_, field]) => ({
      title: field,
      value: getValueByPath(field, metadata),
    }));

    const emptyVariables = variables.filter(
      ({ value }) => value === null || value === undefined,
    );
    const invalidVariables = variables.filter(
      ({ value }) => typeof value === 'object' && value !== null,
    );

    return {
      isValid: ![...emptyVariables, ...invalidVariables].length,
      errors: [
        ...emptyVariables.map(({ title }) => ({
          message: `"${title}" metadata attribute is required`,
        })),
        ...invalidVariables.map(({ title }) => ({
          message: `"${title}" metadata attribute should not be an object`,
        })),
      ],
    };
  }
}
