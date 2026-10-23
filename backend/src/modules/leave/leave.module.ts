import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Leave } from './entities/leave.entity';
import { AnnualLeave } from './entities/annual.entity';
import { Employee } from '../employee/entities/employee.entity';
import { LeaveService } from './leave.service';
import { LeaveController } from './leave.controller';
import { SseModule } from '../sse/sse.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Leave, AnnualLeave, Employee]),
    SseModule,
  ],
  controllers: [LeaveController],
  providers: [LeaveService],
  exports: [LeaveService],
})
export class LeaveModule {}
