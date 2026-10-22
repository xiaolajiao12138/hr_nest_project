import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Role } from '../entities/role.entity';
import { Menu } from '../entities/menu.entity';
import { BaseService } from '../../../common/base/base.service';
import { CreateRoleDto, UpdateRoleMenusDto } from '../dto/rbac.dto';
import { BusinessException } from '../../../common/exceptions/business.exception';

@Injectable()
export class RoleService extends BaseService<Role> {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(Menu)
    private readonly menuRepo: Repository<Menu>,
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

    return this.roleRepo.save(role);
  }

  /**
   * 分配角色菜单与按钮权限
   */
  async updateRoleMenus(roleId: number, dto: UpdateRoleMenusDto): Promise<boolean> {
    return this.withTransaction(async (manager) => {
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
