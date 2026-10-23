import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SseController } from './sse.controller';
import { SseService } from './sse.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret:
          config.get<string>('jwt.secret') || 'hr_jwt_secret_dev_2026_key',
        signOptions: {
          expiresIn: config.get<string>('jwt.expiresIn') || '7200s',
        },
      }),
    }),
  ],
  controllers: [SseController],
  providers: [SseService],
  exports: [SseService],
})
export class SseModule {}
