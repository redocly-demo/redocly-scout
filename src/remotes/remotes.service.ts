import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, map } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { serialize } from 'object-to-formdata';
import { ConfigSchema } from '../config';
import {
  RemoteConfig,
  RemoteContentUpdate,
  Remote,
  CommitDetails,
} from './types';
import { ScoutJob } from '../jobs/types';
import { join } from 'path';
import { getUploadTargetFilesMap } from './push-files-helpers';
import { DefinitionUploadTarget } from '../api-definitions/types';
import { RetryOnFail } from '../common/decorators/retry-on-fail.decorator';
import { getValueByPath } from './get-value-by-path';

@Injectable()
export class RemotesService {
  readonly logger = new Logger(RemotesService.name);
  private readonly orgId: string;
  private readonly portalId: string;
  private readonly autoMerge: boolean;
  private readonly mountBranchName: string;

  constructor(
    private config: ConfigService<ConfigSchema>,
    private readonly httpService: HttpService,
  ) {
    this.orgId = this.config.getOrThrow('REDOCLY_ORG_ID');
    this.portalId = this.config.getOrThrow('REDOCLY_PORTAL_ID');
    this.autoMerge = this.config.getOrThrow('AUTO_MERGE');
    this.mountBranchName = this.config.get('MOUNT_BRANCH_NAME', 'main');
  }

  async pushUploadTargets(
    uploadTargets: DefinitionUploadTarget[],
    job: ScoutJob,
    commit: CommitDetails,
  ) {
    const promises = uploadTargets.map(async (target) => {
      const apiFolder = this.config.getOrThrow('REDOCLY_DEST_FOLDER_PATH');
      const mountPath = this.getMountPath(apiFolder, target, job);
      const remote = await this.upsertRemote({
        mountPath,
        mountBranchName: this.mountBranchName,
        type: 'CICD',
        autoMerge: this.autoMerge,
      });
      const files = getUploadTargetFilesMap(target);
      const remoteContentUpdate: RemoteContentUpdate = {
        jobId: job.id,
        files,
        replace: true,
        commit,
      };

      return this.pushRemoteContentUpdate(remote.id, remoteContentUpdate);
    });

    await Promise.all(promises);
  }

  @RetryOnFail
  private async upsertRemote(remote: RemoteConfig): Promise<Remote> {
    const url = `/orgs/${this.orgId}/portals/${this.portalId}/remotes`;

    const upsertedRemote = await firstValueFrom(
      this.httpService.post<Remote>(url, remote).pipe(map((res) => res.data)),
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
    const headers = { 'Content-Type': 'multipart/form-data' };

    const formData = serialize(update, {
      noAttributesWithArrayNotation: true,
    });

    await firstValueFrom(this.httpService.post(url, formData, { headers }));

    this.logger.debug({ remoteId }, 'Pushed files to remote');
  }

  getMountPath(
    apiFolder: string,
    definition: DefinitionUploadTarget,
    job: ScoutJob,
  ) {
    const version = definition.isVersioned ? '' : '@latest';
    const path = apiFolder
      .replace(/\{orgId}/g, job.namespaceId)
      .replace(/\{repoId}/g, job.repositoryId)
      .replace(/\{title}/g, definition.title)
      .replace(
        /{metadata\.(.+?)}/g,
        (_, path) =>
          getValueByPath(path, definition.metadata)?.toString() || '',
      );
    return join(path, version).replace(/^\//, '').replace(/\/$/, '');
  }
}
