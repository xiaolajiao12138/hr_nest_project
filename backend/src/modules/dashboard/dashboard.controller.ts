import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * 获取首页工作台统计概览与图表数据
   */
  @Get('stats')
  async getDashboardStats() {
    return this.dashboardService.getDashboardStats();
  }
}
