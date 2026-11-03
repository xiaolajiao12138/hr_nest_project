import 'reflect-metadata';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';
import { UserService } from '../modules/rbac/services/user.service';

describe('用户头像方案一：公开只读静态直链与浏览器永久强缓存测试', () => {
  it('上传 avatar 分类图片应直接返回随机文件名静态直链，而上传敏感附件仍保持短期预签名链接', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hr-avatar-test-'));
    const savedFiles: any[] = [];
    let seq = 10;

    const fakeFileRepo: any = {
      create: (data: any) => ({ ...data }),
      save: async (entity: any) => {
        const record = { ...entity, id: ++seq };
        savedFiles.push(record);
        return record;
      },
      findOneBy: async ({ id, fileName }: any) =>
        savedFiles.find((f) => (id !== undefined && f.id === id) || (fileName !== undefined && f.fileName === fileName)) || null,
      manager: {
        query: async () => [],
      },
    };

    const config = new ConfigService({
      minio: {
        endPoint: '127.0.0.1',
        port: 1,
        useSSL: false,
        accessKey: 'test',
        secretKey: 'test',
        bucketName: 'test-bucket',
      },
      jwt: { secret: 'unit-test-secret' },
    });

    const uploadService = new UploadService(config, fakeFileRepo, {} as any);
    (uploadService as any).localUploadDir = tmpDir;

    const actor: any = {
      userId: 7,
      username: 'tester',
      roles: ['admin'],
      permissions: ['*'],
      status: 1,
    };

    try {
      const avatarResult = await uploadService.uploadFile(
        {
          originalname: 'my-photo.png',
          size: 128,
          mimetype: 'image/png',
          buffer: Buffer.from('89504e470d0a1a0a', 'hex'),
        } as any,
        'avatar',
        actor,
      );

      assert.match(
        avatarResult.fileUrl,
        /^\/api\/upload\/avatar\/\d+_[a-f0-9]{12}\.png$/,
        '头像上传后应直接返回公开随机文件名静态直链，而非短期签名预览地址',
      );

      const idcardResult = await uploadService.uploadFile(
        {
          originalname: 'idcard.png',
          size: 128,
          mimetype: 'image/png',
          buffer: Buffer.from('89504e470d0a1a0a', 'hex'),
        } as any,
        'idcard',
        actor,
      );

      assert.match(
        idcardResult.fileUrl,
        /^\/api\/upload\/preview\/idcard\/.+\?fileId=\d+&userId=7&expires=\d+&signature=[a-f0-9]{64}$/,
        '身份证等高敏附件仍必须返回短期签名预览链接',
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('UploadController.avatar 接口应免登录公开只读，返回一年期 immutable 强缓存头，并严禁越权读取非 avatar 目录文件', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hr-avatar-ctrl-'));
    fs.mkdirSync(path.join(tmpDir, 'avatar'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'idcard'), { recursive: true });

    const avatarFileName = '1762135000000_abcdef123456.png';
    const pngBytes = Buffer.from('89504e470d0a1a0a', 'hex');
    fs.writeFileSync(path.join(tmpDir, 'avatar', avatarFileName), pngBytes);
    fs.writeFileSync(path.join(tmpDir, 'idcard', 'secret.png'), pngBytes);

    const files = [
      {
        id: 21,
        ownerUserId: 7,
        fileName: avatarFileName,
        fileExt: '.png',
        filePath: `avatar/${avatarFileName}`,
      },
      {
        id: 22,
        ownerUserId: 7,
        fileName: 'secret.png',
        fileExt: '.png',
        filePath: 'idcard/secret.png',
      },
    ];

    const fakeFileRepo: any = {
      findOneBy: async ({ id, fileName }: any) =>
        files.find((f) => (id !== undefined && f.id === id) || (fileName !== undefined && f.fileName === fileName)) || null,
    };

    const config = new ConfigService({
      minio: { endPoint: '127.0.0.1', port: 1, useSSL: false, accessKey: 't', secretKey: 't', bucketName: 'b' },
      jwt: { secret: 'unit-test-secret' },
    });

    const uploadService = new UploadService(config, fakeFileRepo, {} as any);
    (uploadService as any).localUploadDir = tmpDir;
    const controller = new UploadController(uploadService);

    try {
      // 1. 验证控制器方法上不再挂载 JwtAuthGuard，允许原生 <img> 标签直连加载
      const methodGuards = Reflect.getMetadata(
        GUARDS_METADATA,
        UploadController.prototype.avatar,
      );
      assert.equal(
        methodGuards,
        undefined,
        '公开头像直链路由不应挂载 JwtAuthGuard，否则原生 <img> 标签无法加载与缓存',
      );

      // 2. 通过新格式随机文件名直链读取并检查永久强缓存响应头
      const invokeAvatar = (target: string) =>
        new Promise<{ headers: Record<string, string>; body: Buffer }>((resolve, reject) => {
          const headers: Record<string, string> = {};
          const chunks: Buffer[] = [];
          const res: any = {
            setHeader: (k: string, v: string) => {
              headers[k.toLowerCase()] = v;
            },
            write: (chunk: Buffer) => {
              chunks.push(Buffer.from(chunk));
              return true;
            },
            end: (chunk?: Buffer) => {
              if (chunk) chunks.push(Buffer.from(chunk));
              resolve({ headers, body: Buffer.concat(chunks) });
            },
            on: () => res,
            once: () => res,
            emit: () => false,
            destroy: () => reject(new Error('stream destroyed')),
          };
          (controller as any).avatar(target, res).catch(reject);
        });

      const resByName = await invokeAvatar(avatarFileName);
      assert.equal(resByName.headers['content-type'], 'image/png');
      assert.equal(
        resByName.headers['cache-control'],
        'public, max-age=31536000, immutable',
      );
      assert.deepEqual(resByName.body, pngBytes);

      // 3. 兼容存量旧账号数据库中的数字 fileId 格式 (/api/upload/avatar/21)
      const resByLegacyId = await invokeAvatar('21');
      assert.equal(
        resByLegacyId.headers['cache-control'],
        'public, max-age=31536000, immutable',
      );
      assert.deepEqual(resByLegacyId.body, pngBytes);

      // 4. 严禁通过旧数字 ID 越权读取非 avatar 目录的敏感附件 (id=22 是 idcard/secret.png)
      await assert.rejects(() => invokeAvatar('22'));

      // 5. 严禁路径穿越读取其他目录
      await assert.rejects(() => invokeAvatar('../idcard/secret.png'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('UserService.updateProfile 应支持校验本人上传的新静态头像直链并持久化为随机文件名路径', async () => {
    const avatarFileName = '1762135000000_abcdef123456.webp';
    let savedUser: any = null;

    const fakeUserRepo: any = {
      findOne: async () => ({
        id: 7,
        username: 'fqfq',
        realName: 'fq',
        avatar: '',
      }),
      save: async (u: any) => {
        savedUser = { ...u };
        return savedUser;
      },
    };

    const fakeDataSource: any = {
      getRepository: () => ({
        findOneBy: async ({ id, fileName }: any) => {
          if (fileName === avatarFileName || id === 33) {
            return {
              id: 33,
              ownerUserId: 7,
              fileName: avatarFileName,
              fileExt: '.webp',
              filePath: `avatar/${avatarFileName}`,
            };
          }
          return null;
        },
      }),
    };

    const userService = new UserService(
      fakeUserRepo,
      {} as any,
      {} as any,
      {} as any,
      fakeDataSource,
    );

    const updated = await userService.updateProfile(7, {
      avatar: `/api/upload/avatar/${avatarFileName}`,
    });

    assert.equal(updated.avatar, `/api/upload/avatar/${avatarFileName}`);
  });
});
