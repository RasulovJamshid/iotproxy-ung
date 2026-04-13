import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ERROR_CODES } from '@iotproxy/shared';

function httpStatusToErrorCode(status: number): string {
  switch (status) {
    case 400: return 'BAD_REQUEST';
    case 401: return 'UNAUTHORIZED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 409: return 'CONFLICT';
    case 422: return 'UNPROCESSABLE_ENTITY';
    case 429: return 'TOO_MANY_REQUESTS';
    default:  return ERROR_CODES.INTERNAL_ERROR;
  }
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode: string = ERROR_CODES.INTERNAL_ERROR;
    let title = 'Internal server error';
    let detail = 'An unexpected error occurred';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, unknown>;
        // Use explicit errorCode if provided, else derive from HTTP status
        errorCode = (r['errorCode'] as string) ?? httpStatusToErrorCode(status);
        title = (r['title'] as string) ?? exception.message;
        detail = (r['detail'] as string) ?? (r['message'] as string) ?? detail;
      } else {
        detail = String(res);
        title = exception.message;
        errorCode = httpStatusToErrorCode(status);
      }
    } else if (exception instanceof Error) {
      if ((exception as any).code === '23505') {
        status = HttpStatus.CONFLICT;
        errorCode = 'CONFLICT';
        title = 'Conflict';
        // Postgres provides a helpful detail string like: "Key (external_id)=(123) already exists."
        detail = (exception as any).detail || 'A record with this unique identifier already exists.';
      } else {
        this.logger.error(exception.message, exception.stack);
      }
    }

    // RFC 7807 Problem Details
    response.status(status).json({
      type: `https://iotproxy.io/errors/${errorCode}`,
      title,
      status,
      detail,
      instance: request.url,
      correlationId: (request as any).correlationId ?? null,
    });
  }
}
