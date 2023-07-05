import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';

import { ApiDefinitionsService } from './api-definitions.service';
import { RedoclyHttpConfigService } from '../config/redocly-http-config.service';
import { DefinitionsValidationService } from './definitions-validation.service';
import { GitModule } from '../git/git.module';

@Module({
  imports: [
    ConfigModule,
    HttpModule.registerAsync({ useClass: RedoclyHttpConfigService }),
    GitModule,
  ],
  providers: [ApiDefinitionsService, DefinitionsValidationService],
  exports: [ApiDefinitionsService, DefinitionsValidationService],
})
export class ApiDefinitionsModule {}
