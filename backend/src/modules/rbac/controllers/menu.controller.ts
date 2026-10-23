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
import { MenuService } from '../services/menu.service';
import { CreateMenuDto } from '../dto/rbac.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { OperLog } from '../../../common/decorators/oper-log.decorator';

/**
 * 系统菜单与动态权限路由控制器
 * 维护系统目录、菜单及按钮级权限标识元数据，提供树状检索、详情、新增、修改与删除接口
 */
@Controller('system/menu')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  /**
   * 获取全量系统菜单与权限树
   * 包含目录、菜单与按钮三级结构，用于系统菜单管理面板展示以及角色权限分配勾选树
   *
   * @returns 返回符合前端树形控件规范的多级菜单树
   */
  @Get('tree')
  @Permissions('system:menu:list')
  async getMenuTree() {
    return this.menuService.getMenuTree();
  }

  /**
   * 根据菜单主键 ID 获取菜单详情
   *
   * @param id 菜单记录主键 ID
   * @returns 返回菜单详细信息实体
   */
  @Get(':id')
  @Permissions('system:menu:list')
  async getDetail(@Param('id', ParseIntPipe) id: number) {
    return this.menuService.findById(id);
  }

  /**
   * 新增菜单或按钮权限
   *
   * @param dto 创建菜单入参（包含菜单名称、父级ID、前端路由路径、组件映射地址、图标、排序、权限码等）
   * @returns 返回创建成功的菜单记录
   */
  @Post()
  @Permissions('system:menu:list')
  @OperLog({ title: '新增菜单路由', businessType: 'INSERT' })
  async create(@Body() dto: CreateMenuDto) {
    return this.menuService.create(dto);
  }

  /**
   * 修改编辑已有的系统菜单或按钮权限
   *
   * @param id 菜单记录主键 ID
   * @param dto 更新属性载荷
   * @returns 返回更新后的菜单记录
   */
  @Put(':id')
  @Permissions('system:menu:list')
  @OperLog({ title: '编辑菜单路由', businessType: 'UPDATE' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateMenuDto>) {
    return this.menuService.update(id, dto);
  }

  /**
   * 删除指定的系统菜单或权限节点
   *
   * @param id 待删除的菜单记录主键 ID
   * @returns 返回删除受影响的结果
   */
  @Delete(':id')
  @Permissions('system:menu:list')
  @OperLog({ title: '删除菜单路由', businessType: 'DELETE' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.menuService.deleteById(id);
  }
}
