import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { STATUS_CODES } from 'http';
import { QueryFailedError } from 'typeorm';

// PostgreSQL error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';

type ResolvedError = { status: number; messages: string[] };

// The single place that turns ANY error thrown while handling a request into one JSON shape:
// { statusCode, error, message: string[], path, timestamp }.
// shortcut: HTTP only; add a host.getType() check when WebSocket gateways appear (lesson 24).
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const { status, messages } = this.resolve(exception);

    // Unexpected errors are logged with the stack, but the client only sees a generic message.
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      error: STATUS_CODES[status] ?? 'Error',
      message: messages,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private resolve(exception: unknown): ResolvedError {
    if (exception instanceof HttpException) {
      return { status: exception.getStatus(), messages: this.messagesOf(exception) };
    }

    if (exception instanceof QueryFailedError) {
      const { code } = exception.driverError as { code?: string };
      if (code === PG_UNIQUE_VIOLATION) {
        return {
          status: HttpStatus.CONFLICT,
          messages: ['Resource with these unique fields already exists'],
        };
      }
      if (code === PG_FOREIGN_KEY_VIOLATION) {
        return {
          status: HttpStatus.CONFLICT,
          messages: ['Resource is referenced by other records'],
        };
      }
    }

    return { status: HttpStatus.INTERNAL_SERVER_ERROR, messages: ['Internal server error'] };
  }

  // ValidationPipe puts an array of messages into the response, other exceptions a string.
  // The client always gets an array, so it never has to check the type.
  private messagesOf(exception: HttpException): string[] {
    const body = exception.getResponse();
    const message =
      typeof body === 'string' ? body : (body as { message?: string | string[] }).message;

    if (message === undefined) return [exception.message];
    return Array.isArray(message) ? message : [message];
  }
}
