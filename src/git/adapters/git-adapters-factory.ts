import { Injectable } from '@nestjs/common';
import { GitAdapter, GitProvider } from './types';
import { GitHubCloudClient } from './github/github-cloud-adapter';
import { GitHubServerClient } from './github/github-server-adapter';
import { GitLabSelfManagedClient } from './gitlab/gitlab-self-managed-adapter';
import { GitLabCloudClient } from './gitlab/gitlab-cloud-adapter';

@Injectable()
export class GitAdaptersFactory {
  constructor(
    private readonly githubCloudAdapter: GitHubCloudClient,
    private readonly githubServerAdapter: GitHubServerClient,
    private readonly gitLabSelfManagedAdapter: GitLabSelfManagedClient,
    private readonly gitLabCloudAdapter: GitLabCloudClient,
  ) {}

  getAdapter(provider: GitProvider): GitAdapter {
    switch (provider) {
      case 'GITHUB_CLOUD':
        return this.githubCloudAdapter;
      case 'GITHUB_SERVER':
        return this.githubServerAdapter;
      case 'GITLAB_SELF_MANAGED':
        return this.gitLabSelfManagedAdapter;
      case 'GITLAB_CLOUD':
        return this.gitLabCloudAdapter;
      default:
        throw Error('Unknown git provider');
    }
  }
}
