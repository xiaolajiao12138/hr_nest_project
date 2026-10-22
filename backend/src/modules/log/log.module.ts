import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OperLogEntity } from './entities/oper-log.entity';
import { LogService } from './log.service';
import { LogController } from './log.controller';

@Module({
  imports: [TypeOrmModule.forFeature([OperLogEntity])],
  controllers: [LogController],
  providers: [LogService],
  exports: [LogService],
})
export class LogModule {}
