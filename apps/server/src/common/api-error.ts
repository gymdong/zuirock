import { ArgumentsHost, Catch, HttpException, HttpStatus, type ExceptionFilter } from '@nestjs/common';
import type { ApiErrorBody } from '@zuirock/shared';
import type { Response } from 'express';

/** HttpException whose body is an ApiErrorBody with a stable `code`. */
export class ApiError extends HttpException {
  constructor(status: number, code: string, message: string, details?: unknown) {
    super({ statusCode: status, code, message, ...(details === undefined ? {} : { details }) } satisfies ApiErrorBody, status);
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new ApiError(HttpStatus.BAD_REQUEST, code, message, details);
export const notFound = (code: string, message: string) => new ApiError(HttpStatus.NOT_FOUND, code, message);
export const conflict = (code: string, message: string) => new ApiError(HttpStatus.CONFLICT, code, message);
export const unauthorized = (code = 'UNAUTHORIZED', message = '로그인이 필요해요') =>
  new ApiError(HttpStatus.UNAUTHORIZED, code, message);
export const forbidden = (code = 'FORBIDDEN', message = '권한이 없어요') => new ApiError(HttpStatus.FORBIDDEN, code, message);

/** Shapes every HttpException as ApiErrorBody (shared/dto/common.ts). Other errors stay 500. */
@Catch(HttpException)
export class ApiErrorFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (!res || typeof res.status !== 'function') throw exception;
    const status = exception.getStatus();
    const raw = exception.getResponse();
    const body: ApiErrorBody =
      typeof raw === 'object' && raw !== null && 'code' in raw
        ? (raw as ApiErrorBody)
        : {
            statusCode: status,
            code: HttpStatus[status] ?? 'ERROR',
            message: typeof raw === 'string' ? raw : String((raw as { message?: unknown }).message ?? exception.message),
          };
    res.status(status).json(body);
  }
}
