import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

import type { Response } from 'express';

import { ProblemHttpException } from '../types';
import { PROBLEM_CONTENT_TYPE } from './constants';

interface ErrorDetail {
  message: string;
  title?: string;
  status?: string | number;
  statusCode?: string | number;
  description?: string;
  detail?: string;
  error?: string;
}

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const { status, title, detail, ...additionalFields } =
      this.parseException(exception);

    this.logger.error(
      {
        status,
        message: exception.message,
        stack: exception.stack,
        cause: exception.cause,
        ...additionalFields,
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
        ...(detail ? { detail } : {}),
        ...additionalFields,
      } satisfies ProblemHttpException);
  }

  private parseException(exception: HttpException): {
    status: number;
    title: string;
    detail?: string;
  } {
    const response = exception.getResponse() as string | ErrorDetail;

    if (typeof response === 'string') {
      return {
        status: exception.getStatus() || HttpStatus.INTERNAL_SERVER_ERROR,
        title: response,
      };
    }

    const {
      description,
      detail: responseDetail,
      error,
      status: _responseStatus,
      statusCode: _responseStatusCode,
      message,
      title,
      ...extraFields
    } = response;
    const detail = responseDetail || description || message;

    return {
      status: exception.getStatus() || HttpStatus.INTERNAL_SERVER_ERROR,
      title: title || error || exception.message,
      ...(detail ? { detail } : {}),
      ...extraFields,
    };
  }
}
