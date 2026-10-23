import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
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

/**
 * 系统公告与通知控制器
 * 提供公告与通知的分页查询、详情获取、新增、状态切换、编辑修改与删除接口
 */
@Controller('ops/notice')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NoticeController {
  constructor(private readonly noticeService: NoticeService) {}

  /**
   * 分页查询系统公告列表
   *
   * @param query 分页与筛选条件（包含页码、页大小、关键字、通知分类、发布状态）
   * @returns 返回符合条件的分页数据列表与分页元数据
   */
  @Get('list')
  @Permissions('ops:notice:list')
  async getPage(@Query() query: QueryNoticeDto) {
    return this.noticeService.findNoticePage(query);
  }

  /**
   * 获取最新发布的系统公告列表
   * 任何已登录用户均可调用，主要用于客户端初始化或通知面板展示最新几条已发布公告
   *
   * @returns 返回最新发布的已生效公告列表
   */
  @Get('latest')
  async getLatest() {
    return this.noticeService.getLatestNotices(5);
  }

  /**
   * 根据公告主键 ID 获取公告完整详情及附件信息
   *
   * @param id 公告记录主键 ID
   * @returns 返回公告详情实体（关联附件信息）
   */
  @Get(':id')
  @Permissions('ops:notice:list')
  async getDetail(@Param('id', ParseIntPipe) id: number) {
    return this.noticeService.findById(id, ['file']);
  }

  /**
   * 创建新的系统公告或通知
   * 若初始状态为 1（已发布），创建成功后会实时向所有在线用户广播推送
   *
   * @param dto 创建公告参数载荷（标题、类型、正文内容、发布状态、关联附件ID等）
   * @param user 当前登录用户上下文，用于记录创建者姓名
   * @returns 返回新建成功的公告实体
   */
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

  /**
   * 变更公告的发布状态（撤回为草稿或正式上线发布）
   * 若变更为正式发布状态，自动触发全员 SSE 实时广播
   *
   * @param dto 包含公告主键 ID 和目标发布状态（0: 撤回草稿 / 1: 立即发布）
   * @returns 返回变更结果布尔值
   */
  @Put('status')
  @Permissions('ops:notice:list')
  @OperLog({ title: '调整公告发布状态', businessType: 'UPDATE' })
  async changeStatus(@Body() dto: ChangeNoticeStatusDto) {
    return this.noticeService.changeStatus(dto.id, dto.status);
  }

  /**
   * 更新已有的公告或通知内容
   *
   * @param id 公告记录主键 ID
   * @param dto 更新参数载荷
   * @returns 返回更新后的实体
   */
  @Put(':id')
  @Permissions('ops:notice:list')
  @OperLog({ title: '修改系统公告', businessType: 'UPDATE' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateNoticeDto) {
    return this.noticeService.update(id, dto);
  }

  /**
   * 删除指定的系统公告或内部通知
   *
   * @param id 公告记录主键 ID
   * @returns 返回受影响的记录行数对象
   */
  @Delete(':id')
  @Permissions('ops:notice:list')
  @OperLog({ title: '删除系统公告', businessType: 'DELETE' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.noticeService.deleteById(id);
  }
}
