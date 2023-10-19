import { z } from 'zod';
import { GitProviderTypeSchema } from '../../jobs/zod-schemas/scout-job';
import { CommitCheck } from '../../jobs/types';
import { CommitDetails } from '../../remotes/types';

export type GitProvider = z.infer<typeof GitProviderTypeSchema>;

export type ContentSource = {
  providerType: GitProvider;
  namespaceId: string;
  repositoryId: string;
  branchName: string;
};

export type Commit = {
  sha: string;
  message?: string | undefined;
};

export interface GenericWebhookEvent {
  type: string;
  source: ContentSource;
  commit: Commit;
  prId?: string;
  isMainBranch: boolean;
}

export interface GitAdapter {
  getCloneUrl(sourceDetails: ContentSource): Promise<string>;
  upsertCommitStatuses(
    commitSha: string,
    checks: CommitCheck[],
    sourceDetails: ContentSource,
  ): Promise<void>;
  getCommitDetails(
    commitSha: string,
    sourceDetails: ContentSource,
  ): Promise<CommitDetails>;
  upsertSummaryComment(
    text: string,
    sourceDetails: ContentSource,
    commitSha: string,
    prId?: string,
    override?: boolean,
  ): Promise<void>;
  getSummaryComment(
    sourceDetails: ContentSource,
    commitSha: string,
    prId?: string,
  ): Promise<string>;
  checkConnectivity(): Promise<boolean>;
}
