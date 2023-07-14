import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { ConfigSchema } from './config';
import { json } from 'express';
import { AnyExceptionFilter } from './errors/filters/any-exception.filter';
import { HttpExceptionFilter } from './errors/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    cors: {
      origin: true,
      credentials: true,
    },
  });

  const logger = app.get(Logger);
  app.useLogger(logger);
  // Default limit is 100kb
  app.use(json({ limit: '1mb' }));

  app.useGlobalFilters(new AnyExceptionFilter(), new HttpExceptionFilter());

  const configService = app.get(ConfigService<ConfigSchema>);
  const port = configService.getOrThrow<number>('PORT');

  await app.listen(port, '0.0.0.0', () => {
    logger.log(`🚀 Scout started listening on port ${port}`);
  });
}
bootstrap();
