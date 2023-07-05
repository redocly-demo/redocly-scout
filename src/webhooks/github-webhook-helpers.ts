import { GenericWebhookEvent } from '../git/adapters/types';

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
