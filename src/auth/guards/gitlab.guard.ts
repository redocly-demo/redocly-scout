import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { ConfigSchema, GitlabConfigSchema } from '../../config';

const GITLAB_CLOUD_HOST = 'gitlab.com';

@Injectable()
export class GitlabGuard implements CanActivate {
  constructor(private config: ConfigService<ConfigSchema>) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const requestSecret = request.header('x-gitlab-token');

    if (!requestSecret) {
      throw new UnauthorizedException(
        'The request does not contain a GitLab signature',
      );
    }

    const instanceUrl = request.body['project']['web_url'];

    const configSecret = this.getInstanceSecret(instanceUrl);

    if (requestSecret !== configSecret) {
      throw new UnauthorizedException(
        'The request secret does not match config secret',
      );
    }

    return true;
  }

  private getInstanceSecret(instanceUrl: string): string {
    const providerConfigs =
      this.config.getOrThrow<GitlabConfigSchema[]>('GITLAB_PROVIDERS');

    const instanceHost = new URL(instanceUrl).host;

    const config = providerConfigs.find(({ url }) => {
      return (
        (url && new URL(url).host === instanceHost) ||
        (instanceHost === GITLAB_CLOUD_HOST && !url)
      );
    });

    if (config) {
      return config.webhookSecret;
    }

    throw new BadRequestException(
      `Invalid GitLab instance url: ${instanceUrl}`,
    );
  }
}
