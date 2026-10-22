import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dict } from './entities/dict.entity';
import { DictService } from './dict.service';
import { DictController } from './dict.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Dict])],
  controllers: [DictController],
  providers: [DictService],
  exports: [DictService],
})
export class DictModule {}
