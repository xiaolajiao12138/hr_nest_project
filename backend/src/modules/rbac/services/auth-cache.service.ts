import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { RedisService } from '../../../common/redis/redis.service';

/**
 * 用户权威运行时权限结构
 */
export interface UserAuthorityData {
  userId: number;
  username: string;
  roles: string[];
  permissions: string[];
  deptId?: number;
  employeeId?: number;
  dataScopes?: Record<string, { all: boolean; deptIds: number[]; self: boolean }>;
  status: number;
}

/**
 * 企业级用户权限缓存与权威运行时状态服务
 * 解决传统 JWT 静态 Payload 无法实时生效角色分配、细粒度权限增删及账号启停熔断的缺陷
 */
@Injectable()
export class AuthCacheService {
  private readonly logger = new Logger(AuthCacheService.name);
  private readonly CACHE_PREFIX = 'auth:user_auth:v2:';
  private readonly CACHE_TTL = 1800; // 30 分钟

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly redisService: RedisService,
  ) {}

  /**
   * 获取指定用户的权威实时权限数据
   * 优先从 Redis 缓存获取，未命中则联表查询数据库并回填缓存
   *
   * @param userId 用户主键 ID
   * @returns 包含角色列表、按钮权限集、状态及部门 ID 的数据结构
   */
  async getUserAuthorities(userId: number): Promise<UserAuthorityData | null> {
    const cacheKey = `${this.CACHE_PREFIX}${userId}`;
    const cached = await this.redisService.get(cacheKey);

    if (cached) {
      try {
        return JSON.parse(cached) as UserAuthorityData;
      } catch (e) {
        this.logger.warn(`解析用户 ${userId} 权限缓存失败，重新从数据库加载`);
      }
    }

    // 缓存未命中或解析失败，从数据库精准拉取最新状态及权限
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['roles', 'roles.menus', 'employee'],
    });

    if (!user) {
      return null;
    }

    if (user.employeeId && user.employee) user.deptId = user.employee.deptId;
    const activeRoles = (user.roles || []).filter((r) => r.status === 1);
    const roleKeys = activeRoles.map((r) => r.roleKey);

    let permissions: string[] = [];
    if (roleKeys.includes('admin')) {
      permissions = ['*'];
    } else {
      const permsSet = new Set<string>();
      for (const role of activeRoles) {
        if (role.menus) {
          for (const menu of role.menus) {
            if (menu.status === 1 && menu.perms && menu.perms.trim()) {
              permsSet.add(menu.perms.trim());
            }
          }
        }
      }
      permissions = Array.from(permsSet);
    }

    // 每种资源只合并拥有该资源权限的角色，避免无关角色扩大薪资等敏感范围。
    const resources = { employee: 'hr:employee:', salary: 'hr:salary:', leave: 'hr:leave:',
      attendance: 'hr:attendance:', performance: 'hr:performance:', user: 'system:user:', dept: 'hr:dept:' };
    const dataScopes: NonNullable<UserAuthorityData['dataScopes']> = {};
    let descendants: number[] | undefined;
    for (const [resource, prefix] of Object.entries(resources)) {
      const scope = { all: false, deptIds: [] as number[], self: true };
      for (const role of activeRoles) {
        if (!role.menus?.some(menu => menu.status === 1 && menu.perms?.startsWith(prefix))) continue;
        const mode = role.dataScope || 'SELF';
        if (mode === 'ALL') scope.all = true;
        if ((mode === 'DEPT' || mode === 'DEPT_AND_CHILDREN') && user.deptId) scope.deptIds.push(user.deptId);
        if (mode === 'CUSTOM') scope.deptIds.push(...(role.scopeDeptIds || []));
        if (mode === 'DEPT_AND_CHILDREN' && user.deptId) {
          descendants ??= (await this.userRepo.manager.query(`WITH RECURSIVE tree AS (
            SELECT id FROM sys_dept WHERE id = $1 UNION SELECT d.id FROM sys_dept d JOIN tree t ON d.parent_id = t.id
          ) SELECT id FROM tree`, [user.deptId])).map(row => Number(row.id));
          scope.deptIds.push(...descendants);
        }
      }
      scope.deptIds = [...new Set(scope.deptIds)];
      dataScopes[resource] = scope;
    }
    const authData: UserAuthorityData = {
      userId: user.id,
      username: user.username,
      roles: roleKeys,
      permissions,
      deptId: user.deptId,
      employeeId: user.employeeId || undefined,
      dataScopes,
      status: user.status,
    };

    // 异步回填至缓存
    await this.redisService.set(cacheKey, JSON.stringify(authData), this.CACHE_TTL);
    return authData;
  }

  /**
   * 清除指定用户的权限缓存（当用户角色或状态变更时调用）
   *
   * @param userId 用户 ID
   */
  async clearUserAuthorities(userId: number): Promise<void> {
    const cacheKey = `${this.CACHE_PREFIX}${userId}`;
    await this.redisService.del(cacheKey);
    this.logger.log(`[权限热重载] 已清除用户 ID: ${userId} 的权威权限缓存`);
  }

  /**
   * 批量清除所有在线用户的权限缓存（当角色权限、菜单发生全局变更时调用）
   */
  async clearAllAuthorities(): Promise<void> {
    await this.redisService.delByPrefix(this.CACHE_PREFIX);
    this.logger.log(`[权限热重载] 已批量清除全量在线用户的权威权限缓存`);
  }
}
