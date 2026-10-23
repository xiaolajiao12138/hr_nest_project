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
import { Response } from 'express';
import { PerformanceService } from './performance.service';
import {
  QueryPerformanceRecordDto,
  CreatePerformancePlanDto,
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
  @Get('plan/list')
  @Permissions('hr:performance:list')
  async getPlanList() {
    return this.performanceService.getPlanList();
  }

  /**
   * 创建新的考评方案
   */
  @Post('plan')
  @Permissions('hr:performance:plan')
  @OperLog({ title: '创建绩效考评方案', businessType: 'INSERT' })
  async createPlan(@Body() dto: CreatePerformancePlanDto) {
    return this.performanceService.createPlan(dto);
  }

  /**
   * 更新考评方案
   */
  @Put('plan/:id')
  @Permissions('hr:performance:plan')
  @OperLog({ title: '修改绩效考评方案', businessType: 'UPDATE' })
  async updatePlan(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreatePerformancePlanDto>,
  ) {
    return this.performanceService.updatePlan(id, dto);
  }

  /**
   * 删除考评方案
   */
  @Delete('plan/:id')
  @Permissions('hr:performance:plan')
  @OperLog({ title: '删除绩效考评方案', businessType: 'DELETE' })
  async deletePlan(@Param('id', ParseIntPipe) id: number) {
    return this.performanceService.deletePlan(id);
  }

  /**
   * 分页获取考评记录明细
   */
  @Get('record/list')
  @Permissions('hr:performance:list')
  async getRecordList(@Query() query: QueryPerformanceRecordDto) {
    return this.performanceService.findRecordPage(query);
  }

  /**
   * 获取绩效分析统计看板大盘
   */
  @Get('analytics')
  @Permissions('hr:performance:list')
  async getAnalytics(@Query('planId') planId?: number) {
    return this.performanceService.getAnalytics(planId ? Number(planId) : undefined);
  }

  /**
   * 批量发起考评单
   */
  @Post('launch')
  @Permissions('hr:performance:start')
  @OperLog({ title: '批量发起绩效考评单', businessType: 'INSERT' })
  async launchAppraisal(@Body() dto: LaunchAppraisalDto) {
    return this.performanceService.launchAppraisal(dto);
  }

  /**
   * 员工自评或主管打分定级
   */
  @Post('evaluate')
  @Permissions('hr:performance:eval')
  @OperLog({ title: '绩效评审评定打分', businessType: 'UPDATE' })
  async evaluate(@Body() dto: EvaluateAppraisalDto) {
    return this.performanceService.evaluate(dto);
  }

  /**
   * 考评方案归档
   */
  @Post('archive/:planId')
  @Permissions('hr:performance:archive')
  @OperLog({ title: '归档绩效考评方案', businessType: 'UPDATE' })
  async archivePlan(@Param('planId', ParseIntPipe) planId: number) {
    return this.performanceService.archivePlan(planId);
  }

  /**
   * 将绩效考评系数一键同步到指定月份薪酬核算表
   */
  @Post('sync-salary')
  @Permissions('hr:performance:eval')
  @OperLog({ title: '绩效系数联动同步至薪资核算', businessType: 'UPDATE' })
  async syncToSalary(@Body() dto: SyncPerformanceToSalaryDto) {
    return this.performanceService.syncToSalary(dto);
  }

  /**
   * 导出考评结果报表为 Excel
   */
  @Get('export/:planId')
  @Permissions('hr:performance:export')
  async exportReport(
    @Res() res: Response,
    @Param('planId', ParseIntPipe) planId: number,
  ) {
    return this.performanceService.exportReport(res, planId);
  }
}
