export type GitLabCommitState =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'canceled';

export interface GitLabApiClientOptions {
  defaultHost?: boolean;
  timeout?: number;
}
