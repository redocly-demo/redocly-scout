import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { ConfigSchema } from '../../config';

@Injectable()
export class GithubGuard implements CanActivate {
  constructor(private config: ConfigService<ConfigSchema>) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // get payload signature
    const signature = request.header('x-hub-signature');

    if (!signature) {
      throw new UnauthorizedException(
        `This request doesn't contain a github signature`,
      );
    }

    // generate digest using webhook secret and request payload
    const secret = this.config.getOrThrow('GITHUB_WEBHOOK_SECRET');
    const payload = JSON.stringify(request.body);
    const hmac = createHmac('sha1', secret);
    const digest = `sha1=${hmac.update(payload).digest('hex')}`;

    if (signature !== digest) {
      throw new UnauthorizedException(
        `Request body digest (${digest}) does not match ${signature}`,
      );
    }

    return true;
  }
}
