import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { Dept } from '../department/entities/dept.entity';
import { Employee } from '../employee/entities/employee.entity';
import { Leave } from '../leave/entities/leave.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Dept, Employee, Leave])],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
