import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Patch,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { NoticeService } from './notice.service';
import {
  CreateNoticeDto,
  UpdateNoticeDto,
  QueryNoticeDto,
  ChangeNoticeStatusDto,
} from './dto/notice.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { OperLog } from '../../common/decorators/oper-log.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@Controller('ops/notice')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NoticeController {
  constructor(private readonly noticeService: NoticeService) {}

  @Get('list')
  @Permissions('ops:notice:list')
  async getPage(@Query() query: QueryNoticeDto) {
    return this.noticeService.findNoticePage(query);
  }

  @Get(':id')
  @Permissions('ops:notice:list')
  async getDetail(@Param('id') id: number) {
    return this.noticeService.findById(id, ['file']);
  }

  @Post()
  @Permissions('ops:notice:list')
  @OperLog({ title: '新增系统公告', businessType: 'INSERT' })
  async create(
    @Body() dto: CreateNoticeDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.noticeService.create({
      ...dto,
      createdBy: user.username,
    });
  }

  @Put(':id')
  @Permissions('ops:notice:list')
  @OperLog({ title: '修改系统公告', businessType: 'UPDATE' })
  async update(@Param('id') id: number, @Body() dto: UpdateNoticeDto) {
    return this.noticeService.update(id, dto);
  }

  @Put('status')
  @Permissions('ops:notice:list')
  @OperLog({ title: '调整公告发布状态', businessType: 'UPDATE' })
  async changeStatus(@Body() dto: ChangeNoticeStatusDto) {
    return this.noticeService.changeStatus(dto.id, dto.status);
  }

  @Delete(':id')
  @Permissions('ops:notice:list')
  @OperLog({ title: '删除系统公告', businessType: 'DELETE' })
  async delete(@Param('id') id: number) {
    return this.noticeService.deleteById(id);
  }
}
