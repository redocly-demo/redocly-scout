import { WebhookEvent, WebhookEventName } from '@octokit/webhooks-types';

import type { GenericWebhookEvent, GitProvider } from '../../types';

export function convertWebhookToGenericEvent(
  event: WebhookEventName,
  payload: WebhookEvent,
  appId: string,
): GenericWebhookEvent | undefined {
  switch (event) {
    case 'push':
      return parsePushEvent(event, payload, appId);
    case 'pull_request':
      return parsePullRequestEvent(event, payload, appId);
    default:
      return;
  }
}

export function parsePushEvent(
  event: WebhookEventName,
  payload: WebhookEvent,
  appId: string,
): GenericWebhookEvent | undefined {
  if ('pusher' in payload && payload.installation?.id) {
    const branchName = payload.ref.replace('refs/heads/', '');
    const mainBranchName =
      payload.repository.master_branch || payload.repository.default_branch;
    return {
      type: event,
      source: {
        providerId: appId,
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
  appId: string,
): GenericWebhookEvent | undefined {
  if ('number' in payload && payload.installation?.id) {
    const head = payload.pull_request.head;
    const base = payload.pull_request.base;
    const isCrossRepo = head.repo?.full_name !== base.repo?.full_name;

    return {
      type: `${event}.${payload.action}`,
      source: {
        providerId: appId,
        providerType: getProviderTypeByUrl(payload.repository.git_url),
        namespaceId: payload.repository.owner.login,
        repositoryId: payload.repository.name,
        // for forks, use label which is owner:branchName turned into owner/branchName
        branchName: isCrossRepo ? head.label.replace(':', '/') : head.ref,
      },
      commit: {
        sha: head.sha,
      },
      prId: payload.pull_request.number.toString(),
      isMainBranch: false,
    };
  }
  return;
}

export function shouldHandleWebhook(webhook: GenericWebhookEvent) {
  switch (webhook.type) {
    case 'push':
      return webhook.isMainBranch;
    case 'pull_request.opened':
    case 'pull_request.reopened':
    case 'pull_request.synchronize':
      return true;
    default:
      return false;
  }
}

function getProviderTypeByUrl(repositoryUrl: string): GitProvider {
  const url = new URL(repositoryUrl);
  return url.host === 'github.com' ? 'GITHUB_CLOUD' : 'GITHUB_SERVER';
}
