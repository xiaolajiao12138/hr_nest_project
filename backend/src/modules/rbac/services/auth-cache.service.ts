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
  status: number;
}

/**
 * 企业级用户权限缓存与权威运行时状态服务
 * 解决传统 JWT 静态 Payload 无法实时生效角色分配、细粒度权限增删及账号启停熔断的缺陷
 */
@Injectable()
export class AuthCacheService {
  private readonly logger = new Logger(AuthCacheService.name);
  private readonly CACHE_PREFIX = 'auth:user_auth:';
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
      relations: ['roles', 'roles.menus'],
    });

    if (!user) {
      return null;
    }

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

    const authData: UserAuthorityData = {
      userId: user.id,
      username: user.username,
      roles: roleKeys,
      permissions,
      deptId: user.deptId,
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
