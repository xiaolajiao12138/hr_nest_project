import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Patch,
} from '@nestjs/common';
import { LeaveService } from './leave.service';
import { CreateLeaveDto, AuditLeaveDto, QueryLeaveDto } from './dto/leave.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { OperLog } from '../../common/decorators/oper-log.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

@Controller('hr/leave')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  /**
   * 分页查询请假审批单
   */
  @Get('list')
  @Permissions('hr:leave:list')
  async getPage(@Query() query: QueryLeaveDto) {
    return this.leaveService.findLeavePage(query);
  }

  /**
   * 查询员工当年的年假余额
   */
  @Get('annual-balance/:empId')
  @Permissions('hr:leave:list')
  async getAnnualBalance(
    @Param('empId') empId: number,
    @Query('year') year?: number,
  ) {
    return this.leaveService.getEmployeeAnnualBalance(empId, year);
  }

  /**
   * 提交请假申请（强事务处理：若为年假自动扣减年假账户）
   */
  @Post('apply')
  @Permissions('hr:leave:add')
  @OperLog({ title: '提交请假申请', businessType: 'INSERT' })
  async apply(@Body() dto: CreateLeaveDto) {
    return this.leaveService.applyLeave(dto);
  }

  /**
   * 审批请假单（通过/驳回，若驳回年假则自动原路归还年假天数）
   */
  @Patch(':id/audit')
  @Permissions('hr:leave:audit')
  @OperLog({ title: '审批请假申请', businessType: 'UPDATE' })
  async audit(
    @Param('id') id: number,
    @Body() dto: AuditLeaveDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.leaveService.auditLeave(id, dto, user.userId);
  }
}
