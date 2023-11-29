import type { GenericWebhookEvent, GitProvider } from '../../types';
import { GitLabApiTypes } from '../../gitlab/api-types';

export function convertWebhookToGenericEvent(
  event: GitLabApiTypes.GitLabEventHeader,
  payload: GitLabApiTypes.WebhookPayload,
): GenericWebhookEvent | undefined {
  switch (event) {
    case 'Push Hook':
      return parsePushEvent(payload as GitLabApiTypes.PushPayload);
    case 'Merge Request Hook':
      return parseMergeRequestEvent(
        payload as GitLabApiTypes.MergeRequestPayload,
      );
    default:
      return;
  }
}

export function parsePushEvent(
  payload: GitLabApiTypes.PushPayload,
): GenericWebhookEvent | undefined {
  const branchName = payload.ref.replace('refs/heads/', '');
  const mainBranchName = payload.project.default_branch;

  return {
    type: 'push',
    source: {
      providerId: new URL(payload.project.web_url).origin,
      providerType: getProviderTypeByUrl(payload.project.git_http_url),
      namespaceId: payload.project.namespace.replace(' ', '-'),
      repositoryId: payload.project.id.toString(),
      branchName,
    },
    commit: {
      sha: payload.after,
      message: payload.commits[0]?.message,
    },
    isMainBranch: branchName === mainBranchName,
  };
}

export function parseMergeRequestEvent(
  payload: GitLabApiTypes.MergeRequestPayload,
): GenericWebhookEvent | undefined {
  return {
    type: `pull_request.${payload.object_attributes.action}`,
    source: {
      providerId: new URL(payload.project.web_url).origin,
      providerType: getProviderTypeByUrl(payload.repository.homepage),
      namespaceId: payload.object_attributes.source.namespace.replace(' ', '-'),
      repositoryId: payload.project.id.toString(),
      branchName: getMRBranchName(payload),
    },
    commit: {
      sha: payload.object_attributes.last_commit.id,
    },
    prId: payload.object_attributes.iid.toString(),
    isMainBranch: false,
  };
}

export function shouldHandleWebhook(webhook: GenericWebhookEvent) {
  switch (webhook.type) {
    case 'push':
      return webhook.isMainBranch;
    case 'pull_request.open':
    case 'pull_request.reopen':
    case 'pull_request.update':
      return true;
    default:
      return false;
  }
}

function getProviderTypeByUrl(repositoryUrl: string): GitProvider {
  const url = new URL(repositoryUrl);
  return url.host === 'gitlab.com' ? 'GITLAB_CLOUD' : 'GITLAB_SELF_MANAGED';
}

function getMRBranchName(payload: GitLabApiTypes.MergeRequestPayload): string {
  const isCrossRepo =
    payload.object_attributes.source.path_with_namespace !==
    payload.object_attributes.target.path_with_namespace;

  const sourceBranch = payload.object_attributes.source_branch;

  if (isCrossRepo) {
    return `${payload.object_attributes.source.namespace.replace(
      ' ',
      '-',
    )}/${sourceBranch}`;
  }

  return sourceBranch;
}
