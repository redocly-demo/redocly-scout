import { Octokit, RequestError } from 'octokit';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { createAppAuth } from '@octokit/auth-app';

import { ContentSource, GitAdapter } from '../types';
import { ConfigSchema, GithubConfigSchema } from '../../../config';
import { CommitCheck, CommitCheckStatus } from '../../../jobs/types';
import { GithubCommitState } from './types';
import { CommitDetails } from '../../../remotes/types';
import LRUCache from 'lru-cache';

const REQUEST_TIMEOUT = 2 * 60 * 1000; // 2 min

@Injectable()
export class GitHubServerClient implements GitAdapter {
  protected logger = new Logger(GitHubServerClient.name);

  constructor(
    @Inject('LRUCache')
    protected readonly cache: LRUCache<string, number>,
    protected readonly config: ConfigService<ConfigSchema>,
  ) {}

  protected Legacy_getDefaultProviderConfig() {
    return {
      url: this.config.getOrThrow('GITHUB_SERVER_URL'),
      appId: this.config.getOrThrow('GITHUB_APP_ID'),
      appUserId: this.config.getOrThrow('GITHUB_APP_USER_ID'),
      privateKey: this.config.getOrThrow('GITHUB_PRIVATE_KEY'),
      webhookSecret: this.config.getOrThrow('GITHUB_WEBHOOK_SECRET'),
    };
  }

  protected getProviderConfig(
    providerId: string,
  ): GithubConfigSchema & { url: string } {
    if (!providerId) {
      return this.Legacy_getDefaultProviderConfig();
    }

    const providers =
      this.config.getOrThrow<GithubConfigSchema[]>('GITHUB_PROVIDERS');

    const provider = providers.find(({ appId }) => appId === providerId);

    if (provider) {
      if (!provider.url) {
        throw new Error(`Missing url for appId: ${providerId}`);
      }

      return provider as GithubConfigSchema & { url: string };
    }

    const Legacy_githubAppId = this.config.get('GITHUB_APP_ID');
    if (Legacy_githubAppId === providerId) {
      return this.Legacy_getDefaultProviderConfig();
    }

    throw new Error(
      `Could not find github provider configuration for appId: ${providerId}`,
    );
  }

  private getAppClient(providerId: string): Octokit {
    const { appId, privateKey } = this.getProviderConfig(providerId);

    this.logger.debug(
      {
        appId,
        privateKey: !!privateKey,
        privateKeySha256: privateKey && computePrivateKeySha256(privateKey),
      },
      'Creating app client',
    );

    return new Octokit({
      baseUrl: this.getBaseApiUrl(providerId),
      authStrategy: createAppAuth,
      auth: {
        appId,
        privateKey,
      },
      request: {
        timeout: REQUEST_TIMEOUT,
      },
    });
  }

  private async getInstallationClient(
    sourceDetails: ContentSource,
  ): Promise<Octokit> {
    const { appId, privateKey } = this.getProviderConfig(
      sourceDetails.providerId,
    );
    const installationId = await this.getInstallationId(sourceDetails);

    return new Octokit({
      baseUrl: this.getBaseApiUrl(sourceDetails.providerId),
      authStrategy: createAppAuth,
      auth: {
        appId,
        privateKey,
        installationId,
      },
      request: {
        timeout: REQUEST_TIMEOUT,
      },
    });
  }

  private async getToken(sourceDetails: ContentSource) {
    try {
      const installationId = await this.getInstallationId(sourceDetails);
      const appClient = this.getAppClient(sourceDetails.providerId);

      const response = await appClient.rest.apps.createInstallationAccessToken({
        installation_id: installationId,
        repositories: [sourceDetails.repositoryId],
      });

      return response.data.token;
    } catch (e) {
      // Remove installation id from the cache on fail, so on the next try it should be populated from api
      if ([401, 403, 404].includes(e.status)) {
        const key = this.getInstallationIdCacheKey(sourceDetails);
        this.cache.delete(key);
      }
      this.logger.error({ err: e }, 'Could not fetch token');
      throw Error('Could not fetch token');
    }
  }

