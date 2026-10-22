import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsNotEmpty({ message: '用户名不能为空' })
  @IsString()
  username: string;

  @IsNotEmpty({ message: '密码不能为空' })
  @IsString()
  password: string;

  @IsNotEmpty({ message: '验证码不能为空' })
  @IsString()
  code: string;

  @IsNotEmpty({ message: '验证码唯一标识 uuid 不能为空' })
  @IsString()
  uuid: string;
}

export class RefreshTokenDto {
  @IsNotEmpty({ message: 'RefreshToken 不能为空' })
  @IsString()
  refreshToken: string;
}
