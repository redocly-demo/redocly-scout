import { Module } from '@nestjs/common';

import { GitService } from './git.service';
import { GitAdaptersFactory } from './adapters/git-adapters-factory';
import { GitHubCloudClient } from './adapters/github/github-cloud-adapter';
import { GitHubServerClient } from './adapters/github/github-server-adapter';
import LRUCache from 'lru-cache';
import { GitLabSelfManagedClient } from './adapters/gitlab/gitlab-self-managed-adapter';
import { HttpModule } from '@nestjs/axios';
import { GitLabCloudClient } from './adapters/gitlab/gitlab-cloud-adapter';

@Module({
  imports: [HttpModule],
  providers: [
    GitService,
    GitAdaptersFactory,
    GitHubCloudClient,
    GitHubServerClient,
    GitLabSelfManagedClient,
    GitLabCloudClient,
    {
      provide: 'LRUCache',
      useValue: new LRUCache({
        max: 1024,
        ttl: 60 * 60 * 1000, // 1 hour
        updateAgeOnGet: true,
        ttlAutopurge: true,
      }),
    },
  ],
  exports: [GitService],
})
export class GitModule {}
