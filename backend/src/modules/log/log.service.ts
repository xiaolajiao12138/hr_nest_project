import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OperLogEntity } from './entities/oper-log.entity';
import { PageParamDto } from '../../common/dto/page-param.dto';
import { PageResultDto } from '../../common/dto/page-result.dto';

@Injectable()
export class LogService {
  constructor(
    @InjectRepository(OperLogEntity)
    private readonly logRepo: Repository<OperLogEntity>,
  ) {}

  async findLogPage(pageParam: PageParamDto): Promise<PageResultDto<OperLogEntity>> {
    const page = Number(pageParam.page) || 1;
    const pageSize = Number(pageParam.pageSize) || 10;
    const skip = (page - 1) * pageSize;

    const qb = this.logRepo
      .createQueryBuilder('log')
      .skip(skip)
      .take(pageSize)
      .orderBy('log.id', 'DESC');

    if (pageParam.keyword) {
      qb.andWhere(
        '(log.title LIKE :kw OR log.operName LIKE :kw OR log.operUrl LIKE :kw)',
        { kw: `%${pageParam.keyword}%` },
      );
    }

    const [list, total] = await qb.getManyAndCount();
    return PageResultDto.create(list, total, page, pageSize);
  }

  async cleanLogs(): Promise<boolean> {
    await this.logRepo.clear();
    return true;
  }
}
