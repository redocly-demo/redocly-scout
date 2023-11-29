import { GithubConfigSchema } from '../../../config';
import { GitHubServerClient } from './github-server-adapter';
import { Injectable, Logger } from '@nestjs/common';

const GITHUB_CLOUD_URL = 'https://github.com';
const GITHUB_CLOUD_API_URL = 'https://api.github.com';

@Injectable()
export class GitHubCloudClient extends GitHubServerClient {
  protected override logger = new Logger(GitHubCloudClient.name);

  protected override Legacy_getDefaultProviderConfig() {
    return {
      url: GITHUB_CLOUD_URL,
      appId: this.config.getOrThrow('GITHUB_APP_ID'),
      appUserId: this.config.getOrThrow('GITHUB_APP_USER_ID'),
      privateKey: this.config.getOrThrow('GITHUB_PRIVATE_KEY'),
      webhookSecret: this.config.getOrThrow('GITHUB_WEBHOOK_SECRET'),
    };
  }

  protected override getProviderConfig(
    providerId: string,
  ): GithubConfigSchema & { url: string } {
    if (!providerId) {
      return this.Legacy_getDefaultProviderConfig();
    }

    const providers =
      this.config.getOrThrow<GithubConfigSchema[]>('GITHUB_PROVIDERS');

    const provider = providers.find(({ appId }) => appId === providerId);

    if (provider) {
      return {
        ...provider,
        url: GITHUB_CLOUD_URL,
      };
    }

    const Legacy_githubAppId = this.config.get('GITHUB_APP_ID');
    if (Legacy_githubAppId === providerId) {
      return this.Legacy_getDefaultProviderConfig();
    }

    throw new Error(
      `Could not find github provider configuration for appId: ${providerId}`,
    );
  }

  protected override getBaseApiUrl() {
    return GITHUB_CLOUD_API_URL;
  }
}
