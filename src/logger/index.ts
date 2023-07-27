import { ConfigService } from '@nestjs/config';
import { ConfigSchema } from '../config';
import { Params } from 'nestjs-pino';
import { Options } from 'pino-http';

const PRETTY_LOGS_FORMAT = {
  target: 'pino-pretty',
  options: {
    colorize: true,
    levelFirst: true,
    singleLine: true,
  },
};

export function loggerFactory(config: ConfigService<ConfigSchema>): Params {
  const level = config.getOrThrow('LOG_LEVEL');
  const orgId = config.getOrThrow('REDOCLY_ORG_ID');
  const version = config.getOrThrow('SCOUT_VERSION');
  const portalId = config.getOrThrow('REDOCLY_PORTAL_ID');
  const isPrettyFormat = config.getOrThrow('LOG_FORMAT') === 'pretty';

  const transport = isPrettyFormat ? PRETTY_LOGS_FORMAT : undefined;
  const mixin = () => ({ orgId, portalId, version });
  const formatters = {
    level: (label: string) => ({ level: label.toUpperCase() }),
  };

  return { pinoHttp: { level, transport, mixin, formatters } as Options };
}
