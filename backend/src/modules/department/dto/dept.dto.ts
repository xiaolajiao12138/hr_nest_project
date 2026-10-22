import { IsNotEmpty, IsOptional, IsInt, IsString, IsEmail } from 'class-validator';

export class CreateDeptDto {
  @IsOptional()
  @IsInt()
  parentId?: number = 0;

  @IsNotEmpty({ message: '部门名称不能为空' })
  @IsString()
  deptName: string;

  @IsOptional()
  @IsString()
  leader?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: '邮箱格式不正确' })
  email?: string;

  @IsOptional()
  @IsInt()
  sort?: number = 0;

  @IsOptional()
  @IsInt()
  status?: number = 1;
}

export class UpdateDeptDto extends CreateDeptDto {}
