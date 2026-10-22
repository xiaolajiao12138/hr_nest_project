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

export class UpdateDeptSortDto {
  @IsNotEmpty({ message: '部门ID不能为空' })
  @IsInt({ message: '部门ID必须为整数' })
  id: number;

  @IsOptional()
  @IsInt({ message: '父级ID必须为整数' })
  parentId?: number;

  @IsNotEmpty({ message: '排序值不能为空' })
  @IsInt({ message: '排序值必须为整数' })
  sort: number;
}
