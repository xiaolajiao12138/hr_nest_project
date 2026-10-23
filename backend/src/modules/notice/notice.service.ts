import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Notice } from './entities/notice.entity';
import { BaseService } from '../../common/base/base.service';
import { QueryNoticeDto } from './dto/notice.dto';
import { PageResultDto } from '../../common/dto/page-result.dto';
import { SseService } from '../sse/sse.service';

/**
 * 系统公告与通知业务服务层
 * 负责公告的多条件检索、状态流转以及全员 SSE 毫秒级实时广播推送
 */
@Injectable()
export class NoticeService extends BaseService<Notice> {
  constructor(
    @InjectRepository(Notice)
    private readonly noticeRepo: Repository<Notice>,
    dataSource: DataSource,
    private readonly sseService: SseService,
  ) {
    super(noticeRepo, dataSource);
  }

  /**
   * 分页查询系统公告与通知列表
   *
   * @param query 查询参数对象，包含分页信息、模糊关键字、通知类型、发布状态
   * @returns 返回包含数据列表、总数、当前页及页容量的统一分页对象
   */
  async findNoticePage(query: QueryNoticeDto): Promise<PageResultDto<Notice>> {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 10;
    const skip = (page - 1) * pageSize;

    // 构建 QueryBuilder，关联查询上传附件信息并按 ID 倒序排列
    const qb = this.noticeRepo
      .createQueryBuilder('notice')
      .leftJoinAndSelect('notice.file', 'file')
      .skip(skip)
      .take(pageSize)
      .orderBy('notice.id', 'DESC');

    // 模糊匹配公告标题或正文内容
    if (query.keyword) {
      qb.andWhere(
        '(notice.title LIKE :kw OR notice.content LIKE :kw)',
        { kw: `%${query.keyword}%` },
      );
    }

    // 按公告分类精准筛选（ANNOUNCEMENT: 全员公告 / NOTICE: 内部通知）
    if (query.noticeType) {
      qb.andWhere('notice.noticeType = :type', { type: query.noticeType });
    }

    // 按发布状态筛选（0: 草稿 / 1: 已发布）
    if (query.status !== undefined && query.status !== null) {
      qb.andWhere('notice.status = :status', { status: query.status });
    }

    const [list, total] = await qb.getManyAndCount();
    return PageResultDto.create(list, total, page, pageSize);
  }

  /**
   * 获取最新发布的系统公告列表
   * 常用于用户登录后右上方通知中心初次加载未读公告或跑马灯展示
   *
   * @param limit 获取条数，默认为 5
   * @returns 返回按发布时间降序排列的已发布公告集合
   */
  async getLatestNotices(limit = 5): Promise<Notice[]> {
    return this.noticeRepo.find({
      where: { status: 1 },
      order: { id: 'DESC' },
      take: limit,
    });
  }

  /**
   * 创建新公告并根据状态决定是否实时广播
   * 若新建时状态直接为“已发布”(status === 1)，则立即通过 SSE 广播给所有在线用户
   *
   * @param data 新建公告实体属性载荷
   * @returns 返回创建成功的公告实体
   */
  override async create(data: any): Promise<Notice> {
    const notice = await super.create(data);
    // 判断若创建即发布，则触发全员实时通知
    if (Number(notice.status) === 1) {
      this.broadcastNotice(notice);
    }
    return notice;
  }

  /**
   * 变更公告的发布状态（草稿 <-> 已发布）
   * 当由草稿转为已发布状态时，即刻向全员广播实时弹窗推送
   *
   * @param id 公告记录主键 ID
   * @param status 目标状态（0: 撤回为草稿 / 1: 正式发布）
   * @returns 返回操作是否成功
   */
  async changeStatus(id: number, status: number): Promise<boolean> {
    const notice = await this.findById(id);
    await this.noticeRepo.update(id, { status: Number(status) });
    // 若变为已发布状态，触发 SSE 广播事件
    if (Number(status) === 1) {
      this.broadcastNotice({ ...notice, status: 1 });
    }
    return true;
  }

  /**
   * 触发 SSE 全员消息广播
   * 向全部当前已建立长连接的在线客户端发送通知报文
   *
   * @param notice 公告实体数据
   */
  private broadcastNotice(notice: Notice) {
    this.sseService.broadcast({
      type: 'NOTICE_BROADCAST',
      title: notice.noticeType === 'ANNOUNCEMENT' ? '📢 全员公告发布' : '📌 系统内部通知',
      message: notice.title,
      data: {
        id: notice.id,
        title: notice.title,
        content: notice.content,
        noticeType: notice.noticeType,
        createdAt: notice.createdAt,
      },
    });
  }
}
