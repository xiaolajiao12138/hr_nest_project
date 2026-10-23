import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import * as path from 'path';

import configuration from './config/configuration';
import { RedisModule } from './common/redis/redis.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { OperLogInterceptor } from './common/interceptors/oper-log.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

import { UploadModule } from './upload/upload.module';
import { ExcelModule } from './excel/excel.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { DeptModule } from './modules/department/dept.module';
import { EmployeeModule } from './modules/employee/employee.module';
import { LeaveModule } from './modules/leave/leave.module';
import { NoticeModule } from './modules/notice/notice.module';
import { DictModule } from './modules/dict/dict.module';
import { LogModule } from './modules/log/log.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';

const env = process.env.NODE_ENV || 'development';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.resolve(process.cwd(), `.env.${env}`),
      load: [configuration],
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbConf = config.get('database');
        return {
          type: dbConf.type,
          host: dbConf.host,
          port: dbConf.port,
          username: dbConf.username,
          password: dbConf.password,
          database: dbConf.database,
          synchronize: dbConf.synchronize,
          logging: dbConf.logging,
          autoLoadEntities: true,
        };
      },
    }),

    RedisModule,
    UploadModule,
    ExcelModule,
    RbacModule,
    DeptModule,
    EmployeeModule,
    LeaveModule,
    NoticeModule,
    DictModule,
    LogModule,
    DashboardModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: OperLogInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
