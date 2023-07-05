import { Module } from '@nestjs/common';

import { GitService } from './git.service';
import { GitAdaptersFactory } from './adapters/git-adapters-factory';
import { GitHubCloudClient } from './adapters/github/github-cloud-adapter';
import { GitHubServerClient } from './adapters/github/github-server-adapter';
import LRUCache from 'lru-cache';

@Module({
  providers: [
    GitService,
    GitAdaptersFactory,
    GitHubCloudClient,
    GitHubServerClient,
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
