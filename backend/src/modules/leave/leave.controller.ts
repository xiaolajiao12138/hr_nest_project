import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { LeaveService } from './leave.service';
import {
  CreateLeaveDto,
  AuditLeaveDto,
  QueryLeaveDto,
  QueryAnnualLeaveDto,
  AdjustAnnualLeaveDto,
  InitAnnualLeaveDto,
} from './dto/leave.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { OperLog } from '../../common/decorators/oper-log.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

/**
 * 请假与审批管理控制器
 * 提供待办审批统计、请假单分页查询、年假余额核算、请假申请提交以及审批（通过/驳回强事务）等接口
 */
@Controller('hr/leave')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  /**
   * 获取当前待审批请假任务总数
   * 用于顶部 Header 铃铛待办徽标和工作台概览卡片的实时数据呈现
   *
   * @returns 返回待审批单据总数 { count: number }
   */
  @Get('pending-count')
  @Permissions('hr:leave:list')
  async getPendingCount() {
    return this.leaveService.getPendingCount();
  }

  /**
   * 根据 ID 查询请假单详情
   * Query 风格: GET /hr/leave/detail?id=4
   */
  @Get('detail')
  @Permissions('hr:leave:list')
  async getDetail(@Query('id', ParseIntPipe) id: number) {
    return this.leaveService.getLeaveDetail(id);
  }

  /**
   * 分页查询请假审批单列表
   *
   * @param query 分页与筛选条件（包含页码、页大小、员工ID、审批状态、请假类型等）
   * @returns 返回包含请假单实体和关联员工、审批人信息的标准分页结果
   */
  @Get('list')
  @Permissions('hr:leave:list')
  async getPage(@Query() query: QueryLeaveDto) {
    return this.leaveService.findLeavePage(query);
  }

  /**
   * 查询指定员工当年的年假账户余额与历史核销记录
   *
   * @param empId 员工主键 ID
   * @param year 查询年份（可选，默认为当前公历年）
   * @returns 返回该员工对应年度的年假总额、已用额度及剩余天数
   */
  @Get('annual-balance/:empId')
  @Permissions('hr:leave:list')
  async getAnnualBalance(
    @Param('empId', ParseIntPipe) empId: number,
    @Query('year') year?: number,
  ) {
    return this.leaveService.getEmployeeAnnualBalance(empId, year);
  }

  /**
   * 员工提交请假申请
   * 采用强事务与行锁保障：若类型为年假，即时校验并预扣减年假账户额度；同时触发 SSE 全员待办总数更新广播
   *
   * @param dto 请假申请参数（员工ID、请假类型、起止时间戳、申请理由）
   * @returns 返回创建成功的请假实体
   * @throws {BusinessException} 当年假余额不足或时间区间冲突时抛出异常并自动回滚事务
   */
  @Post('apply')
  @Permissions('hr:leave:add')
  @OperLog({ title: '提交请假申请', businessType: 'INSERT' })
  async apply(@Body() dto: CreateLeaveDto) {
    return this.leaveService.applyLeave(dto);
  }

  /**
   * 主管/HR 审批请假单
   * 采用强事务保障：
   * 1. 若审批驳回且为年假类型，自动原路回滚返还预扣的年假额度；
   * 2. 更新单据状态为已批准/已驳回；
   * 3. 通过 SSE 向申请人定向推送弹窗通知，并广播更新待办任务数。
   *
   * @param dto 审批请求载荷（请假单ID、审批动作 APPROVED/REJECTED、审批意见）
   * @param user 当前执行审批操作的登录用户上下文
   * @returns 返回更新后的请假单记录
   * @throws {BusinessException} 当请假单不存在或已被重复审批时抛出业务异常
   */
  @Put('audit')
  @Permissions('hr:leave:audit')
  @OperLog({ title: '审批请假申请', businessType: 'UPDATE' })
  async audit(
    @Body() dto: AuditLeaveDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.leaveService.auditLeave(dto.id, dto, user.userId);
  }

  /**
   * 分页查询全员年假额度台账
   */
  @Get('annual/list')
  @Permissions('hr:leave:list')
  async getAnnualPage(@Query() query: QueryAnnualLeaveDto) {
    return this.leaveService.findAnnualLeavePage(query);
  }

  /**
   * 手动微调员工年假额度
   */
  @Put('annual/adjust')
  @Permissions('hr:leave:audit')
  @OperLog({ title: '手动微调员工年假额度', businessType: 'UPDATE' })
  async adjustAnnual(@Body() dto: AdjustAnnualLeaveDto) {
    return this.leaveService.adjustAnnualLeave(dto);
  }

  /**
   * 批量为指定年度全员自动初始化开辟年假账户
   */
  @Post('annual/init-year')
  @Permissions('hr:leave:audit')
  @OperLog({ title: '全员年假额度年度初始化', businessType: 'INSERT' })
  async initAnnualForYear(@Body() dto: InitAnnualLeaveDto) {
    return this.leaveService.initAnnualLeaveForYear(dto);
  }
}
