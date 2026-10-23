import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService, DashboardStatsResult } from './dashboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

/**
 * 首页工作台大屏统计控制器
 * 提供汇总看板卡片数值、部门编制分布柱状图、学历构成饼图与考勤折线图数据
 */
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * 获取首页工作台多维度统计聚合指标
   *
   * @returns 返回工作台全量图表及指标聚合对象
   */
  @Get('stats')
  async getDashboardStats(): Promise<DashboardStatsResult> {
    return this.dashboardService.getDashboardStats();
  }
}
