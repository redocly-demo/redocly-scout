import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, map } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { serialize } from 'object-to-formdata';
import { File } from 'buffer';
import { load } from 'js-yaml';
import { ConfigSchema } from '../config';
import {
  RemoteConfig,
  RemoteContentUpdate,
  Remote,
  CommitDetails,
  PushRemoteResult,
} from './types';
import { ScoutJob } from '../jobs/types';
import { getUploadTargetGroupFilesMap } from './push-files-helpers';
import {
  DefinitionUploadTarget,
  OpenApiDefinition,
} from '../api-definitions/types';
import { RetryOnFail } from '../common/decorators/retry-on-fail.decorator';
import { getValueByPath } from './get-value-by-path';
import { JOB_ID_HEADER } from '../common/constants';
import { OPENAPI_DEFINITION_EXTENSIONS } from '../api-definitions/api-definitions.service';

@Injectable()
export class RemotesService {
  readonly logger = new Logger(RemotesService.name);
  private readonly orgId: string;
  private readonly portalId: string;
  private readonly autoMerge: boolean;
  private readonly mountBranchName: string;
  private readonly jobContextTemplate: string;

  constructor(
    private config: ConfigService<ConfigSchema>,
    private readonly httpService: HttpService,
  ) {
    this.orgId = this.config.getOrThrow('REDOCLY_ORG_ID');
    this.portalId = this.config.getOrThrow('REDOCLY_PORTAL_ID');
    this.autoMerge = this.config.getOrThrow('AUTO_MERGE');
    this.mountBranchName = this.config.get('MOUNT_BRANCH_NAME', 'main');
    this.jobContextTemplate = this.config.get('REDOCLY_JOB_CONTEXT', '');
  }

  async pushUploadTargets(
    uploadTargets: DefinitionUploadTarget[],
    job: ScoutJob,
    commit: CommitDetails,
  ): Promise<PushRemoteResult[]> {
    const uploadTargetGroups = new Map<string, DefinitionUploadTarget[]>();
    for (const target of uploadTargets) {
      const groupItems = uploadTargetGroups.get(target.remoteMountPath) || [];
      uploadTargetGroups.set(target.remoteMountPath, [...groupItems, target]);
    }

    const promises = [...uploadTargetGroups].map(
      async ([remoteMountPath, targets]) => {
        const remote = await this.upsertRemote({
          jobId: job.id,
          mountPath: remoteMountPath,
          mountBranchName: this.mountBranchName,
          type: 'CICD',
          autoMerge: this.autoMerge,
        });

        const files = await getUploadTargetGroupFilesMap(targets);
        this.logger.debug(
          {
            jobId: job.id,
            files,
          },
          'Files being uploaded',
        );
        const jobContext = this.getJobContext(
          job,
          targets[0] as DefinitionUploadTarget,
        );

        const remoteContentUpdate: RemoteContentUpdate = {
          jobId: job.id,
          files,
          replace: true,
          commit,
          ...(jobContext ? { jobContext } : {}),
        };

        await this.pushRemoteContentUpdate(remote.id, remoteContentUpdate);
        const containsApiSpecs = await this.containsApiSpecs(files);

        return { remoteId: remote.id, containsApiSpecs };
      },
    );

    return await Promise.all(promises);
  }

  @RetryOnFail
  private async upsertRemote(remote: RemoteConfig): Promise<Remote> {
    const url = `/orgs/${this.orgId}/portals/${this.portalId}/remotes`;
    const headers = { [JOB_ID_HEADER]: remote.jobId };

    const upsertedRemote = await firstValueFrom(
      this.httpService
        .post<Remote>(url, remote, { headers })
        .pipe(map((res) => res.data)),
    );

    this.logger.debug({ remoteId: upsertedRemote.id }, 'Remote upserted');

    return upsertedRemote;
  }

  @RetryOnFail
  private async pushRemoteContentUpdate(
    remoteId: string,
    update: RemoteContentUpdate,
  ): Promise<void> {
    const url = `/orgs/${this.orgId}/portals/${this.portalId}/remotes/${remoteId}/push`;
    const headers = {
      'Content-Type': 'multipart/form-data',
      [JOB_ID_HEADER]: update.jobId,
    };

    const formData = serialize(update, {
      noAttributesWithArrayNotation: true,
    });

    await firstValueFrom(this.httpService.post(url, formData, { headers }));

    this.logger.debug({ remoteId }, 'Pushed files to remote');
  }

  private getJobContext(
    job: ScoutJob,
    uploadTarget: DefinitionUploadTarget,
  ): string {
    return this.jobContextTemplate
      .replace(/\{orgId}/g, job.namespaceId)
      .replace(/\{repoId}/g, job.repositoryId)
      .replace(/\{title}/g, uploadTarget.title)
      .replace(
        /{metadata\.(.+?)}/g,
        (_, path) =>
          getValueByPath(path, uploadTarget.metadata)?.toString() || '',
      );
  }

  async containsApiSpecs(files: Record<string, File>) {
    for (const [filePath, file] of Object.entries(files)) {
      if (filePath.endsWith('.wsdl')) {
        return true;
      } else if (
        OPENAPI_DEFINITION_EXTENSIONS.some((ext) => filePath.endsWith(ext))
      ) {
        try {
          const definition = load(await file.text()) as OpenApiDefinition;
          if (definition?.openapi || definition?.swagger) {
            return true;
          }
        } catch (err) {}
      }
    }

    return false;
  }
}
