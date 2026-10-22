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
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { EmployeeService } from './employee.service';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  QueryEmployeeDto,
} from './dto/employee.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { OperLog } from '../../common/decorators/oper-log.decorator';

@Controller('hr/employee')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  /**
   * 分页查询员工列表
   */
  @Get('list')
  @Permissions('hr:employee:list')
  async getPage(@Query() query: QueryEmployeeDto) {
    return this.employeeService.findEmployeePage(query);
  }

  /**
   * 下载员工 Excel 批量导入模板
   */
  @Get('template/download')
  @Permissions('hr:employee:import')
  async downloadTemplate(@Res() res: Response) {
    const buffer = await this.employeeService.getImportTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="employee_import_template.xlsx"',
    );
    res.end(buffer);
  }

  /**
   * 大数据分页流式导出员工 Excel
   */
  @Get('export/excel')
  @Permissions('hr:employee:export')
  @OperLog({ title: '导出员工档案Excel', businessType: 'EXPORT' })
  async exportExcel(
    @Query() query: QueryEmployeeDto,
    @Res() res: Response,
  ) {
    await this.employeeService.exportEmployeesStream(res, query);
  }

  /**
   * 获取员工详情
   */
  @Get(':id')
  @Permissions('hr:employee:list')
  async getDetail(@Param('id') id: number) {
    return this.employeeService.findById(id, [
      'dept',
      'idCardFront',
      'idCardBack',
      'eduCert',
    ]);
  }

  /**
   * 新增员工档案
   */
  @Post()
  @Permissions('hr:employee:add')
  @OperLog({ title: '新增员工档案', businessType: 'INSERT' })
  async create(@Body() dto: CreateEmployeeDto) {
    return this.employeeService.createEmployee(dto);
  }

  /**
   * 编辑员工档案
   */
  @Put(':id')
  @Permissions('hr:employee:edit')
  @OperLog({ title: '修改员工档案', businessType: 'UPDATE' })
  async update(@Param('id') id: number, @Body() dto: UpdateEmployeeDto) {
    return this.employeeService.update(id, dto);
  }

  /**
   * 删除员工档案
   */
  @Delete(':id')
  @Permissions('hr:employee:delete')
  @OperLog({ title: '删除员工档案', businessType: 'DELETE' })
  async delete(@Param('id') id: number) {
    return this.employeeService.deleteById(id);
  }

  /**
   * Excel 批量导入员工（严格校验 + 整体事务回滚）
   */
  @Post('import')
  @Permissions('hr:employee:import')
  @OperLog({ title: 'Excel批量导入员工', businessType: 'IMPORT' })
  @UseInterceptors(FileInterceptor('file'))
  async importExcel(@UploadedFile() file: Express.Multer.File) {
    return this.employeeService.importEmployeesFromExcel(file.buffer);
  }
}
