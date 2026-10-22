import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Like } from 'typeorm';
import { Notice } from './entities/notice.entity';
import { BaseService } from '../../common/base/base.service';
import { QueryNoticeDto } from './dto/notice.dto';
import { PageResultDto } from '../../common/dto/page-result.dto';

@Injectable()
export class NoticeService extends BaseService<Notice> {
  constructor(
    @InjectRepository(Notice)
    private readonly noticeRepo: Repository<Notice>,
    dataSource: DataSource,
  ) {
    super(noticeRepo, dataSource);
  }

  async findNoticePage(query: QueryNoticeDto): Promise<PageResultDto<Notice>> {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 10;
    const skip = (page - 1) * pageSize;

    const qb = this.noticeRepo
      .createQueryBuilder('notice')
      .leftJoinAndSelect('notice.file', 'file')
      .skip(skip)
      .take(pageSize)
      .orderBy('notice.id', 'DESC');

    if (query.keyword) {
      qb.andWhere(
        '(notice.title LIKE :kw OR notice.content LIKE :kw)',
        { kw: `%${query.keyword}%` },
      );
    }

    if (query.noticeType) {
      qb.andWhere('notice.noticeType = :type', { type: query.noticeType });
    }

    if (query.status !== undefined && query.status !== null) {
      qb.andWhere('notice.status = :status', { status: query.status });
    }

    const [list, total] = await qb.getManyAndCount();
    return PageResultDto.create(list, total, page, pageSize);
  }

  async changeStatus(id: number, status: number): Promise<boolean> {
    await this.findById(id);
    await this.noticeRepo.update(id, { status });
    return true;
  }
}
