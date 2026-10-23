import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalaryRecord } from './entities/salary.entity';
import { Employee } from '../employee/entities/employee.entity';
import { Leave } from '../leave/entities/leave.entity';
import { User } from '../rbac/entities/user.entity';
import { SalaryService } from './salary.service';
import { SalaryController } from './salary.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SalaryRecord, Employee, Leave, User])],
  controllers: [SalaryController],
  providers: [SalaryService],
  exports: [SalaryService],
})
export class SalaryModule {}
