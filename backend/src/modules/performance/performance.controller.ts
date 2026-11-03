import { AiTool } from '../../common/decorators/ai-tool.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { PerformanceService } from './performance.service';
import {
  QueryPerformanceRecordDto,
  CreatePerformancePlanDto,
  UpdatePerformancePlanDto,
  LaunchAppraisalDto,
  EvaluateAppraisalDto,
  SyncPerformanceToSalaryDto,
} from './dto/performance.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { OperLog } from '../../common/decorators/oper-log.decorator';

@Controller('hr/performance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PerformanceController {
  constructor(private readonly performanceService: PerformanceService) {}

  /**
   * 获取所有考评方案列表
   */
  @AiTool()
@Get('plan/list')
  @Permissions('hr:performance:list')
  async getPlanList(@CurrentUser() user: CurrentUserPayload) {
    return this.performanceService.getPlanList(user);
  }

  /**
   * 创建新的考评方案
   */
  @Post('plan')
  @Permissions('hr:performance:plan')
  @OperLog({ title: '创建绩效考评方案', businessType: 'INSERT' })
  async createPlan(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreatePerformancePlanDto) {
    return this.performanceService.createPlan(dto, user);
  }

  /**
   * 更新考评方案
   */
  @Put('plan/:id')
  @Permissions('hr:performance:plan')
  @OperLog({ title: '修改绩效考评方案', businessType: 'UPDATE' })
  async updatePlan(@CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePerformancePlanDto,
  ) {
    return this.performanceService.updatePlan(id, dto, user);
  }

  /**
   * 删除考评方案
   */
  @Delete('plan/:id')
  @Permissions('hr:performance:plan')
  @OperLog({ title: '删除绩效考评方案', businessType: 'DELETE' })
  async deletePlan(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseIntPipe) id: number) {
    return this.performanceService.deletePlan(id, user);
  }

  /**
   * 分页获取考评记录明细
   */
  @AiTool()
@Get('record/list')
  @Permissions('hr:performance:list')
  async getRecordList(@CurrentUser() user: CurrentUserPayload, @Query() query: QueryPerformanceRecordDto) {
    return this.performanceService.findRecordPage(query, user);
  }

  /**
   * 获取绩效分析统计看板大盘
   */
  @AiTool()
@Get('analytics')
  @Permissions('hr:performance:list')
  async getAnalytics(@CurrentUser() user: CurrentUserPayload, @Query('planId') planId?: number) {
    return this.performanceService.getAnalytics(planId ? Number(planId) : undefined, user);
  }

  /**
   * 批量发起考评单
   */
  @Post('launch')
  @Permissions('hr:performance:start')
  @OperLog({ title: '批量发起绩效考评单', businessType: 'INSERT' })
  async launchAppraisal(@CurrentUser() user: CurrentUserPayload, @Body() dto: LaunchAppraisalDto) {
    return this.performanceService.launchAppraisal(dto, user);
  }

  /**
   * 员工自评或主管打分定级
   */
  @Post('evaluate')
  @Permissions('hr:performance:eval')
  @OperLog({ title: '绩效评审评定打分', businessType: 'UPDATE' })
  async evaluate(@CurrentUser() user: CurrentUserPayload, @Body() dto: EvaluateAppraisalDto) {
    return this.performanceService.evaluate(dto, user);
  }

  /**
   * 考评方案归档
   */
  @Post('archive/:planId')
  @Permissions('hr:performance:archive')
  @OperLog({ title: '归档绩效考评方案', businessType: 'UPDATE' })
  async archivePlan(@CurrentUser() user: CurrentUserPayload, @Param('planId', ParseIntPipe) planId: number) {
    return this.performanceService.archivePlan(planId, user);
  }

  /**
   * 将绩效考评系数一键同步到指定月份薪酬核算表
   */
  @Post('sync-salary')
  @Permissions('hr:salary:sync')
  @OperLog({ title: '绩效系数联动同步至薪资核算', businessType: 'UPDATE' })
  async syncToSalary(@CurrentUser() user: CurrentUserPayload, @Body() dto: SyncPerformanceToSalaryDto) {
    return this.performanceService.syncToSalary(dto, user);
  }

  /**
   * 导出考评结果报表为 Excel
   */
  @Get('export/:planId')
  @Permissions('hr:performance:export')
  async exportReport(@CurrentUser() user: CurrentUserPayload,
    @Res() res: Response,
    @Param('planId', ParseIntPipe) planId: number,
  ) {
    return this.performanceService.exportReport(res, planId, user);
  }
}
