import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from './entities/employee.entity';
import { Dept } from '../department/entities/dept.entity';
import { AnnualLeave } from '../leave/entities/annual.entity';
import { EmployeeService } from './employee.service';
import { EmployeeController } from './employee.controller';
import { ExcelModule } from '../../excel/excel.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Employee, Dept, AnnualLeave]),
    ExcelModule,
  ],
  controllers: [EmployeeController],
  providers: [EmployeeService],
  exports: [EmployeeService],
})
export class EmployeeModule {}
