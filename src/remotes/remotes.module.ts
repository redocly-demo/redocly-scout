import { Module } from '@nestjs/common';

import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { RedoclyHttpConfigService } from '../config/redocly-http-config.service';
import { RemotesService } from './remotes.service';

@Module({
  imports: [
    ConfigModule,
    HttpModule.registerAsync({ useClass: RedoclyHttpConfigService }),
  ],
  providers: [RemotesService],
  exports: [RemotesService],
})
export class RemotesModule {}
