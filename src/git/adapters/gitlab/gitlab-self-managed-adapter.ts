import { ConfigService } from '@nestjs/config';
import { Injectable, Logger } from '@nestjs/common';

import { ContentSource, GitAdapter } from '../types';
import { ConfigSchema, GitlabConfigSchema } from '../../../config';
import { CommitCheck, CommitCheckStatus } from '../../../jobs/types';
import { CommitDetails } from '../../../remotes/types';
import { Gitlab, MergeRequestNoteSchema } from '@gitbeaker/rest';
import { GitLabApiClientOptions, GitLabCommitState } from './types';
import {
  CommitDiscussion,
  DiscussionNote,
  DiscussionNoteSchemaExtended,
} from './api-types/api-types';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, map } from 'rxjs';

const REQUEST_TIMEOUT = 2 * 60 * 1000; // 2 min

@Injectable()
export class GitLabSelfManagedClient implements GitAdapter {
  protected logger = new Logger(GitLabSelfManagedClient.name);

  constructor(
    protected readonly config: ConfigService<ConfigSchema>,
    protected readonly httpService: HttpService,
  ) {}

  protected getProviderConfig(providerUrl: string) {
    const providersConfigs =
      this.config.getOrThrow<GitlabConfigSchema[]>('GITLAB_PROVIDERS');

    const providerConfig = providersConfigs.find(
      ({ url }) => url && new URL(url).host === new URL(providerUrl).host,
    );

    if (!providerConfig) {
      throw new Error(`Missing config for provider: ${providerUrl}`);
    }

    return providerConfig as GitlabConfigSchema & { url: string };
  }

  public async getCloneUrl(sourceDetails: ContentSource): Promise<string> {
    const providerConfig = this.getProviderConfig(sourceDetails.providerId);

    const apiClient = this.getApiClient(providerConfig.url);

    const baseUrl = new URL(providerConfig.url);

    const project = await apiClient.Projects.show(sourceDetails.repositoryId);

    return `https://scout:${providerConfig.privateToken}@${baseUrl.host}/${project.path_with_namespace}.git`;
  }

  public getPRRef(prId: string): string {
    return `refs/merge-requests/${prId}/head`;
  }

  public async upsertCommitStatuses(
    commitSha: string,
    checks: CommitCheck[],
    sourceDetails: ContentSource,
  ) {
    const apiClient = this.getApiClient(sourceDetails.providerId);

    await Promise.all(
      checks.map((check) => {
        const { name, description, targetUrl, status } = check;

        return apiClient.Commits.editStatus(
          sourceDetails.repositoryId,
          commitSha,
          this.mapCommitStatusState(status),
          {
            name,
            ...(description ? { description } : {}),
            ...(targetUrl ? { targetUrl } : {}),
            context: name,
          },
        );
      }),
    );
  }

  public async getCommitDetails(
    commitSha: string,
    sourceDetails: ContentSource,
  ): Promise<CommitDetails> {
    const apiClient = this.getApiClient(sourceDetails.providerId);

    const commit = await apiClient.Commits.show(
      sourceDetails.repositoryId,
      commitSha,
    );

    return {
      message: commit.message,
      url: commit.web_url,
      namespaceId: sourceDetails.namespaceId,
      repositoryId: sourceDetails.repositoryId,
      branchName: sourceDetails.branchName,
      author: {
        name: commit.author_name,
        username: commit.author_email,
        email: commit.author_email,
        image: '',
      },
      createdAt: commit.created_at,
    };
  }

  public async checkConnectivity(providerId: string): Promise<boolean> {
    const logContext = 'Checking GitLab connectivity';

    const debugMessage = {
      request: {
        path: 'GET /projects',
      },
    };

    const apiClient = this.getApiClient(providerId, {
      defaultHost: true,
      timeout: REQUEST_TIMEOUT,
    });

    this.logger.debug(debugMessage, logContext);

    try {
      await apiClient.Projects.all({ perPage: 1 });
    } catch (err) {
      this.logger.debug(
        {
          ...debugMessage,
          error: err,
        },
        logContext,
      );

      return false;
    }

    return true;
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
    const apiClient = this.getApiClient(sourceDetails.providerId);

    const comment = await this.getExistingPrComment(prId, sourceDetails);

    if (comment) {
      await apiClient.MergeRequestNotes.edit(
        sourceDetails.repositoryId,
        parseInt(prId),
        comment.id,
        {
          body: !override && comment.body ? `${comment.body}\n${text}` : text,
        },
      );
    } else {
      await apiClient.MergeRequestNotes.create(
        sourceDetails.repositoryId,
        parseInt(prId),
        text,
      );
    }
  }

  private getApiClient(host: string, options?: GitLabApiClientOptions) {
    const hostOptions = {
      ...(options?.defaultHost ? {} : { host }),
    };

    const timeoutOptions = {
      ...(options?.timeout ? { queryTimeout: options.timeout } : {}),
    };

    const providerConfig = this.getProviderConfig(host);

    const apiClientConfig = {
      token: providerConfig.privateToken,
      ...hostOptions,
      ...timeoutOptions,
    };

    return new Gitlab(apiClientConfig);
  }

