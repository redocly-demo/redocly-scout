import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { ConfigSchema, GithubConfigSchema } from '../../config';

@Injectable()
export class GithubGuard implements CanActivate {
  constructor(private config: ConfigService<ConfigSchema>) {}

  private getWebhookSecret(providerId: string): string {
    const providers =
      this.config.getOrThrow<GithubConfigSchema[]>('GITHUB_PROVIDERS');

    const provider = providers.find(({ appId }) => appId === providerId);

    if (provider) {
      return provider.webhookSecret;
    }

    const Legacy_githubAppId = this.config.get('GITHUB_APP_ID');
    if (Legacy_githubAppId === providerId) {
      return this.config.getOrThrow('GITHUB_WEBHOOK_SECRET');
    }

    throw new BadRequestException(`Invalid GitHub appId: ${providerId}`);
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // get payload signature
    const signature = request.header('x-hub-signature-256');

    if (!signature) {
      throw new UnauthorizedException(
        `The request doesn't contain a GitHub signature`,
      );
    }

    const appId = request.header('x-github-hook-installation-target-id');

    if (!appId) {
      throw new UnauthorizedException(
        `The request doesn't contain a GitHub appId`,
      );
    }

    // generate digest using webhook secret and request payload
    const secret = this.getWebhookSecret(appId);
    const payload = JSON.stringify(request.body);
    const hmac = createHmac('sha256', secret);
    const digest = `sha256=${hmac.update(payload).digest('hex')}`;

    if (signature !== digest) {
      throw new UnauthorizedException(
        `The request body digest does not match signature`,
      );
    }

    return true;
  }
}
