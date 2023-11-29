import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { GithubGuard } from '../auth/guards/github.guard';
import { TasksService } from '../tasks/tasks.service';
import { WebhookEvent, WebhookEventName } from '@octokit/webhooks-types';
import { GitHubWebhookHelpers } from '../git/adapters/github/webhook-helpers';
import { WebhookResponse } from './types';
import { GitlabGuard } from '../auth/guards/gitlab.guard';
import { GitLabWebhookHelpers } from '../git/adapters/gitlab/webhook-helpers';
import { GitLabApiTypes } from '../git/adapters/gitlab/api-types';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly tasksService: TasksService) {}

  @HttpCode(HttpStatus.OK)
  @UseGuards(GithubGuard)
  @Post('/github')
  async handleGithubWebhook(
    @Body() webhookPayload: WebhookEvent,
    @Headers('x-github-event') webhookEvent: WebhookEventName,
    @Headers('x-github-hook-installation-target-id') appId: string,
  ): Promise<WebhookResponse> {
    const webhook = GitHubWebhookHelpers.convertWebhookToGenericEvent(
      webhookEvent,
      webhookPayload,
      appId,
    );

    if (!webhook) {
      return { message: 'Unprocessable webhook payload', event: webhookEvent };
    }

    if (!GitHubWebhookHelpers.shouldHandleWebhook(webhook)) {
      return {
        message:
          'Unprocessable webhook event. Scout process only "push" event on the main branch and "pull_request" event with "opened", "reopened", "synchronize" action',
        event: webhook.type,
      };
    }

    try {
      const job = await this.tasksService.createProcessRepositoryTask(webhook);
      return { message: 'Job created', event: webhook.type, jobId: job.id };
    } catch (e) {
      throw new InternalServerErrorException({
        detail: e.message,
        event: webhookEvent,
      });
    }
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(GitlabGuard)
  @Post('/gitlab')
  async handleGitlabWebhook(
    @Body() webhookPayload: GitLabApiTypes.WebhookPayload,
    @Headers('x-gitlab-event') webhookEvent: GitLabApiTypes.GitLabEventHeader,
  ): Promise<WebhookResponse | void> {
    const webhook = GitLabWebhookHelpers.convertWebhookToGenericEvent(
      webhookEvent,
      webhookPayload,
    );

    if (!webhook) {
      return { message: 'Unprocessable webhook payload', event: webhookEvent };
    }

    if (!GitLabWebhookHelpers.shouldHandleWebhook(webhook)) {
      return {
        message:
          'Unprocessable webhook event. Scout process only "push" event on the main branch and "pull_request" event with "open", "reopen" and "update" action',
        event: webhook.type,
      };
    }

    try {
      const job = await this.tasksService.createProcessRepositoryTask(webhook);
      return { message: 'Job created', event: webhook.type, jobId: job.id };
    } catch (e) {
      throw new InternalServerErrorException({
        detail: e.message,
        event: webhookEvent,
      });
    }
  }
}
