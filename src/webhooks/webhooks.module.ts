import { Module } from '@nestjs/common';

import { WebhooksController } from './webhooks.controller';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [TasksModule],
  controllers: [WebhooksController],
  providers: [],
  exports: [],
})
export class WebhooksModule {}
