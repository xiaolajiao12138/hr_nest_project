import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SysFile } from './entities/file.entity';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SysFile])],
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
