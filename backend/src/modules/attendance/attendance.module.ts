import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceShift } from './entities/shift.entity';
import { AttendanceSchedule } from './entities/schedule.entity';
import { AttendanceRecord } from './entities/record.entity';
import { Employee } from '../employee/entities/employee.entity';
import { User } from '../rbac/entities/user.entity';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AttendanceShift,
      AttendanceSchedule,
      AttendanceRecord,
      Employee,
      User,
    ]),
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
