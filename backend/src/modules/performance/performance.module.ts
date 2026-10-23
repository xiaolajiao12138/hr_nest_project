import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PerformancePlan } from './entities/performance-plan.entity';
import { PerformanceRecord } from './entities/performance-record.entity';
import { Employee } from '../employee/entities/employee.entity';
import { Dept } from '../department/entities/dept.entity';
import { SalaryRecord } from '../salary/entities/salary.entity';
import { PerformanceService } from './performance.service';
import { PerformanceController } from './performance.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PerformancePlan,
      PerformanceRecord,
      Employee,
      Dept,
      SalaryRecord,
    ]),
  ],
  controllers: [PerformanceController],
  providers: [PerformanceService],
  exports: [PerformanceService],
})
export class PerformanceModule {}
