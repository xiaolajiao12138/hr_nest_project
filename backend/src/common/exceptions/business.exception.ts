import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 业务逻辑自定义异常
 * 包含自定义业务错误码 code (默认 500) 和提示信息 message
 */
export class BusinessException extends HttpException {
  private readonly businessCode: number;

  constructor(message: string, businessCode: number = 500, httpStatus: HttpStatus = HttpStatus.OK) {
    super(
      {
        code: businessCode,
        msg: message,
        data: null,
      },
      httpStatus,
    );
    this.businessCode = businessCode;
  }

  getBusinessCode(): number {
    return this.businessCode;
  }
}
