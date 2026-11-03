import { IsNotEmpty, IsString, Length, IsOptional, IsInt, IsArray, IsIn, Min } from 'class-validator';
import { PartialType } from '@nestjs/swagger';

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
  @IsOptional()
  @IsInt()
  @Min(1)
  employeeId?: number;
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
  @IsInt({ each: true })
  @Min(1, { each: true })
  roleIds?: number[];
}

export class UpdateUserDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  employeeId?: number | null;
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
  @IsInt({ each: true })
  @Min(1, { each: true })
  roleIds?: number[];

  @IsOptional()
  @IsInt()
  @IsIn([0, 1])
  status?: number;
}

export class ResetPasswordDto {
  @IsNotEmpty({ message: '用户ID不能为空' })
  @IsInt({ message: '用户ID必须为整数' })
  id: number;

  @IsNotEmpty({ message: '新密码不能为空' })
  @Length(6, 30, { message: '密码长度至少6位' })
  newPassword: string;
}

export class CreateRoleDto {
  @IsOptional() @IsInt() @IsIn([0,1]) status?: number;
  @IsOptional()
  @IsIn(['SELF', 'DEPT', 'DEPT_AND_CHILDREN', 'CUSTOM', 'ALL'])
  dataScope?: 'SELF' | 'DEPT' | 'DEPT_AND_CHILDREN' | 'CUSTOM' | 'ALL';

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  scopeDeptIds?: number[];
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
  @IsInt({ each: true })
  @Min(1, { each: true })
  menuIds?: number[];
}

export class UpdateRoleMenusDto {
  @IsNotEmpty({ message: '角色ID不能为空' })
  @IsInt({ message: '角色ID必须为整数' })
  roleId: number;

  @IsArray({ message: '菜单ID集合必须是数组' })
  @IsInt({each:true}) @Min(1,{each:true})
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

export class ChangeUserStatusDto {
  @IsNotEmpty({ message: '用户ID不能为空' })
  @IsInt({ message: '用户ID必须为整数' })
  id: number;

  @IsNotEmpty({ message: '状态值不能为空' })
  @IsInt({ message: '状态值必须为数值 (1:启用, 0:停用)' })
  @IsIn([0, 1])
  status: number;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString({ message: '真实姓名必须为字符串' })
  @Length(2, 50, { message: '真实姓名长度在 2-50 个字符之间' })
  realName?: string;

  @IsOptional()
  @IsString({ message: '手机号必须为字符串' })
  phone?: string;

  @IsOptional()
  @IsString({ message: '邮箱必须为字符串' })
  email?: string;

  @IsOptional()
  @IsString({ message: '头像地址必须为字符串' })
  avatar?: string;
}

export class UpdatePasswordDto {
  @IsNotEmpty({ message: '旧密码不能为空' })
  @IsString()
  oldPassword: string;

  @IsNotEmpty({ message: '新密码不能为空' })
  @Length(6, 30, { message: '新密码长度至少6位且不超过30位' })
  @IsString()
  newPassword: string;
}

export class UpdateRoleDto extends PartialType(CreateRoleDto) {}
export class UpdateMenuDto extends PartialType(CreateMenuDto) {}
