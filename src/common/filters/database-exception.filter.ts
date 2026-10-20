import { ArgumentsHost, Catch, ConflictException, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { QueryFailedError } from 'typeorm';

// Коды ошибок PostgreSQL: https://www.postgresql.org/docs/current/errcodes-appendix.html
const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';

// Exception filter перехватывает ошибки, которые вылетели из контроллера или сервиса.
// Без него нарушение UNIQUE (например, email уже занят) дошло бы до клиента как 500.
// С ним клиент получает понятный 409 Conflict.
@Catch(QueryFailedError)
export class DatabaseExceptionFilter extends BaseExceptionFilter {
  catch(exception: QueryFailedError, host: ArgumentsHost) {
    const httpException = this.toHttpException(exception);

    // BaseExceptionFilter — стандартный обработчик Nest. Передаём ему либо
    // HttpException (он вернёт нужный статус), либо исходную ошибку (будет 500).
    super.catch(httpException ?? exception, host);
  }

  private toHttpException(exception: QueryFailedError): HttpException | null {
    const { code } = exception.driverError as { code?: string };

    switch (code) {
      case PG_UNIQUE_VIOLATION:
        return new ConflictException('Resource with these unique fields already exists');
      case PG_FOREIGN_KEY_VIOLATION:
        return new ConflictException('Resource is referenced by other records');
      default:
        return null;
    }
  }
}
