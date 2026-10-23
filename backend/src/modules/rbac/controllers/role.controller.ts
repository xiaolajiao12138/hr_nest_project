import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { RoleService } from '../services/role.service';
import { CreateRoleDto, UpdateRoleMenusDto } from '../dto/rbac.dto';
import { PageParamDto } from '../../../common/dto/page-param.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { OperLog } from '../../../common/decorators/oper-log.decorator';

/**
 * 角色与权限授权管理控制器
 * 提供角色分页查询、启用的全量角色下拉获取、角色对应菜单权限查询、创建角色、分配菜单权限、修改与删除接口
 */
@Controller('system/role')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  /**
   * 分页获取系统角色列表
   *
   * @param pageParam 分页请求参数
   * @returns 返回角色分页列表及总数
   */
  @Get('list')
  @Permissions('system:role:list')
  async getPage(@Query() pageParam: PageParamDto) {
    return this.roleService.findPage(pageParam);
  }

  /**
   * 获取所有正常启用的角色简要列表
   * 供用户管理模块新增/编辑用户时，在角色分配下拉框中快速加载选项
   *
   * @returns 返回状态为 1 的角色列表
   */
  @Get('all')
  async getAllRoles() {
    return this.roleService.findList({ status: 1 });
  }

  /**
   * 获取指定角色详情 (Query 传参规范: ?id=xxx)
   *
   * @param id 角色主键 ID
   * @returns 返回角色实体
   */
  @Get('detail')
  @Permissions('system:role:list')
  async getDetailByQuery(@Query('id', ParseIntPipe) id: number) {
    return this.roleService.findById(id);
  }

  /**
   * 获取指定角色当前已绑定的菜单与权限 ID 集合
   *
   * @param id 角色主键 ID
   * @returns 返回该角色已授权的菜单主键数组 number[]
   */
  @Get(':id/menus')
  @Permissions('system:role:list')
  async getRoleMenus(@Param('id', ParseIntPipe) id: number) {
    return this.roleService.getRoleMenuIds(id);
  }

  /**
   * 新增系统角色
   *
   * @param dto 创建角色入参（角色名称、角色唯一字符编码 roleKey、排序号、状态等）
   * @returns 返回新增后的角色实体
   */
  @Post()
  @Permissions('system:role:add')
  @OperLog({ title: '新增角色', businessType: 'INSERT' })
  async create(@Body() dto: CreateRoleDto) {
    return this.roleService.createRole(dto);
  }

  /**
   * 为角色重新分配关联的菜单与按钮权限
   * 强事务保证：先清空原有角色菜单关联中间表，再批量插入最新的授权集合
   *
   * @param dto 分配入参（roleId、menuIds 数组）
   * @returns 返回授权结果布尔值
   */
  @Put('menus')
  @Permissions('system:role:edit')
  @OperLog({ title: '分配角色权限', businessType: 'UPDATE' })
  async updateRoleMenus(@Body() dto: UpdateRoleMenusDto) {
    return this.roleService.updateRoleMenus(dto.roleId, dto);
  }

  /**
   * 编辑修改角色基础信息
   *
   * @param id 角色主键 ID
   * @param dto 角色属性更新载荷
   * @returns 返回更新后的角色实体
   */
  @Put(':id')
  @Permissions('system:role:edit')
  @OperLog({ title: '编辑角色', businessType: 'UPDATE' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateRoleDto>) {
    return this.roleService.update(id, dto);
  }

  /**
   * 删除系统角色
   *
   * @param id 待删除的角色主键 ID
   * @returns 返回删除影响结果
   */
  @Delete(':id')
  @Permissions('system:role:delete')
  @OperLog({ title: '删除角色', businessType: 'DELETE' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.roleService.deleteById(id);
  }
}
