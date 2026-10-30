import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private readonly fallbackMemory = new Map<string, { value: string; expireAt: number }>();

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const conf = this.configService.get('redis');
    try {
      this.client = new Redis({
        host: conf.host,
        port: conf.port,
        password: conf.password || undefined,
        db: conf.db || 0,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 1500,
        retryStrategy: () => null, // 本地无Redis时不反复重试
      });

      // 捕获客户端错误，防止 unhandled error 事件打断程序
      this.client.on('error', (err) => {
        // 静默捕获
      });

      this.client
        .connect()
        .then(() => {
          this.logger.log('Redis 缓存服务已成功建立连接');
        })
        .catch((err) => {
          this.logger.warn(`本地未启动 Redis 服务，已自动无缝切换至内置高可用内存缓存模式`);
          try {
            this.client?.disconnect();
          } catch (_) {}
          this.client = null;
        });
    } catch (e) {
      this.logger.warn(`Redis 初始化异常，启用内置内存缓存: ${e.message}`);
      this.client = null;
    }
  }

  async set(key: string, value: string, seconds?: number): Promise<void> {
    if (this.client && this.client.status === 'ready') {
      if (seconds) {
        await this.client.set(key, value, 'EX', seconds);
      } else {
        await this.client.set(key, value);
      }
      return;
    }

    // 内存降级
    const expireAt = seconds ? Date.now() + seconds * 1000 : Infinity;
    this.fallbackMemory.set(key, { value, expireAt });
  }

  async get(key: string): Promise<string | null> {
    if (this.client && this.client.status === 'ready') {
      return this.client.get(key);
    }

    const item = this.fallbackMemory.get(key);
    if (!item) return null;
    if (Date.now() > item.expireAt) {
      this.fallbackMemory.delete(key);
      return null;
    }
    return item.value;
  }

  async del(key: string): Promise<void> {
    if (this.client && this.client.status === 'ready') {
      await this.client.del(key);
      return;
    }
    this.fallbackMemory.delete(key);
  }

  /**
   * 根据前缀批量删除键（如 auth:user_auth:）
   * 优先使用 Redis SCAN / KEYS 批量清理，降级模式下直接清理内存字典
   *
   * @param prefix 键前缀
   */
  async delByPrefix(prefix: string): Promise<void> {
    if (this.client && this.client.status === 'ready') {
      try {
        const keys = await this.client.keys(`${prefix}*`);
        if (keys && keys.length > 0) {
          await this.client.del(...keys);
        }
      } catch (err) {
        this.logger.warn(`Redis 批量删除前缀 ${prefix} 异常: ${err.message}`);
      }
      return;
    }

    for (const key of this.fallbackMemory.keys()) {
      if (key.startsWith(prefix)) {
        this.fallbackMemory.delete(key);
      }
    }
  }
}
