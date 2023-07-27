import {
  HttpModuleOptions,
  HttpModuleOptionsFactory,
} from '@nestjs/axios/dist/interfaces/http-module.interface';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConfigSchema } from '.';

@Injectable()
export class RedoclyHttpConfigService implements HttpModuleOptionsFactory {
  constructor(private readonly config: ConfigService<ConfigSchema>) {}

  createHttpOptions(): HttpModuleOptions {
    return {
      baseURL: this.config.getOrThrow('REDOCLY_API_URL'),
      headers: {
        Authorization: `Bearer ${this.config.getOrThrow('REDOCLY_API_KEY')}`,
        'x-redocly-scout-version': this.config.getOrThrow('SCOUT_VERSION'),
      },
    };
  }
}
