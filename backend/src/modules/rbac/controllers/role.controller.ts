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
} from '@nestjs/common';
import { RoleService } from '../services/role.service';
import { CreateRoleDto, UpdateRoleMenusDto } from '../dto/rbac.dto';
import { PageParamDto } from '../../../common/dto/page-param.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { OperLog } from '../../../common/decorators/oper-log.decorator';

@Controller('system/role')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  /**
   * 分页获取角色列表
   */
  @Get('list')
  @Permissions('system:role:list')
  async getPage(@Query() pageParam: PageParamDto) {
    return this.roleService.findPage(pageParam);
  }

  /**
   * 获取所有启用的角色列表（用于用户分配角色下拉）
   */
  @Get('all')
  async getAllRoles() {
    return this.roleService.findList({ status: 1 });
  }

  /**
   * 获取指定角色拥有的菜单ID列表
   */
  @Get(':id/menus')
  @Permissions('system:role:list')
  async getRoleMenus(@Param('id') id: number) {
    return this.roleService.getRoleMenuIds(id);
  }

  /**
   * 新增角色
   */
  @Post()
  @Permissions('system:role:add')
  @OperLog({ title: '新增角色', businessType: 'INSERT' })
  async create(@Body() dto: CreateRoleDto) {
    return this.roleService.createRole(dto);
  }

  /**
   * 编辑角色
   */
  @Put(':id')
  @Permissions('system:role:edit')
  @OperLog({ title: '编辑角色', businessType: 'UPDATE' })
  async update(@Param('id') id: number, @Body() dto: Partial<CreateRoleDto>) {
    return this.roleService.update(id, dto);
  }

  /**
   * 分配角色菜单与按钮权限
   */
  @Put('menus')
  @Permissions('system:role:edit')
  @OperLog({ title: '分配角色权限', businessType: 'UPDATE' })
  async updateRoleMenus(@Body() dto: UpdateRoleMenusDto) {
    return this.roleService.updateRoleMenus(dto.roleId, dto);
  }

  /**
   * 删除角色
   */
  @Delete(':id')
  @Permissions('system:role:delete')
  @OperLog({ title: '删除角色', businessType: 'DELETE' })
  async delete(@Param('id') id: number) {
    return this.roleService.deleteById(id);
  }
}
