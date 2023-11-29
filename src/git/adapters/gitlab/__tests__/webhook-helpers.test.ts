import { GitLabWebhookHelpers } from '../webhook-helpers';

import pushEvent from './fixtures/pushEventPayload.json';
import mergeRequestDifferentRepositoriesEvent from './fixtures/mergeRequestDifferentRepositoriesPayload.json';
import mergeRequestReopenEvent from './fixtures/mergeRequestReopenEventPayload.json';
import { GitLabApiTypes } from '../api-types';
import { GenericWebhookEvent } from '../../types';

describe('convertWebhookToGenericEvent', () => {
  it('should convert Push Hook event', () => {
    const result = GitLabWebhookHelpers.convertWebhookToGenericEvent(
      'Push Hook',
      pushEvent as GitLabApiTypes.WebhookPayload,
    );

    expect(result).toEqual(
      expect.objectContaining({
        type: 'push',
        source: {
          providerId: 'http://gitlab.com',
          namespaceId: 'mike',
          repositoryId: '1',
          branchName: 'targetBranch',
          providerType: 'GITLAB_SELF_MANAGED',
        },
        commit: {
          sha: 'da1560886d4f094c3e6c9ef40349f7d38b5d27d7',
          message: 'Update example file',
        },
        isMainBranch: false,
      }),
    );
  });

  it('should convert Merge Request Hook event', () => {
    const result = GitLabWebhookHelpers.convertWebhookToGenericEvent(
      'Merge Request Hook',
      mergeRequestReopenEvent as GitLabApiTypes.WebhookPayload,
    );

    expect(result).toEqual(
      expect.objectContaining({
        type: 'pull_request.reopen',
        source: {
          providerId: 'http://gitlab.com',
          namespaceId: 'gitlab-namespace',
          repositoryId: '1',
          branchName: 'ms-viewport',
          providerType: 'GITLAB_CLOUD',
        },
        commit: {
          sha: 'da1560886d4f094c3e6c9ef40349f7d38b5d27d7',
        },
        isMainBranch: false,
        prId: '1',
      }),
    );
  });

  it('should convert Merge Request Hook event - different source and target repositories', () => {
    const result = GitLabWebhookHelpers.convertWebhookToGenericEvent(
      'Merge Request Hook',
      mergeRequestDifferentRepositoriesEvent as GitLabApiTypes.WebhookPayload,
    );

    expect(result).toEqual(
      expect.objectContaining({
        type: 'pull_request.reopen',
        source: {
          providerId: 'http://gitlab.com',
          namespaceId: 'source-namespace',
          repositoryId: '1',
          branchName: 'source-namespace/source-branch',
          providerType: 'GITLAB_CLOUD',
        },
        commit: {
          sha: 'da1560886d4f094c3e6c9ef40349f7d38b5d27d7',
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
      GitLabWebhookHelpers.shouldHandleWebhook(webhookPayload),
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
      GitLabWebhookHelpers.shouldHandleWebhook(webhookPayload),
    ).toBeFalsy();
  });

  it('should return true for pull_request.open event', () => {
    const webhookPayload = {
      type: 'pull_request.open',
    } as GenericWebhookEvent;

    expect(
      GitLabWebhookHelpers.shouldHandleWebhook(webhookPayload),
    ).toBeTruthy();
  });

  it('should return false for pull_request.assign event', () => {
    const webhookPayload = {
      type: 'pull_request.assign',
    } as GenericWebhookEvent;

    expect(
      GitLabWebhookHelpers.shouldHandleWebhook(webhookPayload),
    ).toBeFalsy();
  });

  it('should return false for delete event', () => {
    const webhookPayload = {
      type: 'delete',
    } as GenericWebhookEvent;

    expect(
      GitLabWebhookHelpers.shouldHandleWebhook(webhookPayload),
    ).toBeFalsy();
  });
});
