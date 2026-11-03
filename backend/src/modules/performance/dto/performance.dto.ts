import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, Max, IsArray, IsInt, IsIn, Matches, IsDateString } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { PageParamDto } from '../../../common/dto/page-param.dto';

/**
 * 考评记录明细分页查询 DTO
 */
export class QueryPerformanceRecordDto extends PageParamDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  planId?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  deptId?: number;

  @IsOptional()
  @IsString()
  @IsIn(['PENDING_SELF', 'PENDING_MANAGER', 'COMPLETED'])
  @Transform(({ value }) => (value === '' ? undefined : value))
  status?: string;

  @IsOptional()
  @IsString()
  rating?: string;
}

/**
 * 创建/更新考核方案 DTO
 */
export class CreatePerformancePlanDto {
  @IsString()
  @IsNotEmpty({ message: '方案名称不能为空' })
  title: string;

  @IsString()
  @IsNotEmpty({ message: '周期类型不能为空' })
  @IsIn(['MONTHLY', 'QUARTERLY', 'ANNUAL'])
  cycleType: string;

  @IsString()
  @IsNotEmpty({ message: '起始日期不能为空' })
  @IsDateString()
  startDate: string;

  @IsString()
  @IsNotEmpty({ message: '截止日期不能为空' })
  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  weightSelf?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  weightManager?: number;

  @IsOptional()
  @IsString()
  metrics?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  remark?: string;
}

/**
 * 批量发起考评入参 DTO
 */
export class LaunchAppraisalDto {
  @IsNumber()
  @Type(() => Number)
  @IsNotEmpty({ message: '考评方案ID不能为空' })
  planId: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  deptIds?: number[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  empIds?: number[];
}

/**
 * 单个员工考评打分入参 DTO
 */
export class EvaluateAppraisalDto {
  @IsNumber()
  @Type(() => Number)
  @IsNotEmpty({ message: '考评明细ID不能为空' })
  recordId: number;

  @IsString()
  @IsNotEmpty({ message: '打分评审类型不能为空(self/manager/both)' })
  @IsIn(['self', 'manager'])
  evalType: 'self' | 'manager' | 'both';

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  selfScore?: number;

  @IsOptional()
  @IsString()
  selfComment?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  managerScore?: number;

  @IsOptional()
  @IsString()
  managerComment?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  customFinalScore?: number;

  @IsOptional()
  @IsString()
  @IsIn(['S', 'A', 'B', 'C', 'D'])
  customRating?: string;
}

/**
 * 将绩效结果同步至薪资核算 DTO
 */
export class SyncPerformanceToSalaryDto {
  @IsNumber()
  @Type(() => Number)
  @IsNotEmpty({ message: '考评方案ID不能为空' })
  planId: number;

  @IsString()
  @IsNotEmpty({ message: '薪资生效月份不能为空 (格式: YYYY-MM)' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  yearMonth: string;
}

export class UpdatePerformancePlanDto extends PartialType(CreatePerformancePlanDto) { }
