import { WebhookEvent, WebhookEventName } from '@octokit/webhooks-types';

import type { GenericWebhookEvent, GitProvider } from '../types';

export function convertWebhookToGenericEvent(
  event: WebhookEventName,
  payload: WebhookEvent,
): GenericWebhookEvent | undefined {
  switch (event) {
    case 'push':
      return parsePushEvent(event, payload);
    case 'pull_request':
      return parsePullRequestEvent(event, payload);
    default:
      return;
  }
}

export function parsePushEvent(
  event: WebhookEventName,
  payload: WebhookEvent,
): GenericWebhookEvent | undefined {
  if ('pusher' in payload && payload.installation?.id) {
    const branchName = payload.ref.replace('refs/heads/', '');
    const mainBranchName =
      payload.repository.master_branch || payload.repository.default_branch;
    return {
      type: event,
      source: {
        providerType: getProviderTypeByUrl(payload.repository.git_url),
        namespaceId: payload.repository.owner.login,
        repositoryId: payload.repository.name,
        branchName,
      },
      commit: {
        sha: payload.after,
        message: payload.head_commit?.message,
      },
      isMainBranch: branchName === mainBranchName,
    };
  }
  return;
}

export function parsePullRequestEvent(
  event: WebhookEventName,
  payload: WebhookEvent,
): GenericWebhookEvent | undefined {
  if ('number' in payload && payload.installation?.id) {
    const branchName = payload.pull_request.head.ref;
    const mainBranchName =
      payload.repository.master_branch || payload.repository.default_branch;
    return {
      type: `${event}.${payload.action}`,
      source: {
        providerType: getProviderTypeByUrl(payload.repository.git_url),
        namespaceId: payload.repository.owner.login,
        repositoryId: payload.repository.name,
        branchName: branchName,
      },
      commit: {
        sha: payload.pull_request.head.sha,
      },
      prId: payload.pull_request.number.toString(),
      isMainBranch: branchName === mainBranchName,
    };
  }
  return;
}

function getProviderTypeByUrl(repositoryUrl: string): GitProvider {
  const url = new URL(repositoryUrl);
  return url.host === 'github.com' ? 'GITHUB_CLOUD' : 'GITHUB_SERVER';
}
