import { Module } from '@nestjs/common';

import { JobsService } from './jobs.service';
import { TasksModule } from '../tasks/tasks.module';
import { GitModule } from '../git/git.module';
import { RemotesModule } from '../remotes/remotes.module';
import { ApiDefinitionsModule } from '../api-definitions/api-definitions.module';
import { HealthcheckModule } from '../healthcheck/healthcheck.module';

@Module({
  imports: [
    TasksModule,
    GitModule,
    RemotesModule,
    ApiDefinitionsModule,
    HealthcheckModule,
  ],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
