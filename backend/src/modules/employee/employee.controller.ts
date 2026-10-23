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
  ParseIntPipe,
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

/**
 * 员工人事档案管理控制器
 * 提供员工分页检索、档案明细查询、入职建档（强事务自动开辟年假账户）、Excel 模板下载、百万级流式导出、逐行校验全量导入等接口
 */
@Controller('hr/employee')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  /**
   * 分页查询员工档案列表
   * 支持多维度过滤组合：姓名/工号/手机号模糊搜索、部门筛选、在职状态
   *
   * @param query 分页与筛选过滤参数
   * @returns 返回包含员工实体及关联部门的统一分页结果对象
   */
  @Get('list')
  @Permissions('hr:employee:list')
  async getPage(@Query() query: QueryEmployeeDto) {
    return this.employeeService.findEmployeePage(query);
  }

  /**
   * 下载标准化员工 Excel 批量导入模版
   *
   * @param res Express HTTP 响应流
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
   * 采用 WorkbookWriter 管道直推客户端，彻底解决百万级大批量数据导出内存溢出 (OOM)
   *
   * @param query 导出数据筛选条件
   * @param res Express HTTP 响应流
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
   * 根据员工主键 ID 获取员工完整人事档案详情 (Query 传参规范: ?id=xxx)
   * 自动加载关联的部门、身份证正反面附件、学历证明附件实体
   *
   * @param id 员工记录主键 ID
   * @returns 返回员工完整详情对象
   */
  @Get('detail')
  @Permissions('hr:employee:list')
  async getDetailByQuery(@Query('id', ParseIntPipe) id: number) {
    return this.employeeService.findById(id, [
      'dept',
      'idCardFront',
      'idCardBack',
      'eduCert',
    ]);
  }

  /**
   * 根据员工主键 ID 获取员工完整人事档案详情
   * 自动加载关联的部门、身份证正反面附件、学历证明附件实体
   *
   * @param id 员工记录主键 ID
   * @returns 返回员工完整详情对象
   */
  @Get(':id')
  @Permissions('hr:employee:list')
  async getDetail(@Param('id', ParseIntPipe) id: number) {
    return this.employeeService.findById(id, [
      'dept',
      'idCardFront',
      'idCardBack',
      'eduCert',
    ]);
  }

  /**
   * 新增录入员工档案
   * 强事务保证：
   * 1. 唯一性校验（工号、手机号、身份证号）；
   * 2. 持久化员工基础档案；
   * 3. 依据工龄阶梯规则，自动为其初始化本年度法定年假账户。
   *
   * @param dto 创建员工入参载荷
   * @returns 返回持久化后的员工实体
   */
  @Post()
  @Permissions('hr:employee:add')
  @OperLog({ title: '新增员工档案', businessType: 'INSERT' })
  async create(@Body() dto: CreateEmployeeDto) {
    return this.employeeService.createEmployee(dto);
  }

  /**
   * 修改编辑员工人事档案
   *
   * @param id 员工主键 ID
   * @param dto 更新参数载荷
   * @returns 返回更新后的员工实体
   */
  @Put(':id')
  @Permissions('hr:employee:edit')
  @OperLog({ title: '修改员工档案', businessType: 'UPDATE' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEmployeeDto) {
    return this.employeeService.update(id, dto);
  }

  /**
   * 删除指定的员工档案
   *
   * @param id 员工主键 ID
   * @returns 返回删除影响结果
   */
  @Delete(':id')
  @Permissions('hr:employee:delete')
  @OperLog({ title: '删除员工档案', businessType: 'DELETE' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.employeeService.deleteById(id);
  }

  /**
   * Excel 批量导入员工（严格逐行校验 + 全量通过原则强事务）
   * 任意一行格式不合法或存在重复手机号/工号时，整批拒绝导入并返回明确错误行与原因
   *
   * @param file 通过 multipart/form-data 上传的 Excel 二进制文件
   * @returns 成功时返回导入总数；校验不通过时返回错误列表
   */
  @Post('import')
  @Permissions('hr:employee:import')
  @OperLog({ title: 'Excel批量导入员工', businessType: 'IMPORT' })
  @UseInterceptors(FileInterceptor('file'))
  async importExcel(@UploadedFile() file: Express.Multer.File) {
    return this.employeeService.importEmployeesFromExcel(file.buffer);
  }
}
