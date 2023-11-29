import { Injectable } from '@nestjs/common';

import { GitlabConfigSchema } from '../../../config';
import { GitLabSelfManagedClient } from './gitlab-self-managed-adapter';

const GITLAB_CLOUD_URL = 'https://gitlab.com';

@Injectable()
export class GitLabCloudClient extends GitLabSelfManagedClient {
  protected override getProviderConfig() {
    const providersConfigs =
      this.config.getOrThrow<GitlabConfigSchema[]>('GITLAB_PROVIDERS');

    const providerConfig = providersConfigs.find(
      ({ url }) => !url || new URL(url).host === new URL(GITLAB_CLOUD_URL).host,
    );

    if (!providerConfig) {
      throw new Error(`Missing config for provider: ${GITLAB_CLOUD_URL}`);
    }

    return {
      ...providerConfig,
      url: GITLAB_CLOUD_URL,
    };
  }
}
