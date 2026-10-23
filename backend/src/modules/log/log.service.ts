import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OperLogEntity } from './entities/oper-log.entity';
import { PageParamDto } from '../../common/dto/page-param.dto';
import { PageResultDto } from '../../common/dto/page-result.dto';
import { BusinessException } from '../../common/exceptions/business.exception';

@Injectable()
export class LogService {
  constructor(
    @InjectRepository(OperLogEntity)
    private readonly logRepo: Repository<OperLogEntity>,
  ) {}

  /**
   * 分页查询操作日志（列表精简字段，过滤掉大文本报文）
   */
  async findLogPage(pageParam: PageParamDto): Promise<PageResultDto<OperLogEntity>> {
    const page = Number(pageParam.page) || 1;
    const pageSize = Number(pageParam.pageSize) || 10;
    const skip = (page - 1) * pageSize;

    const qb = this.logRepo
      .createQueryBuilder('log')
      .select([
        'log.id',
        'log.title',
        'log.businessType',
        'log.method',
        'log.requestMethod',
        'log.operName',
        'log.operUrl',
        'log.operIp',
        'log.status',
        'log.costTime',
        'log.operTime',
      ])
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

  /**
   * 根据 ID 查询日志详情（包含完整的请求入参、返回结果和错误堆栈）
   */
  async getLogDetail(id: number): Promise<OperLogEntity> {
    const log = await this.logRepo.findOne({ where: { id } });
    if (!log) {
      throw new BusinessException('操作日志不存在');
    }
    return log;
  }

  async cleanLogs(): Promise<boolean> {
    await this.logRepo.clear();
    return true;
  }
}
