import { RbacModule } from '../rbac/rbac.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dept } from './entities/dept.entity';
import { DeptService } from './dept.service';
import { DeptController } from './dept.controller';

@Module({
  imports: [RbacModule, TypeOrmModule.forFeature([Dept])],
  controllers: [DeptController],
  providers: [DeptService],
  exports: [DeptService],
})
export class DeptModule {}
