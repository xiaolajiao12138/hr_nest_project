import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
  ParseIntPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { SalaryService } from './salary.service';
import {
  CalculateSalaryDto,
  QuerySalaryDto,
  UpdateSalaryDto,
  BatchConfirmSalaryDto,
  VerifyPayslipDto,
} from './dto/salary.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

/**
 * 薪酬核算与电子工资条管理控制器
 */
@Controller('salary')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalaryController {
  constructor(private readonly salaryService: SalaryService) {}

  /**
   * 一键智能核算当月全员薪资草稿
   */
  @Post('calculate')
  @Permissions('hr:salary:calc')
  async calculateMonthlySalary(@Body() dto: CalculateSalaryDto) {
    return this.salaryService.calculateMonthlySalary(dto);
  }

  /**
   * 根据 ID 查询单条薪酬详情
   * Query 风格: GET /salary/detail?id=4
   */
  @Get('detail')
  @Permissions('hr:salary:list')
  async getSalaryDetail(@Query('id', ParseIntPipe) id: number) {
    return this.salaryService.getSalaryDetail(id);
  }

  /**
   * 分页查询薪酬列表与核心指标总览
   */
  @Get('list')
  @Permissions('hr:salary:list')
  async getSalaryList(@Query() query: QuerySalaryDto) {
    return this.salaryService.getSalaryList(query);
  }

  /**
   * 手工微调单条薪酬明细
   */
  @Put(':id')
  @Permissions('hr:salary:edit')
  async updateSalary(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSalaryDto
  ) {
    return this.salaryService.updateSalary(id, dto);
  }

  /**
   * 批量审批与流转薪资状态
   */
  @Post('batch-confirm')
  @Permissions('hr:salary:confirm')
  async batchConfirm(@Body() dto: BatchConfirmSalaryDto) {
    return this.salaryService.batchConfirm(dto);
  }

  /**
   * 导出月度薪资明细 Excel
   */
  @Get('export')
  @Permissions('hr:salary:export')
  async exportExcel(
    @Query('yearMonth') yearMonth: string,
    @Res() res: Response
  ) {
    const buffer = await this.salaryService.exportExcel(yearMonth);
    const fileName = encodeURIComponent(`员工薪资明细_${yearMonth || '全期'}.xlsx`);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  }

  /**
   * 员工端: 获取个人电子工资条历史列表
   */
  @Get('my-payslips')
  async getMyPayslips(@CurrentUser() user: CurrentUserPayload) {
    return this.salaryService.getMyPayslips(user.userId);
  }

  /**
   * 员工端: 安全验证并解密个人工资条详细数据
   */
  @Post('my-payslips/verify')
  async verifyPayslip(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: VerifyPayslipDto
  ) {
    return this.salaryService.verifyPayslip(user.userId, dto);
  }
}