  private async getExistingPrComment(
    prId: string,
    sourceDetails: ContentSource,
  ): Promise<MergeRequestNoteSchema | undefined> {
    const apiClient = this.getApiClient(sourceDetails.providerId);

    const providerConfig = this.getProviderConfig(sourceDetails.providerId);

    let page = 1;

    while (true) {
      const comments = await apiClient.MergeRequestNotes.all(
        sourceDetails.repositoryId,
        parseInt(prId),
        { perPage: 50, page },
      );

      if (!comments.length) {
        return undefined;
      }

      const comment = comments.find(
        (comment) => comment.author.id === providerConfig.userId,
      );

      if (comment) {
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
    const { repositoryId, providerId } = sourceDetails;

    const providerConfig = this.getProviderConfig(providerId);

    const discussionNoteExt = await this.getExistingCommitDiscussion(
      commitSha,
      sourceDetails,
    );

    if (discussionNoteExt) {
      const body =
        !override && discussionNoteExt.body
          ? `${discussionNoteExt.body}\n${text}`
          : text;

      await this.updateDiscussionNote(
        commitSha,
        repositoryId,
        body,
        discussionNoteExt,
        providerConfig,
      );
    } else {
      await this.createDiscussion(
        commitSha,
        repositoryId,
        text,
        providerConfig,
      );
    }
  }

  private async getExistingCommitComment(
    commitSha: string,
    sourceDetails: ContentSource,
  ): Promise<DiscussionNote | undefined> {
    const providerConfig = this.getProviderConfig(sourceDetails.providerId);

    let page = 1;

    while (true) {
      const discussions = await this.getDiscussionsList(
        commitSha,
        sourceDetails.repositoryId,
        page,
        providerConfig,
      );

      if (!discussions.length) {
        return undefined;
      }

      const note = discussions
        .flatMap((discussion) => discussion.notes)
        .find((note) => note?.author.id === providerConfig.userId);

      if (note) {
        return note;
      }

      page++;
    }
  }

  private async getExistingCommitDiscussion(
    commitSha: string,
    sourceDetails: ContentSource,
  ): Promise<DiscussionNoteSchemaExtended | undefined> {
    let page = 1;

    const providerConfig = this.getProviderConfig(sourceDetails.providerId);

    while (true) {
      const discussions = await this.getDiscussionsList(
        commitSha,
        sourceDetails.repositoryId,
        page,
        providerConfig,
      );

      if (!discussions.length) {
        return undefined;
      }

      const discussionNoteExtended = this.findDiscussionNote(
        discussions,
        providerConfig.userId,
      );

      if (discussionNoteExtended) {
        return discussionNoteExtended;
      }

      page++;
    }
  }

  private findDiscussionNote(
    discussions: CommitDiscussion[],
    userId: number,
  ): DiscussionNoteSchemaExtended | undefined {
    for (const discussion of discussions) {
      const note = discussion.notes?.find((n) => n.author.id === userId);

      if (note) {
        return { ...note, discussionId: discussion.id };
      }
    }

    return undefined;
  }

  private mapCommitStatusState(state: CommitCheckStatus): GitLabCommitState {
    switch (state) {
      case 'FAILED':
        return 'failed';
      case 'SUCCEEDED':
        return 'success';
      case 'IN_PROGRESS':
        return 'pending';
    }
  }

  private getDiscussionsList(
    commitSha: string,
    repositoryId: string,
    page: number,
    config: GitlabConfigSchema & { url: string },
  ): Promise<CommitDiscussion[]> {
    return firstValueFrom(
      this.httpService
        .get(
          this.getBaseDiscussionsApiUrl(config.url, repositoryId, commitSha),
          {
            headers: { 'PRIVATE-TOKEN': config.privateToken },
            params: { page, per_page: 50 },
          },
        )
        .pipe(map((res) => res.data)),
    );
  }

  private async updateDiscussionNote(
    commitSha: string,
    repositoryId: string,
    body: string,
    discussionNoteExt: DiscussionNoteSchemaExtended,
    config: GitlabConfigSchema & { url: string },
  ): Promise<void> {
    await firstValueFrom(
      this.httpService.put(
        `${this.getBaseDiscussionsApiUrl(
          config.url,
          repositoryId,
          commitSha,
        )}/${discussionNoteExt.discussionId}/notes/${discussionNoteExt.id}`,
        {
          body,
        },
        { headers: { 'PRIVATE-TOKEN': config.privateToken } },
      ),
    );
  }

  private async createDiscussion(
    commitSha: string,
    repositoryId: string,
    body: string,
    config: GitlabConfigSchema & { url: string },
  ): Promise<void> {
    await firstValueFrom(
      this.httpService.post(
        this.getBaseDiscussionsApiUrl(config.url, repositoryId, commitSha),
        {
          body,
        },
        { headers: { 'PRIVATE-TOKEN': config.privateToken } },
      ),
    );
  }

  private getBaseDiscussionsApiUrl(
    baseApiUrl: string,
    repositoryId: string,
    commitSha: string,
  ): string {
    return `${baseApiUrl}/api/v4/projects/${repositoryId}/repository/commits/${commitSha}/discussions`;
  }
}
