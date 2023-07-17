import { Octokit, RequestError } from 'octokit';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { createAppAuth } from '@octokit/auth-app';

import { ContentSource, GitAdapter } from '../types';
import { ConfigSchema } from '../../../config';
import { CommitCheck, CommitCheckStatus } from '../../../jobs/types';
import { GithubCommitState } from './types';
import { CommitDetails } from '../../../remotes/types';
import LRUCache from 'lru-cache';

const GITHUB_CLOUD_URL = 'https://github.com';
const GITHUB_CLOUD_API_URL = 'https://api.github.com';

@Injectable()
export class GitHubCloudClient implements GitAdapter {
  protected logger = new Logger(GitHubCloudClient.name);

  constructor(
    @Inject('LRUCache')
    protected readonly cache: LRUCache<string, number>,
    protected readonly config: ConfigService<ConfigSchema>,
  ) {}

  private getAppClient(): Octokit {
    const appId = this.config.getOrThrow('GITHUB_APP_ID');
    const privateKey = this.config.getOrThrow('GITHUB_PRIVATE_KEY');

    this.logger.debug(
      {
        appId,
        privateKey: !!privateKey,
        privateKeySha256: privateKey && computePrivateKeySha256(privateKey),
      },
      'Creating app client',
    );

    return new Octokit({
      baseUrl: this.getBaseApiUrl(),
      authStrategy: createAppAuth,
      auth: {
        appId,
        privateKey,
      },
    });
  }

  private async getInstallationClient(
    sourceDetails: ContentSource,
  ): Promise<Octokit> {
    const installationId = await this.getInstallationId(sourceDetails);

    return new Octokit({
      baseUrl: this.getBaseApiUrl(),
      authStrategy: createAppAuth,
      auth: {
        appId: this.config.getOrThrow('GITHUB_APP_ID'),
        privateKey: this.config.getOrThrow('GITHUB_PRIVATE_KEY'),
        installationId,
      },
    });
  }

  private async getToken(sourceDetails: ContentSource) {
    try {
      const installationId = await this.getInstallationId(sourceDetails);
      const appClient = this.getAppClient();

      const response = await appClient.rest.apps.createInstallationAccessToken({
        installation_id: installationId,
        repositories: [sourceDetails.repositoryId],
      });

      return response.data.token;
    } catch (e) {
      // Remove installation id from the cache on fail, so on the next try it should be populated from api
      if (e.status === 404) {
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

      const response = await this.getAppClient().rest.apps.getRepoInstallation({
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
    const { repositoryId, namespaceId } = sourceDetails;

    const baseUrl = new URL(this.getBaseUrl());
    const token = await this.getToken(sourceDetails);

    return `https://oauth2:${token}@${baseUrl.host}/${namespaceId}/${repositoryId}.git`;
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
      namespaceId: sourceDetails.namespaceId,
      repositoryId: sourceDetails.repositoryId,
      branchName: sourceDetails.branchName,
      author: {
        name: data.commit.author?.name || '',
        email: data.commit.author?.email || '',
        image: data.author?.avatar_url || '',
      },
    };
  }

  public async upsertSummaryComment(
    text: string,
    sourceDetails: ContentSource,
    commitSha: string,
    prId?: string,
  ) {
    if (prId) {
      return this.upsertPrComment(text, prId, sourceDetails);
    }
    return this.upsertCommitComment(text, commitSha, sourceDetails);
  }

  public async upsertPrComment(
    text: string,
    prId: string,
    sourceDetails: ContentSource,
  ) {
    const client = await this.getInstallationClient(sourceDetails);

    const comment = await this.getExistingPrComment(prId, sourceDetails);
    if (comment) {
      await client.rest.issues.updateComment({
        owner: sourceDetails.namespaceId,
        repo: sourceDetails.repositoryId,
        comment_id: comment.id,
        issue_number: parseInt(prId),
        body: text,
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
    const appUserId = this.config.getOrThrow('GITHUB_APP_USER_ID');
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
  ) {
    const client = await this.getInstallationClient(sourceDetails);

    const comment = await this.getExistingCommitComment(
      commitSha,
      sourceDetails,
    );

    if (comment) {
      await client.rest.repos.updateCommitComment({
        owner: sourceDetails.namespaceId,
        repo: sourceDetails.repositoryId,
        comment_id: comment.id,
        body: text,
      });
    } else {
      await client.rest.repos.createCommitComment({
        owner: sourceDetails.namespaceId,
        repo: sourceDetails.repositoryId,
        commit_sha: commitSha,
        body: text,
      });
    }
  }

  private async getExistingCommitComment(
    commitSha: string,
    sourceDetails: ContentSource,
  ) {
    const appUserId = this.config.getOrThrow('GITHUB_APP_USER_ID');
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

  protected getBaseUrl() {
    return GITHUB_CLOUD_URL;
  }

  protected getBaseApiUrl() {
    return GITHUB_CLOUD_API_URL;
  }

  private getInstallationIdCacheKey({
    namespaceId,
    repositoryId,
  }: ContentSource): string {
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
