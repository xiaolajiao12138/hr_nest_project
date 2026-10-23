import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Dict } from './entities/dict.entity';
import { BaseService } from '../../common/base/base.service';
import { PageParamDto } from '../../common/dto/page-param.dto';
import { PageResultDto } from '../../common/dto/page-result.dto';
import { BusinessException } from '../../common/exceptions/business.exception';

@Injectable()
export class DictService extends BaseService<Dict> {
  constructor(
    @InjectRepository(Dict)
    private readonly dictRepo: Repository<Dict>,
    dataSource: DataSource,
  ) {
    super(dictRepo, dataSource);
  }

  /**
   * 根据字典类型获取正常可用的字典键值列表（供前端 useDict 使用）
   */
  async getDictDataByType(dictType: string): Promise<Dict[]> {
    return this.dictRepo.find({
      where: { dictType, status: 1 },
      order: { sort: 'ASC', id: 'ASC' },
    });
  }

  /**
   * 分页查询字典列表
   */
  async findDictPage(pageParam: PageParamDto, dictType?: string): Promise<PageResultDto<Dict>> {
    const page = Number(pageParam.page) || 1;
    const pageSize = Number(pageParam.pageSize) || 10;
    const skip = (page - 1) * pageSize;

    const qb = this.dictRepo
      .createQueryBuilder('dict')
      .skip(skip)
      .take(pageSize)
      .orderBy('dict.dictType', 'ASC')
      .addOrderBy('dict.sort', 'ASC');

    if (dictType) {
      qb.andWhere('dict.dictType = :dictType', { dictType });
    }

    if (pageParam.keyword) {
      qb.andWhere(
        '(dict.dictName LIKE :kw OR dict.dictLabel LIKE :kw OR dict.dictType LIKE :kw)',
        { kw: `%${pageParam.keyword}%` },
      );
    }

    const [list, total] = await qb.getManyAndCount();
    return PageResultDto.create(list, total, page, pageSize);
  }

  /**
   * 根据 ID 获取字典详情
   */
  async getDictDetail(id: number): Promise<Dict> {
    const dict = await this.dictRepo.findOne({ where: { id } });
    if (!dict) {
      throw new BusinessException('字典数据不存在');
    }
    return dict;
  }
}
