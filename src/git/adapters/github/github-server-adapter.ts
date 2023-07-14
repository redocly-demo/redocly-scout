import { GitHubCloudClient } from './github-cloud-adapter';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class GitHubServerClient extends GitHubCloudClient {
  protected override logger = new Logger(GitHubServerClient.name);
  protected override getBaseUrl(): string {
    return this.config.getOrThrow('GITHUB_SERVER_URL');
  }

  protected override getBaseApiUrl(): string {
    const serverUrl = this.getBaseUrl();
    return `${serverUrl.replace(/\/$/, '')}/api/v3`;
  }
}
