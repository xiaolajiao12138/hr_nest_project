import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PageParamDto } from '../../../common/dto/page-param.dto';

/**
 * 班次新增与修改入参
 */
export class SaveShiftDto {
  @IsString()
  @IsNotEmpty({ message: '班次名称不能为空' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: '上班标准时间不能为空，格式如 09:00' })
  startTime: string;

  @IsString()
  @IsNotEmpty({ message: '下班标准时间不能为空，格式如 18:00' })
  endTime: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  lateTolerance?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  earlyTolerance?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(24)
  @Type(() => Number)
  workHours?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  status?: number;

  @IsOptional()
  @IsString()
  remark?: string;
}

/**
 * 批量设置排班入参
 */
export class BatchSetScheduleDto {
  @IsArray()
  @IsNotEmpty({ message: '请至少选择一位员工' })
  empIds: number[];

  @IsString()
  @IsNotEmpty({ message: '排班起始日期不能为空 (YYYY-MM-DD)' })
  startDate: string;

  @IsString()
  @IsNotEmpty({ message: '排班结束日期不能为空 (YYYY-MM-DD)' })
  endDate: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  shiftId?: number;

  @IsOptional()
  @IsBoolean()
  isRest?: boolean;

  @IsOptional()
  @IsBoolean()
  includeWeekends?: boolean; // 默认周末自动排休
}

/**
 * 员工打卡入参
 */
export class ClockInDto {
  @IsOptional()
  @IsString()
  type?: 'CHECK_IN' | 'CHECK_OUT' | 'AUTO';

  @IsOptional()
  @IsString()
  ip?: string;

  @IsOptional()
  @IsString()
  remark?: string;
}

/**
 * 考勤明细列表查询入参 (统一使用 empId, deptId, yearMonth, status, keyword)
 */
export class QueryAttendanceRecordDto extends PageParamDto {
  @IsOptional()
  @IsString()
  yearMonth?: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  deptId?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  empId?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  status?: number;
}

/**
 * 人工补卡与修正考勤记录入参
 */
export class RepairAttendanceDto {
  @IsNumber()
  @Type(() => Number)
  recordId: number;

  @IsOptional()
  @IsString()
  checkInTime?: string;

  @IsOptional()
  @IsString()
  checkOutTime?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  status?: number;

  @IsOptional()
  @IsString()
  remark?: string;
}
