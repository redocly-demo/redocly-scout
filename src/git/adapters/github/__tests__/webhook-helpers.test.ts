import { convertWebhookToGenericEvent } from '../webhook-helpers';

import pushEvent from './fixtures/pushEventPayload.json';
import pullRequestReopenedEvent from './fixtures/pullRequestReopenedEventPayload.json';
import { WebhookEvent } from '@octokit/webhooks-types';

describe('convertWebhookToGenericEvent', () => {
  it('should convert push event', () => {
    const result = convertWebhookToGenericEvent(
      'push',
      pushEvent as WebhookEvent,
    );

    expect(result).toEqual(
      expect.objectContaining({
        type: 'push',
        source: {
          namespaceId: 'John',
          repositoryId: 'repo-name',
          branchName: 'main',
          providerType: 'GITHUB_CLOUD',
        },
        commit: {
          sha: 'dd2c301ac65043128a66fb5b657feebf83778e8048f3af2be80bd20f27df8786',
          message: 'Initial commit',
        },
        mainBranchName: 'main',
      }),
    );
  });

  it('should convert pull_request event', () => {
    const result = convertWebhookToGenericEvent(
      'pull_request',
      pullRequestReopenedEvent as WebhookEvent,
    );

    expect(result).toEqual(
      expect.objectContaining({
        type: 'pull_request.reopened',
        source: {
          namespaceId: 'John',
          repositoryId: 'repo-name',
          branchName: 'chore/test',
          providerType: 'GITHUB_CLOUD',
        },
        commit: {
          sha: 'dd2c301ac65043128a66fb5b657feebf83778e8048f3af2be80bd20f27df8786',
        },
        mainBranchName: 'main',
        prId: '1',
      }),
    );
  });
});
