import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { DeptService } from './dept.service';
import { CreateDeptDto, UpdateDeptDto } from './dto/dept.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { OperLog } from '../../common/decorators/oper-log.decorator';

@Controller('hr/dept')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DeptController {
  constructor(private readonly deptService: DeptService) {}

  /**
   * 获取部门树
   */
  @Get('tree')
  @Permissions('hr:dept:list')
  async getTree() {
    return this.deptService.getDeptTree();
  }

  /**
   * 获取部门详情
   */
  @Get(':id')
  @Permissions('hr:dept:list')
  async getDetail(@Param('id') id: number) {
    return this.deptService.findById(id);
  }

  /**
   * 新增部门
   */
  @Post()
  @Permissions('hr:dept:list')
  @OperLog({ title: '新增部门', businessType: 'INSERT' })
  async create(@Body() dto: CreateDeptDto) {
    return this.deptService.create(dto);
  }

  /**
   * 修改部门
   */
  @Put(':id')
  @Permissions('hr:dept:list')
  @OperLog({ title: '修改部门', businessType: 'UPDATE' })
  async update(@Param('id') id: number, @Body() dto: UpdateDeptDto) {
    return this.deptService.update(id, dto);
  }

  /**
   * 拖拽或修改部门排序/父级
   */
  @Patch(':id/sort')
  @Permissions('hr:dept:list')
  @OperLog({ title: '调整部门层级排序', businessType: 'UPDATE' })
  async updateSort(
    @Param('id') id: number,
    @Body('parentId') parentId: number,
    @Body('sort') sort: number,
  ) {
    return this.deptService.updateSort(id, parentId, sort);
  }

  /**
   * 事务级联删除部门
   */
  @Delete(':id')
  @Permissions('hr:dept:list')
  @OperLog({ title: '删除部门', businessType: 'DELETE' })
  async delete(@Param('id') id: number) {
    return this.deptService.deleteDeptWithCascade(id);
  }
}
