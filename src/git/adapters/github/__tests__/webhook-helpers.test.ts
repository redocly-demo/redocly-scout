import { GitHubWebhookHelpers } from '../webhook-helpers';

import pushEvent from './fixtures/pushEventPayload.json';
import pullRequestReopenedEvent from './fixtures/pullRequestReopenedEventPayload.json';
import { WebhookEvent } from '@octokit/webhooks-types';
import { GenericWebhookEvent } from '../../types';

describe('convertWebhookToGenericEvent', () => {
  it('should convert push event', () => {
    const result = GitHubWebhookHelpers.convertWebhookToGenericEvent(
      'push',
      pushEvent as WebhookEvent,
      '123',
    );

    expect(result).toEqual(
      expect.objectContaining({
        type: 'push',
        source: {
          namespaceId: 'John',
          repositoryId: 'repo-name',
          branchName: 'main',
          providerId: '123',
          providerType: 'GITHUB_CLOUD',
        },
        commit: {
          sha: 'dd2c301ac65043128a66fb5b657feebf83778e8048f3af2be80bd20f27df8786',
          message: 'Initial commit',
        },
        isMainBranch: true,
      }),
    );
  });

  it('should convert pull_request event', () => {
    const result = GitHubWebhookHelpers.convertWebhookToGenericEvent(
      'pull_request',
      pullRequestReopenedEvent as WebhookEvent,
      '123',
    );

    expect(result).toEqual(
      expect.objectContaining({
        type: 'pull_request.reopened',
        source: {
          namespaceId: 'John',
          repositoryId: 'repo-name',
          branchName: 'chore/test',
          providerId: '123',
          providerType: 'GITHUB_CLOUD',
        },
        commit: {
          sha: 'dd2c301ac65043128a66fb5b657feebf83778e8048f3af2be80bd20f27df8786',
        },
        isMainBranch: false,
        prId: '1',
      }),
    );
  });
});

describe('shouldHandleWebhook', () => {
  it('should return true when push to main branch', () => {
    const webhookPayload = {
      type: 'push',
      source: {
        branchName: 'main',
      },
      isMainBranch: true,
    } as GenericWebhookEvent;

    expect(
      GitHubWebhookHelpers.shouldHandleWebhook(webhookPayload),
    ).toBeTruthy();
  });

  it('should return false when push to not main branch', () => {
    const webhookPayload = {
      type: 'push',
      source: {
        branchName: 'chore/test',
      },
      isMainBranch: false,
    } as GenericWebhookEvent;

    expect(
      GitHubWebhookHelpers.shouldHandleWebhook(webhookPayload),
    ).toBeFalsy();
  });

  it('should return true for pull_request.opened event', () => {
    const webhookPayload = {
      type: 'pull_request.opened',
    } as GenericWebhookEvent;

    expect(
      GitHubWebhookHelpers.shouldHandleWebhook(webhookPayload),
    ).toBeTruthy();
  });

  it('should return false for pull_request.assigned event', () => {
    const webhookPayload = {
      type: 'pull_request.assigned',
    } as GenericWebhookEvent;

    expect(
      GitHubWebhookHelpers.shouldHandleWebhook(webhookPayload),
    ).toBeFalsy();
  });

  it('should return false for delete event', () => {
    const webhookPayload = {
      type: 'delete',
    } as GenericWebhookEvent;

    expect(
      GitHubWebhookHelpers.shouldHandleWebhook(webhookPayload),
    ).toBeFalsy();
  });
});
