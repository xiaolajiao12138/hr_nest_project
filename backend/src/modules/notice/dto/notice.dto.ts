import { IsNotEmpty, IsOptional, IsInt, IsString } from 'class-validator';
import { PageParamDto } from '../../../common/dto/page-param.dto';

export class QueryNoticeDto extends PageParamDto {
  @IsOptional()
  @IsString()
  noticeType?: string;

  @IsOptional()
  @IsInt()
  status?: number;
}

export class CreateNoticeDto {
  @IsNotEmpty({ message: '标题不能为空' })
  title: string;

  @IsNotEmpty({ message: '公告内容不能为空' })
  content: string;

  @IsOptional()
  noticeType?: string = 'NOTICE';

  @IsOptional()
  @IsInt()
  fileId?: number;

  @IsOptional()
  @IsInt()
  status?: number = 1;
}

export class UpdateNoticeDto extends CreateNoticeDto {}
