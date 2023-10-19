import { File } from 'buffer';

export type Remote = {
  id: string;
};

export type RemoteConfig = {
  jobId: string;
  mountPath: string;
  mountBranchName: string;
  type: 'CICD';
  autoMerge: boolean;
};

export type CommitAuthor = {
  name: string;
  username: string;
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
  createdAt?: string;
};

export type RemoteContentUpdate = {
  jobId: string;
  jobContext?: string;
  commit: CommitDetails;
  replace: boolean;
  files: Record<string, File>;
};
