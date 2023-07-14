import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';

import type { Response } from 'express';

import { ProblemHttpException } from '../types';
import { PROBLEM_CONTENT_TYPE } from './constants';

@Catch()
export class AnyExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AnyExceptionFilter.name);

  catch(exception: Error, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    const title = exception.message;

    this.logger.error(
      {
        status: status,
        stack: exception.stack,
      },
      title,
    );

    response
      .type(PROBLEM_CONTENT_TYPE)
      .status(status)
      .json({
        type: 'about:blank',
        title,
        status,
      } satisfies ProblemHttpException);
  }
}
