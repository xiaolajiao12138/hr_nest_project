import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { WinstonModule } from 'nest-winston';
import { createWinstonTransports } from './common/logger/winston.config';

async function bootstrap() {
  const transports = createWinstonTransports();
  const logger = WinstonModule.createLogger({
    transports,
  });

  const app = await NestFactory.create(AppModule, {
    logger,
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') || 3000;
  const apiPrefix = configService.get<string>('apiPrefix') || '/api';
  const nodeEnv = configService.get<string>('nodeEnv') || 'development';
  const security = configService.get('security');

  // 全局 API 前缀
  app.setGlobalPrefix(apiPrefix);

  // 跨域支持
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // 安全头防护 (根据环境配置开启)
  if (security?.enableHelmet) {
    app.use(helmet());
  }

  // 接口限流防护 (生产或测试环境防刷)
  if (security?.enableRateLimit) {
    app.use(
      rateLimit({
        windowMs: 15 * 60 * 1000, // 15 分钟
        max: 500, // 每个 IP 最多 500 次请求
        standardHeaders: true,
        legacyHeaders: false,
        message: {
          code: 429,
          msg: '请求过于频繁，请稍后重试',
          data: null,
        },
      }),
    );
  }

  // 全局参数校验管道 (强校验入参 DTO)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  await app.listen(port);

  const sysLogger = new Logger('NestBootstrap');
  sysLogger.log(`=======================================================`);
  sysLogger.log(`🚀 企业级HR人事后台管理系统后端已启动`);
  sysLogger.log(`🌍 当前运行环境: [${nodeEnv.toUpperCase()}]`);
  sysLogger.log(`📡 服务监听端口: http://127.0.0.1:${port}${apiPrefix}`);
  sysLogger.log(`=======================================================`);
}

bootstrap();
