export type GitLabEventHeader = 'Push Hook' | 'Merge Request Hook';

export type WebhookPayload = PushPayload | MergeRequestPayload;

export enum ObjectKind {
  Push = 'push',
  MergeRequest = 'merge_request',
}

export enum ActionType {
  Open = 'open',
  Close = 'close',
  Reopen = 'reopen',
  Update = 'update',
  Approved = 'approved',
  Unapproved = 'unapproved',
  Approval = 'approval',
  Unapproval = 'unapproval',
  Merge = 'merge',
}

export interface PushPayload {
  object_kind: ObjectKind.Push;
  before: string;
  after: string;
  ref: string;
  checkout_sha: string;
  user_id: number;
  user_name: string;
  user_username: string;
  user_email: string;
  user_avatar: string;
  project_id: number;
  project: {
    id: number;
    name: string;
    description: string;
    web_url: string;
    avatar_url: null;
    git_ssh_url: string;
    git_http_url: string;
    namespace: string;
    visibility_level: number;
    path_with_namespace: string;
    default_branch: string;
    homepage: string;
    url: string;
    ssh_url: string;
    http_url: string;
  };
  repository: {
    name: string;
    url: string;
    description: string;
    homepage: string;
    git_http_url: string;
    git_ssh_url: string;
    visibility_level: number;
  };
  commits: {
    id: string;
    message: string;
    title: string;
    timestamp: string;
    url: string;
    author: {
      name: string;
      email: string;
    };
    added: string[];
    modified: string[];
    removed: string[];
  }[];
  total_commits_count: number;
}

export interface MergeRequestPayload {
  object_kind: ObjectKind.MergeRequest;
  user: {
    name: string;
    username: string;
    avatar_url: string;
  };
  project: {
    id: number;
    name: string;
    description: string;
    web_url: string;
    avatar_url: null;
    git_ssh_url: string;
    git_http_url: string;
    namespace: string;
    visibility_level: number;
    path_with_namespace: string;
    default_branch: string;
    homepage: string;
    url: string;
    ssh_url: string;
    http_url: string;
  };
  repository: {
    name: string;
    url: string;
    description: string;
    homepage: string;
  };
  object_attributes: {
    id: number;
    target_branch: string;
    source_branch: string;
    source_project_id: number;
    author_id: number;
    assignee_id: number;
    title: string;
    created_at: string;
    updated_at: string;
    milestone_id: null;
    state: 'opened' | 'closed' | 'locked' | 'merged';
    merge_status: 'unchecked' | 'can_be_merged' | 'cannot_be_merged';
    target_project_id: number;
    iid: number;
    description: string;
    source: {
      name: string;
      description: string;
      web_url: string;
      avatar_url: null;
      git_ssh_url: string;
      git_http_url: string;
      namespace: string;
      visibility_level: number;
      path_with_namespace: string;
      default_branch: string;
      homepage: string;
      url: string;
      ssh_url: string;
      http_url: string;
    };
    target: {
      name: string;
      description: string;
      web_url: string;
      avatar_url: null;
      git_ssh_url: string;
      git_http_url: string;
      namespace: string;
      visibility_level: number;
      path_with_namespace: string;
      default_branch: string;
      homepage: string;
      url: string;
      ssh_url: string;
      http_url: string;
    };
    last_commit: {
      id: string;
      message: string;
      timestamp: string;
      url: string;
      author: {
        name: string;
        email: string;
      };
    };
    work_in_progress: boolean;
    url: string;
    action: ActionType;
    oldrev?: string; // sha of previous HEAD in case of 'update' action
    assignee: {
      name: string;
      username: string;
      avatar_url: string;
    };
  };
  labels: Record<any, any>[];
  changes: {
    updated_by_id: Record<any, any>;
    updated_at: Record<any, any>;
    labels: {
      previous: Record<any, any>[];
      current: Record<any, any>[];
    };
  };
}

export interface WebhooksListGeneric {
  id: string;
  url: string;
}

export interface DiscussionNoteSchemaExtended extends DiscussionNote {
  discussionId: string;
}

export interface CommitDiscussion {
  id: string;
  individual_note: boolean;
  notes: DiscussionNote[];
}

export interface DiscussionNote {
  id: number;
  type: 'DiffNote' | 'DiscussionNote' | null;
  body: string;
  attachment: string | null;
  author: NoteAuthor;
  created_at: string;
  updated_at: string;
  system: boolean;
  noteable_id: number;
  noteable_type: string;
  noteable_iid: number | null;
  resolvable: boolean;
}

export interface NoteAuthor {
  id: number;
  name: string;
  username: string;
  state: string;
  avatar_url: string;
  web_url: string;
}
