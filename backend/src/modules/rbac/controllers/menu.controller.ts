import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { MenuService } from '../services/menu.service';
import { CreateMenuDto } from '../dto/rbac.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { OperLog } from '../../../common/decorators/oper-log.decorator';

@Controller('system/menu')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  /**
   * 获取全量树形菜单（用于菜单管理页面展示与分配权限）
   */
  @Get('tree')
  @Permissions('system:menu:list')
  async getMenuTree() {
    return this.menuService.getMenuTree();
  }

  /**
   * 获取菜单详情
   */
  @Get(':id')
  @Permissions('system:menu:list')
  async getDetail(@Param('id') id: number) {
    return this.menuService.findById(id);
  }

  /**
   * 新增菜单
   */
  @Post()
  @Permissions('system:menu:list')
  @OperLog({ title: '新增菜单路由', businessType: 'INSERT' })
  async create(@Body() dto: CreateMenuDto) {
    return this.menuService.create(dto);
  }

  /**
   * 编辑菜单
   */
  @Put(':id')
  @Permissions('system:menu:list')
  @OperLog({ title: '编辑菜单路由', businessType: 'UPDATE' })
  async update(@Param('id') id: number, @Body() dto: Partial<CreateMenuDto>) {
    return this.menuService.update(id, dto);
  }

  /**
   * 删除菜单
   */
  @Delete(':id')
  @Permissions('system:menu:list')
  @OperLog({ title: '删除菜单路由', businessType: 'DELETE' })
  async delete(@Param('id') id: number) {
    return this.menuService.deleteById(id);
  }
}
