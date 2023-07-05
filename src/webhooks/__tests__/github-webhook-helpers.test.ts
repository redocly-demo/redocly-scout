import { GenericWebhookEvent } from '../../git/adapters/types';
import { shouldHandleWebhook } from '../github-webhook-helpers';

describe('shouldHandleWebhook', () => {
  it('should return true when push to main branch', () => {
    const webhookPayload = {
      type: 'push',
      source: {
        branchName: 'main',
      },
      isMainBranch: true,
    } as GenericWebhookEvent;

    expect(shouldHandleWebhook(webhookPayload)).toBeTruthy();
  });

  it('should return false when push to not main branch', () => {
    const webhookPayload = {
      type: 'push',
      source: {
        branchName: 'chore/test',
      },
      isMainBranch: false,
    } as GenericWebhookEvent;

    expect(shouldHandleWebhook(webhookPayload)).toBeFalsy();
  });

  it('should return true for pull_request.opened event', () => {
    const webhookPayload = {
      type: 'pull_request.opened',
    } as GenericWebhookEvent;

    expect(shouldHandleWebhook(webhookPayload)).toBeTruthy();
  });

  it('should return false for pull_request.assigned event', () => {
    const webhookPayload = {
      type: 'pull_request.assigned',
    } as GenericWebhookEvent;

    expect(shouldHandleWebhook(webhookPayload)).toBeFalsy();
  });

  it('should return false for delete event', () => {
    const webhookPayload = {
      type: 'delete',
    } as GenericWebhookEvent;

    expect(shouldHandleWebhook(webhookPayload)).toBeFalsy();
  });
});
