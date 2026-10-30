import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Role } from '../entities/role.entity';
import { Menu } from '../entities/menu.entity';
import { BaseService } from '../../../common/base/base.service';
import { CreateRoleDto, UpdateRoleMenusDto } from '../dto/rbac.dto';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { AuthCacheService } from './auth-cache.service';
import { SseService } from '../../sse/sse.service';

@Injectable()
export class RoleService extends BaseService<Role> {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(Menu)
    private readonly menuRepo: Repository<Menu>,
    private readonly authCacheService: AuthCacheService,
    private readonly sseService: SseService,
    dataSource: DataSource,
  ) {
    super(roleRepo, dataSource);
  }

  /**
   * 创建角色
   */
  async createRole(dto: CreateRoleDto): Promise<Role> {
    const exist = await this.roleRepo.findOne({
      where: { roleKey: dto.roleKey },
    });
    if (exist) {
      throw new BusinessException(`角色权限字符 ${dto.roleKey} 已存在`);
    }

    const role = this.roleRepo.create({
      roleName: dto.roleName,
      roleKey: dto.roleKey,
      sort: dto.sort || 0,
      remark: dto.remark,
    });

    if (dto.menuIds && dto.menuIds.length > 0) {
      role.menus = await this.menuRepo.findBy({ id: In(dto.menuIds) });
    }

    const saved = await this.roleRepo.save(role);

    // 触发权限缓存热驱逐与在线客户端动态感知
    await this.authCacheService.clearAllAuthorities();
    this.sseService.broadcastPermissionUpdate('新增系统角色已生效');

    return saved;
  }

  /**
   * 分配角色菜单与按钮权限
   */
  async updateRoleMenus(roleId: number, dto: UpdateRoleMenusDto): Promise<boolean> {
    const res = await this.withTransaction(async (manager) => {
      const role = await manager.findOne(Role, {
        where: { id: roleId },
        relations: ['menus'],
      });
      if (!role) {
        throw new BusinessException('角色不存在');
      }

      if (dto.menuIds && dto.menuIds.length > 0) {
        role.menus = await manager.findBy(Menu, { id: In(dto.menuIds) });
      } else {
        role.menus = [];
      }

      await manager.save(role);
      return true;
    });

    // 权威清除全员权限缓存，并向全体在线客户端广播权限重载事件
    await this.authCacheService.clearAllAuthorities();
    this.sseService.broadcastPermissionUpdate('角色菜单路由与操作权限已更新');

    return res;
  }

  /**
   * 重写角色信息更新
   */
  async update(id: number, attrs: any): Promise<Role> {
    const updated = await super.update(id, attrs);
    await this.authCacheService.clearAllAuthorities();
    this.sseService.broadcastPermissionUpdate('角色基础信息已更新');
    return updated;
  }

  /**
   * 重写角色删除
   */
  async deleteById(id: number): Promise<boolean> {
    const res = await super.deleteById(id);
    await this.authCacheService.clearAllAuthorities();
    this.sseService.broadcastPermissionUpdate('系统角色已删除并同步权限');
    return res;
  }

  /**
   * 获取角色的菜单ID清单
   */
  async getRoleMenuIds(roleId: number): Promise<number[]> {
    const role = await this.roleRepo.findOne({
      where: { id: roleId },
      relations: ['menus'],
    });
    if (!role) return [];
    return (role.menus || []).map((m) => m.id);
  }
}
