import { OperLog } from '../../common/decorators/oper-log.decorator';
import { AiTool } from '../../common/decorators/ai-tool.decorator';
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
import type { Response } from 'express';
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
  @OperLog({title:'薪资核算',businessType:'UPDATE'})
  @Permissions('hr:salary:calc')
  async calculateMonthlySalary(@CurrentUser() user: CurrentUserPayload, @Body() dto: CalculateSalaryDto) {
    return this.salaryService.calculateMonthlySalary(dto, user);
  }

  /**
   * 根据 ID 查询单条薪酬详情
   * Query 风格: GET /salary/detail?id=4
   */
  @AiTool()
  @Get('detail')
  @OperLog({title:'读取薪资详情',businessType:'OTHER'})
  @Permissions('hr:salary:list')
  async getSalaryDetail(@CurrentUser() user: CurrentUserPayload, @Query('id', ParseIntPipe) id: number) {
    return this.salaryService.getSalaryDetail(id, user);
  }

  /**
   * 分页查询薪酬列表与核心指标总览
   */
  @AiTool()
  @Get('list')
  @OperLog({title:'读取薪资列表',businessType:'OTHER'})
  @Permissions('hr:salary:list')
  async getSalaryList(@CurrentUser() user: CurrentUserPayload, @Query() query: QuerySalaryDto) {
    return this.salaryService.getSalaryList(query, user);
  }

  /**
   * 手工微调单条薪酬明细
   */
  @Put(':id')
  @OperLog({title:'调整薪资',businessType:'UPDATE'})
  @Permissions('hr:salary:edit')
  async updateSalary(@CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSalaryDto
  ) {
    return this.salaryService.updateSalary(id, dto, user);
  }

  /**
   * 批量审批与流转薪资状态
   */
  @Post('batch-confirm')
  @OperLog({title:'薪资核准发放',businessType:'UPDATE'})
  @Permissions('hr:salary:confirm')
  async batchConfirm(@CurrentUser() user: CurrentUserPayload, @Body() dto: BatchConfirmSalaryDto) {
    return this.salaryService.batchConfirm(dto, user);
  }

  /**
   * 导出月度薪资明细 Excel
   */
  @Get('export')
  @OperLog({title:'导出薪资',businessType:'EXPORT'})
  @Permissions('hr:salary:export')
  async exportExcel(@CurrentUser() user: CurrentUserPayload,
    @Query() query: QuerySalaryDto,
    @Res() res: Response
  ) {
    const buffer = await this.salaryService.exportExcel(query, user);
    const fileName = encodeURIComponent(`员工薪资明细_${query.yearMonth || '全期'}.xlsx`);

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
  @AiTool()
@Get('my-payslips')
  async getMyPayslips(@CurrentUser() user: CurrentUserPayload) {
    return this.salaryService.getMyPayslips(user.userId);
  }

  /**
   * 员工端: 安全验证并解密个人工资条详细数据
   */
  @Post('my-payslips/verify')
  @OperLog({title:'读取个人工资条',businessType:'OTHER'})
  async verifyPayslip(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: VerifyPayslipDto
  ) {
    return this.salaryService.verifyPayslip(user.userId, dto);
  }
}
