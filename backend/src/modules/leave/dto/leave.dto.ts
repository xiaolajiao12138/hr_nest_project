import {
  IsNotEmpty,
  IsInt,
  IsNumber,
  IsString,
  IsIn,
  IsOptional,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PageParamDto } from '../../../common/dto/page-param.dto';

export class QueryLeaveDto extends PageParamDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  leaveType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  deptId?: number;
}

export class CreateLeaveDto {
  @IsNotEmpty({ message: '请选择申请员工' })
  @IsInt()
  empId: number;

  @IsNotEmpty({ message: '请选择请假类型' })
  @IsIn(['ANNUAL', 'SICK', 'CASUAL'], {
    message: '请假类型仅限 ANNUAL(年假)、SICK(病假)、CASUAL(事假)',
  })
  leaveType: string;

  @IsNotEmpty({ message: '请假开始时间不能为空' })
  startTime: string;

  @IsNotEmpty({ message: '请假结束时间不能为空' })
  endTime: string;

  @IsNotEmpty({ message: '请假天数不能为空' })
  @Type(() => Number)
  @IsNumber()
  @Min(0.5, { message: '请假天数最少0.5天' })
  days: number;

  @IsNotEmpty({ message: '请假事由不能为空' })
  @IsString()
  reason: string;
}

export class AuditLeaveDto {
  @IsNotEmpty({ message: '请假单ID不能为空' })
  @IsInt({ message: '请假单ID必须为整数' })
  id: number;

  @IsNotEmpty({ message: '审批动作不能为空' })
  @IsIn(['APPROVED', 'REJECTED'], {
    message: '审批动作仅限 APPROVED 或 REJECTED',
  })
  action: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  auditRemark?: string;
}

/**
 * 全员年假额度台账分页查询 DTO
 */
export class QueryAnnualLeaveDto extends PageParamDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  deptId?: number;
}

/**
 * 手动调整员工年假额度 DTO
 */
export class AdjustAnnualLeaveDto {
  @IsNotEmpty({ message: '年假账户ID不能为空' })
  @IsInt()
  id: number;

  @IsNotEmpty({ message: '总年假天数不能为空' })
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: '总年假天数不能小于0' })
  totalDays: number;

  @IsOptional()
  @IsString()
  remark?: string;
}

/**
 * 批量为指定年度全员初始化年假额度 DTO
 */
export class InitAnnualLeaveDto {
  @IsNotEmpty({ message: '核算年份不能为空' })
  @Type(() => Number)
  @IsInt()
  year: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  defaultDays?: number;
}
