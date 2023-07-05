import { Module } from '@nestjs/common';

import { TasksService } from './tasks.service';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { RedoclyHttpConfigService } from '../config/redocly-http-config.service';

@Module({
  imports: [
    ConfigModule,
    HttpModule.registerAsync({ useClass: RedoclyHttpConfigService }),
  ],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
