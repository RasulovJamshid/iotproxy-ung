import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@iotproxy/shared';

export class DomainException extends HttpException {
  constructor(
    errorCode: ErrorCode,
    title: string,
    detail: string,
    status: HttpStatus = HttpStatus.UNPROCESSABLE_ENTITY,
  ) {
    super({ errorCode, title, detail }, status);
  }
}
