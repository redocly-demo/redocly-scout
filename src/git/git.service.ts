import { Injectable, Logger } from '@nestjs/common';
import { ContentSource } from './adapters/types';
import { simpleGit } from 'simple-git';
import { CommitCheck } from '../jobs/types';
import { CommitDetails } from '../remotes/types';
import { GitAdaptersFactory } from './adapters/git-adapters-factory';
import { RetryOnFail } from '../common/decorators/retry-on-fail.decorator';

@Injectable()
export class GitService {
  readonly logger = new Logger(GitService.name);
  constructor(private readonly gitAdaptersFactory: GitAdaptersFactory) {}

  getGit(baseDir: string) {
    return simpleGit({ maxConcurrentProcesses: 1, baseDir });
  }

  @RetryOnFail
  async checkout(
    sourceDetails: ContentSource,
    commitSha: string,
    repositoryPath: string,
  ) {
    const { namespaceId, repositoryId, branchName } = sourceDetails;
    const gitAdapter = this.gitAdaptersFactory.getAdapter(
      sourceDetails.providerType,
    );
    const cloneUrl = await gitAdapter.getCloneUrl(sourceDetails);

    const git = this.getGit(repositoryPath);

    // Clone branch and checkout to selected commit
    await git.clone(cloneUrl, repositoryPath, [
      '-b',
      branchName,
      '--single-branch',
    ]);
    this.logger.debug(
      { namespaceId, repositoryId, branchName },
      'Repository cloned',
    );

    await git.checkout(commitSha);
    this.logger.debug(
      { commitSha, namespaceId, repositoryId, branchName },
      'Checkout to commit',
    );
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
  ) {
    const { namespaceId, repositoryId, branchName } = sourceDetails;
    const gitAdapter = this.gitAdaptersFactory.getAdapter(
      sourceDetails.providerType,
    );
    await gitAdapter.upsertSummaryComment(text, sourceDetails, commitSha, prId);

    this.logger.debug(
      { commitSha, namespaceId, repositoryId, branchName, prId },
      'Validation summary published',
    );
  }
}