  private async getInstallationId(sourceDetails: ContentSource) {
    try {
      const key = this.getInstallationIdCacheKey(sourceDetails);
      const cachedInstallationId = this.cache.get(key);

      if (cachedInstallationId) {
        return cachedInstallationId;
      }

      const response = await this.getAppClient(
        sourceDetails.providerId,
      ).rest.apps.getRepoInstallation({
        owner: sourceDetails.namespaceId,
        repo: sourceDetails.repositoryId,
      });

      this.cache.set(key, response.data.id);

      return response.data.id;
    } catch (e) {
      const errorDetails =
        e instanceof RequestError
          ? {
              githubMessage: e.message,
              githubStatus: e.status,
              githubResponse: e.response,
              githubRequest: e.request,
            }
          : {};

      this.logger.error(
        { err: e, errorDetails },
        'Could not fetch installationId',
      );
      throw Error('Could not fetch installationId');
    }
  }

  public async getCloneUrl(sourceDetails: ContentSource): Promise<string> {
    const { providerId, repositoryId, namespaceId } = sourceDetails;

    const baseUrl = new URL(this.getBaseUrl(providerId));
    const token = await this.getToken(sourceDetails);

    return `https://oauth2:${token}@${baseUrl.host}/${namespaceId}/${repositoryId}.git`;
  }

  public getPRRef(prId: string): string {
    return `pull/${prId}/head`;
  }

  public async upsertCommitStatuses(
    commitSha: string,
    checks: CommitCheck[],
    sourceDetails: ContentSource,
  ) {
    const installationClient = await this.getInstallationClient(sourceDetails);
    const { namespaceId, repositoryId } = sourceDetails;

    await Promise.all(
      checks.map((check) => {
        const { name, description, targetUrl, status } = check;
        return installationClient.rest.repos.createCommitStatus({
          owner: namespaceId,
          repo: repositoryId,
          sha: commitSha,
          state: this.mapCommitStatusState(status),
          target_url: targetUrl || null,
          description: description || null,
          context: name,
        });
      }),
    );
  }

  public async getCommitDetails(
    commitSha: string,
    sourceDetails: ContentSource,
  ): Promise<CommitDetails> {
    const installationClient = await this.getInstallationClient(sourceDetails);

    const { data } = await installationClient.rest.repos.getCommit({
      owner: sourceDetails.namespaceId,
      repo: sourceDetails.repositoryId,
      ref: commitSha,
    });

    return {
      message: data.commit.message,
      url: data.html_url,
      namespaceId: sourceDetails.namespaceId,
      repositoryId: sourceDetails.repositoryId,
      branchName: sourceDetails.branchName,
      author: {
        name: data.commit.author?.name || '',
        username: data.author?.login || '',
        email: data.commit.author?.email || '',
        image: data.author?.avatar_url || '',
      },
      ...(data.commit.author?.date
        ? { createdAt: data.commit.author.date }
        : {}),
    };
  }

  public async checkConnectivity(providerId: string): Promise<boolean> {
    const expectedStatus = 401;
    const client = new Octokit({
      baseUrl: this.getBaseApiUrl(providerId),
      request: {
        timeout: REQUEST_TIMEOUT,
      },
    });

    const response = await client.rest.orgs
      .list({ per_page: 1 })
      .then((res) => ({
        status: res.status,
        url: res.url,
      }))
      .catch((e) => ({
        status: e.errorDetails?.githubStatus,
        url: e.errorDetails?.githubRequest?.url,
      }));

    this.logger.debug(
      {
        request: {
          url: response.url,
        },
        expectedStatus,
        receivedStatus: response.status,
      },
      'Checking GitHub connectivity',
    );

    return expectedStatus === response.status;
  }

  public async upsertSummaryComment(
    text: string,
    sourceDetails: ContentSource,
    commitSha: string,
    prId?: string,
    override = true,
  ) {
    if (prId) {
      return this.upsertPrComment(text, prId, sourceDetails, override);
    }
    return this.upsertCommitComment(text, commitSha, sourceDetails, override);
  }

  public async getSummaryComment(
    sourceDetails: ContentSource,
    commitSha: string,
    prId?: string,
  ): Promise<string> {
    const comment = prId
      ? await this.getExistingPrComment(prId, sourceDetails)
      : await this.getExistingCommitComment(commitSha, sourceDetails);

    return comment?.body || '';
  }

