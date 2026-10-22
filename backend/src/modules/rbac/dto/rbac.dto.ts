import { IsNotEmpty, IsString, Length, IsOptional, IsInt, IsArray } from 'class-validator';

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

export class CreateUserDto {
  @IsNotEmpty({ message: '用户名不能为空' })
  @Length(3, 30, { message: '用户名长度需在3-30个字符' })
  username: string;

  @IsNotEmpty({ message: '密码不能为空' })
  @Length(6, 30, { message: '密码长度至少6位' })
  password: string;

  @IsNotEmpty({ message: '真实姓名不能为空' })
  realName: string;

  @IsOptional()
  phone?: string;

  @IsOptional()
  email?: string;

  @IsOptional()
  @IsInt()
  deptId?: number;

  @IsOptional()
  @IsArray()
  roleIds?: number[];
}

export class UpdateUserDto {
  @IsOptional()
  realName?: string;

  @IsOptional()
  phone?: string;

  @IsOptional()
  email?: string;

  @IsOptional()
  @IsInt()
  deptId?: number;

  @IsOptional()
  @IsArray()
  roleIds?: number[];

  @IsOptional()
  @IsInt()
  status?: number;
}

export class ResetPasswordDto {
  @IsNotEmpty({ message: '新密码不能为空' })
  @Length(6, 30, { message: '密码长度至少6位' })
  newPassword: string;
}

export class CreateRoleDto {
  @IsNotEmpty({ message: '角色名称不能为空' })
  roleName: string;

  @IsNotEmpty({ message: '角色字符不能为空' })
  roleKey: string;

  @IsOptional()
  sort?: number;

  @IsOptional()
  remark?: string;

  @IsOptional()
  @IsArray()
  menuIds?: number[];
}

export class UpdateRoleMenusDto {
  @IsArray({ message: '菜单ID集合必须是数组' })
  menuIds: number[];
}

export class CreateMenuDto {
  @IsOptional()
  parentId?: number = 0;

  @IsNotEmpty({ message: '菜单标题不能为空' })
  title: string;

  @IsOptional()
  name?: string;

  @IsNotEmpty({ message: '路由地址 path 不能为空' })
  path: string;

  @IsOptional()
  component?: string;

  @IsOptional()
  icon?: string;

  @IsOptional()
  sort?: number = 0;

  @IsNotEmpty({ message: '菜单类型不能为空' })
  menuType: 'M' | 'C' | 'F';

  @IsOptional()
  perms?: string;

  @IsOptional()
  isFrame?: boolean = false;

  @IsOptional()
  isHidden?: boolean = false;
}
