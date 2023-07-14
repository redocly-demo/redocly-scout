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
import { shouldHandleWebhook } from './github-webhook-helpers';
import { convertWebhookToGenericEvent } from '../git/adapters/github/webhook-helpers';
import { WebhookResponse } from './types';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly tasksService: TasksService) {}

  @HttpCode(HttpStatus.OK)
  @UseGuards(GithubGuard)
  @Post('/github')
  async handleGithubWebhook(
    @Body() webhookPayload: WebhookEvent,
    @Headers('x-github-event') webhookEvent: WebhookEventName,
  ): Promise<WebhookResponse> {
    const webhook = convertWebhookToGenericEvent(webhookEvent, webhookPayload);
    if (!webhook) {
      return { message: 'Unprocessable webhook payload', event: webhookEvent };
    }

    if (!shouldHandleWebhook(webhook)) {
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
}
