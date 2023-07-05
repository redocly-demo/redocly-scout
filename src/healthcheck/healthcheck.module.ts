import { Module } from '@nestjs/common';
import { HealthcheckController } from './healthcheck.controller';
import { HealthService } from './health.service';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { RedoclyHttpConfigService } from '../config/redocly-http-config.service';

@Module({
  imports: [
    ConfigModule,
    HttpModule.registerAsync({ useClass: RedoclyHttpConfigService }),
  ],
  controllers: [HealthcheckController],
  exports: [HealthService],
  providers: [HealthService],
})
export class HealthcheckModule {}
