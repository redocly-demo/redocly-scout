import { Injectable } from '@nestjs/common';
import { GitAdapter, GitProvider } from './types';
import { GitHubCloudClient } from './github/github-cloud-adapter';
import { GitHubServerClient } from './github/github-server-adapter';

@Injectable()
export class GitAdaptersFactory {
  constructor(
    private readonly githubCloudAdapter: GitHubCloudClient,
    private readonly githubServerAdapter: GitHubServerClient,
  ) {}

  getAdapter(provider: GitProvider): GitAdapter {
    switch (provider) {
      case 'GITHUB_CLOUD':
        return this.githubCloudAdapter;
      case 'GITHUB_SERVER':
        return this.githubServerAdapter;
      default:
        throw Error('Unknown git provider');
    }
  }
}
