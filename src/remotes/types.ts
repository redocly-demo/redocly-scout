import { File } from 'buffer';

export type Remote = {
  id: string;
};

export type RemoteConfig = {
  mountPath: string;
  mountBranchName: string;
  type: 'CICD';
  autoMerge: boolean;
};

export type CommitAuthor = {
  name: string;
  email: string;
  image: string;
};

export type CommitDetails = {
  namespaceId: string;
  repositoryId: string;
  branchName: string;
  message: string;
  url: string;
  author: CommitAuthor;
};

export type RemoteContentUpdate = {
  jobId: string;
  commit: CommitDetails;
  replace: boolean;
  files: Record<string, File>;
};
