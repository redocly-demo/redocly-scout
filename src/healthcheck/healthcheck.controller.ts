import { Controller, Get } from '@nestjs/common';
import { HealthcheckResponse } from './types';

@Controller('health')
export class HealthcheckController {
  @Get()
  handleGithubWebhook(): HealthcheckResponse {
    return { scout: 'ok' };
  }
}