  public async upsertPrComment(
    text: string,
    prId: string,
    sourceDetails: ContentSource,
    override = true,
  ) {
    const client = await this.getInstallationClient(sourceDetails);

    const comment = await this.getExistingPrComment(prId, sourceDetails);
    if (comment) {
      await client.rest.issues.updateComment({
        owner: sourceDetails.namespaceId,
        repo: sourceDetails.repositoryId,
        comment_id: comment.id,
        issue_number: parseInt(prId),
        body: !override && comment.body ? `${comment.body}\n${text}` : text,
      });
    } else {
      await client.rest.issues.createComment({
        owner: sourceDetails.namespaceId,
        repo: sourceDetails.repositoryId,
        issue_number: parseInt(prId),
        body: text,
      });
    }
  }

  private async getExistingPrComment(
    prId: string,
    sourceDetails: ContentSource,
  ) {
    const { appUserId } = this.getProviderConfig(sourceDetails.providerId);
    const client = await this.getInstallationClient(sourceDetails);
    const perPage = 50;
    let page = 1;

    while (true) {
      const { data } = await client.rest.issues.listComments({
        owner: sourceDetails.namespaceId,
        repo: sourceDetails.repositoryId,
        issue_number: parseInt(prId),
        per_page: perPage,
        page,
      });
      const comment = data.find((comment) => comment.user?.id === appUserId);
      if (comment || !data.length) {
        return comment;
      }
      page = page + 1;
    }
  }

  public async upsertCommitComment(
    text: string,
    commitSha: string,
    sourceDetails: ContentSource,
    override = true,
  ) {
    const client = await this.getInstallationClient(sourceDetails);

    const comment = await this.getExistingCommitComment(
      commitSha,
      sourceDetails,
    );

    if (comment) {
      try {
        await client.rest.repos.updateCommitComment({
          owner: sourceDetails.namespaceId,
          repo: sourceDetails.repositoryId,
          comment_id: comment.id,
          body: !override && comment.body ? `${comment.body}\n${text}` : text,
        });
      } catch (err) {
        this.logger.error(
          { err, commentId: comment.id },
          'Failed to update commit comment',
        );
      }
    } else {
      try {
        await client.rest.repos.createCommitComment({
          owner: sourceDetails.namespaceId,
          repo: sourceDetails.repositoryId,
          commit_sha: commitSha,
          body: text,
        });
      } catch (err) {
        this.logger.error({ err }, 'Failed to create commit comment');
      }
    }
  }

  private async getExistingCommitComment(
    commitSha: string,
    sourceDetails: ContentSource,
  ) {
    const { appUserId } = this.getProviderConfig(sourceDetails.providerId);
    const client = await this.getInstallationClient(sourceDetails);
    const perPage = 50;
    let page = 1;

    while (true) {
      const { data } = await client.rest.repos.listCommentsForCommit({
        owner: sourceDetails.namespaceId,
        repo: sourceDetails.repositoryId,
        commit_sha: commitSha,
        per_page: perPage,
        page,
      });
      const comment = data.find((comment) => comment.user?.id === appUserId);
      if (comment || !data.length) {
        return comment;
      }
      page = page + 1;
    }
  }

  private mapCommitStatusState(state: CommitCheckStatus): GithubCommitState {
    switch (state) {
      case 'FAILED':
        return 'failure';
      case 'SUCCEEDED':
        return 'success';
      case 'IN_PROGRESS':
        return 'pending';
    }
  }

  private getBaseUrl(providerId: string): string {
    const { url } = this.getProviderConfig(providerId);

    return url;
  }

  protected getBaseApiUrl(providerId: string): string {
    const serverUrl = this.getBaseUrl(providerId);
    return `${serverUrl.replace(/\/$/, '')}/api/v3`;
  }

  private getInstallationIdCacheKey({
    providerId,
    namespaceId,
    repositoryId,
  }: ContentSource): string {
    if (providerId) {
      return `installationId--${providerId}--${namespaceId}--${repositoryId}`;
    }
    return `installationId--${namespaceId}--${repositoryId}`;
  }
}

function computePrivateKeySha256(pem: string) {
  const key = crypto.createPublicKey({ format: 'pem', key: pem });
  return crypto
    .createHash('sha256')
    .update(key.export({ type: 'spki', format: 'der' }))
    .digest('base64');
}
