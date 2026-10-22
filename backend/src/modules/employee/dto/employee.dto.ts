import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsInt,
  IsNumber,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PageParamDto } from '../../../common/dto/page-param.dto';

export class QueryEmployeeDto extends PageParamDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  deptId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status?: number;

  @IsOptional()
  @IsString()
  post?: string;
}

export class CreateEmployeeDto {
  @IsNotEmpty({ message: '工号不能为空' })
  @IsString()
  empNo: string;

  @IsNotEmpty({ message: '姓名不能为空' })
  @IsString()
  name: string;

  @IsOptional()
  gender?: string = '男';

  @IsNotEmpty({ message: '手机号不能为空' })
  @Matches(/^1[3-9]\d{9}$/, { message: '请输入合法的11位手机号码' })
  phone: string;

  @IsNotEmpty({ message: '身份证号不能为空' })
  @Matches(/(^\d{15}$)|(^\d{18}$)|(^\d{17}(\d|X|x)$)/, {
    message: '身份证号格式不合规',
  })
  idCard: string;

  @IsOptional()
  @IsInt()
  idCardFrontId?: number;

  @IsOptional()
  @IsInt()
  idCardBackId?: number;

  @IsOptional()
  @IsInt()
  eduCertId?: number;

  @IsNotEmpty({ message: '入职时间不能为空' })
  entryDate: string;

  @IsNotEmpty({ message: '岗位职位不能为空' })
  post: string;

  @IsNotEmpty({ message: '所属部门不能为空' })
  @IsInt()
  deptId: number;

  @IsOptional()
  education?: string = '本科';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  salary?: number = 0;

  @IsOptional()
  @IsInt()
  status?: number = 1;

  @IsOptional()
  remark?: string;
}

export class UpdateEmployeeDto extends CreateEmployeeDto {}
