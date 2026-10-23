import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { DeptService } from './dept.service';
import { CreateDeptDto, UpdateDeptDto, UpdateDeptSortDto } from './dto/dept.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { OperLog } from '../../common/decorators/oper-log.decorator';

/**
 * 组织架构与部门管理控制器
 * 提供部门树结构递归构建、明细获取、新增部门、拖拽排序/父级归属调整、编辑以及员工防删校验事务删除接口
 */
@Controller('hr/dept')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DeptController {
  constructor(private readonly deptService: DeptService) {}

  /**
   * 获取多级层级嵌套的部门完整组织架构树
   *
   * @returns 返回符合前端 el-tree / el-cascader 规范的部门树状数组
   */
  @Get('tree')
  @Permissions('hr:dept:list')
  async getTree() {
    return this.deptService.getDeptTree();
  }

  /**
   * 根据部门主键 ID 获取部门详细配置信息
   *
   * @param id 部门主键 ID
   * @returns 返回部门实体
   */
  @Get(':id')
  @Permissions('hr:dept:list')
  async getDetail(@Param('id', ParseIntPipe) id: number) {
    return this.deptService.findById(id);
  }

  /**
   * 新增组织部门
   *
   * @param dto 创建部门参数（部门名称、上级部门ID、负责人、联系电话、排序号等）
   * @returns 返回新增后的部门实体
   */
  @Post()
  @Permissions('hr:dept:list')
  @OperLog({ title: '新增部门', businessType: 'INSERT' })
  async create(@Body() dto: CreateDeptDto) {
    return this.deptService.create(dto);
  }

  /**
   * 拖拽或修改部门排序与父级层级归属
   *
   * @param dto 调整载荷（部门ID、目标父级部门ID、最新排序权重值）
   * @returns 返回更新后的部门实体
   */
  @Put('sort')
  @Permissions('hr:dept:list')
  @OperLog({ title: '调整部门层级排序', businessType: 'UPDATE' })
  async updateSort(@Body() dto: UpdateDeptSortDto) {
    return this.deptService.updateSort(dto.id, dto.parentId, dto.sort);
  }

  /**
   * 编辑修改部门基本信息
   *
   * @param id 部门主键 ID
   * @param dto 更新属性载荷
   * @returns 返回修改后的部门实体
   */
  @Put(':id')
  @Permissions('hr:dept:list')
  @OperLog({ title: '修改部门', businessType: 'UPDATE' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDeptDto) {
    return this.deptService.update(id, dto);
  }

  /**
   * 级联删除部门（带在职员工阻断校验）
   * 强事务保障：递归检索当前部门及其全部递归子部门，若任一部门下存在在职员工则抛出异常并阻断删除
   *
   * @param id 待删除的目标根部门 ID
   * @returns 返回受影响的结果
   * @throws {BusinessException} 当部门或子部门下仍有关联在职员工时抛出异常
   */
  @Delete(':id')
  @Permissions('hr:dept:list')
  @OperLog({ title: '删除部门', businessType: 'DELETE' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.deptService.deleteDeptWithCascade(id);
  }
}
