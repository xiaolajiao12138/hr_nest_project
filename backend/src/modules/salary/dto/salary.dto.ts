import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, IsBoolean, IsArray, IsInt, IsIn, Length, Matches, ArrayNotEmpty, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { PageParamDto } from '../../../common/dto/page-param.dto';

/**
 * 月度薪酬一键智能核算入参
 */
export class CalculateSalaryDto {
  @IsOptional()
  @IsBoolean()
  overwrite?: boolean = false;
  @IsString()
  @IsNotEmpty({ message: '核算月份不能为空，格式如 2026-10' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  yearMonth: string;
}

/**
 * 薪资列表查询过滤条件
 */
export class QuerySalaryDto extends PageParamDto {
  @IsOptional()
  @IsString()
  yearMonth?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  deptId?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  departmentId?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  status?: number;
}

/**
 * 单条薪资明细手工微调入参
 */
export class UpdateSalaryDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  baseSalary?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  postSalary?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  performanceSalary?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  overtimeSalary?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  allowance?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  leaveDeduction?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  socialSecurity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  housingFund?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  tax?: number;

  @IsOptional()
  @IsString()
  remark?: string;

  @IsOptional()
  @IsString()
  @Length(6, 72)
  payslipPassword?: string;
}

/**
 * 批量审批与发放薪资入参
 */
export class BatchConfirmSalaryDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsNotEmpty({ message: '待操作记录ID列表不能为空' })
  ids: number[];

  @IsNumber()
  @IsIn([2, 3])
  @Type(() => Number)
  targetStatus: number; // 2:已核准 3:已发放
}

/**
 * 员工端工资条查看安全验证入参
 */
export class VerifyPayslipDto {
  @IsNumber()
  @Type(() => Number)
  salaryId: number;

  @IsOptional()
  @IsString()
  password?: string;
}
