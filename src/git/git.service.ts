import fs from 'node:fs/promises';
import { Injectable, Logger } from '@nestjs/common';
import { ContentSource, GitProvider } from './adapters/types';
import { simpleGit } from 'simple-git';
import { CommitCheck } from '../jobs/types';
import { CommitDetails } from '../remotes/types';
import { GitAdaptersFactory } from './adapters/git-adapters-factory';
import { RetryOnFail } from '../common/decorators/retry-on-fail.decorator';
import { ConfigService } from '@nestjs/config';
import { ConfigSchema, GithubConfigSchema } from '../config';

@Injectable()
export class GitService {
  readonly logger = new Logger(GitService.name);
  constructor(
    private readonly config: ConfigService<ConfigSchema>,
    private readonly gitAdaptersFactory: GitAdaptersFactory,
  ) {}

  getGit(baseDir: string) {
    return simpleGit({ maxConcurrentProcesses: 1, baseDir });
  }

  @RetryOnFail
  async checkout(
    sourceDetails: ContentSource,
    prId: string | undefined,
    commitSha: string,
    repositoryPath: string,
  ) {
    try {
      const { namespaceId, repositoryId, branchName } = sourceDetails;
      const gitAdapter = this.gitAdaptersFactory.getAdapter(
        sourceDetails.providerType,
      );
      const cloneUrl = await gitAdapter.getCloneUrl(sourceDetails);

      const git = this.getGit(repositoryPath);

      // Clone branch and checkout to selected commit
      await git.clone(cloneUrl, repositoryPath, ['--depth=1']);
      this.logger.debug(
        { namespaceId, repositoryId, branchName },
        'Repository cloned',
      );

      const ref = prId ? gitAdapter.getPRRef(prId) : branchName;
      await git.fetch('origin', ref);
      this.logger.debug(
        { namespaceId, repositoryId, branchName, ref },
        'Ref fetched',
      );

      await git.checkout(commitSha);
      this.logger.debug(
        { commitSha, namespaceId, repositoryId, branchName },
        'Checkout to commit',
      );
    } catch (error) {
      // Clean up repository folder if checkout failed
      await fs.rm(repositoryPath, { recursive: true, force: true });
      await fs.mkdir(repositoryPath, { recursive: true });
      throw error;
    }
  }

  @RetryOnFail
  async upsertCommitStatuses(
    commitSha: string,
    checks: CommitCheck[],
    sourceDetails: ContentSource,
  ): Promise<void> {
    const { namespaceId, repositoryId, branchName } = sourceDetails;
    const gitAdapter = this.gitAdaptersFactory.getAdapter(
      sourceDetails.providerType,
    );

    await gitAdapter.upsertCommitStatuses(commitSha, checks, sourceDetails);

    this.logger.debug(
      { commitSha, namespaceId, repositoryId, branchName, checks },
      'Commit statuses upserted',
    );
  }

  @RetryOnFail
  async getCommitDetails(
    commitSha: string,
    sourceDetails: ContentSource,
  ): Promise<CommitDetails> {
    const { namespaceId, repositoryId, branchName } = sourceDetails;
    const gitAdapter = this.gitAdaptersFactory.getAdapter(
      sourceDetails.providerType,
    );

    const commitDetails = gitAdapter.getCommitDetails(commitSha, sourceDetails);

    this.logger.debug(
      { commitSha, namespaceId, repositoryId, branchName },
      'Commit details fetched',
    );

    return commitDetails;
  }

  @RetryOnFail
  public async upsertSummaryComment(
    text: string,
    sourceDetails: ContentSource,
    commitSha: string,
    prId?: string,
    override?: boolean,
  ) {
    const { namespaceId, repositoryId, branchName } = sourceDetails;
    const gitAdapter = this.gitAdaptersFactory.getAdapter(
      sourceDetails.providerType,
    );
    await gitAdapter.upsertSummaryComment(
      text,
      sourceDetails,
      commitSha,
      prId,
      override,
    );

    this.logger.debug(
      { commitSha, namespaceId, repositoryId, branchName, prId },
      'Validation summary published',
    );
  }

  public async checkConnectivity() {
    const githubProviders =
      this.config.getOrThrow<GithubConfigSchema[]>('GITHUB_PROVIDERS');

    for (const { appId, url } of githubProviders) {
      const provider: GitProvider = url ? 'GITHUB_SERVER' : 'GITHUB_CLOUD';
      const gitAdapter = this.gitAdaptersFactory.getAdapter(provider);

      await gitAdapter.checkConnectivity(appId);
    }

    const Legacy_githubAppId = this.config.get('GITHUB_APP_ID');
    if (Legacy_githubAppId) {
      const Legacy_githubServerUrl = this.config.get('GITHUB_SERVER_URL');
      const provider: GitProvider = Legacy_githubServerUrl
        ? 'GITHUB_SERVER'
        : 'GITHUB_CLOUD';
      const gitAdapter = this.gitAdaptersFactory.getAdapter(provider);

      await gitAdapter.checkConnectivity(Legacy_githubServerUrl);
    }
  }

  public async getSummaryComment(
    sourceDetails: ContentSource,
    commitSha: string,
    prId?: string,
  ): Promise<string> {
    const gitAdapter = this.gitAdaptersFactory.getAdapter(
      sourceDetails.providerType,
    );

    return gitAdapter.getSummaryComment(sourceDetails, commitSha, prId);
  }
}
