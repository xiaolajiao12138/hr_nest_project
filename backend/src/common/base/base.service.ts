import {
  Repository,
  FindOptionsWhere,
  FindManyOptions,
  In,
  DataSource,
  EntityManager,
  DeepPartial,
} from 'typeorm';
import { BaseEntity } from './base.entity';
import { PageParamDto } from '../dto/page-param.dto';
import { PageResultDto } from '../dto/page-result.dto';
import { BusinessException } from '../exceptions/business.exception';

/**
 * 基础通用服务封装
 * 封装企业级通用的 CRUD、分页检索、条件过滤与数据库事务包裹
 */
export abstract class BaseService<T extends BaseEntity> {
  constructor(
    protected readonly repository: Repository<T>,
    protected readonly dataSource?: DataSource,
  ) {}

  /**
   * 分页查询
   * @param pageParam 分页入参
   * @param where 自定义查询条件
   * @param relations 关联实体
   */
  async findPage(
    pageParam: PageParamDto,
    where?: FindOptionsWhere<T> | FindOptionsWhere<T>[],
    relations?: string[],
  ): Promise<PageResultDto<T>> {
    const page = Number(pageParam.page) || 1;
    const pageSize = Number(pageParam.pageSize) || 10;
    const skip = (page - 1) * pageSize;

    const sortField = (pageParam.sortField || 'id') as string;
    const sortOrder = (pageParam.sortOrder || 'DESC').toUpperCase() as
      | 'ASC'
      | 'DESC';

    const options: FindManyOptions<T> = {
      where,
      skip,
      take: pageSize,
      order: { [sortField]: sortOrder } as any,
      relations,
    };

    const [list, total] = await this.repository.findAndCount(options);
    return PageResultDto.create(list, total, page, pageSize);
  }

  /**
   * 根据 ID 查询单条记录
   * @param id 主键ID
   * @param relations 关联实体
   * @param throwsIfNotFound 是否在未查到时抛出异常
   */
  async findById(
    id: number,
    relations?: string[],
    throwsIfNotFound: boolean = true,
  ): Promise<T | null> {
    const entity = await this.repository.findOne({
      where: { id } as any,
      relations,
    });

    if (!entity && throwsIfNotFound) {
      throw new BusinessException(`ID 为 ${id} 的记录不存在`, 404);
    }
    return entity;
  }

  /**
   * 单条条件查询
   */
  async findOne(
    where: FindOptionsWhere<T> | FindOptionsWhere<T>[],
    relations?: string[],
  ): Promise<T | null> {
    return this.repository.findOne({ where, relations });
  }

  /**
   * 列表全量条件查询
   */
  async findList(
    where?: FindOptionsWhere<T> | FindOptionsWhere<T>[],
    relations?: string[],
  ): Promise<T[]> {
    return this.repository.find({
      where,
      relations,
      order: { id: 'DESC' } as any,
    });
  }

  /**
   * 创建实体
   */
  async create(createDto: DeepPartial<T>): Promise<T> {
    const entity = this.repository.create(createDto);
    return this.repository.save(entity);
  }

  /**
   * 更新实体
   */
  async update(id: number, updateDto: DeepPartial<T>): Promise<T> {
    await this.findById(id); // 校验存在性
    await this.repository.update(id, updateDto as any);
    return this.findById(id);
  }

  /**
   * 根据 ID 删除
   */
  async deleteById(id: number): Promise<boolean> {
    const entity = await this.findById(id);
    const result = await this.repository.delete(entity.id);
    return (result.affected || 0) > 0;
  }

  /**
   * 批量删除
   */
  async deleteBatch(ids: number[]): Promise<boolean> {
    if (!ids || ids.length === 0) {
      throw new BusinessException('请选择要删除的记录ID');
    }
    const result = await this.repository.delete({ id: In(ids) } as any);
    return (result.affected || 0) > 0;
  }

  /**
   * 封装事务执行工具
   * 自动创建 QueryRunner、开启事务、提交、异常回滚及释放资源
   */
  async withTransaction<R>(
    operation: (manager: EntityManager) => Promise<R>,
  ): Promise<R> {
    if (!this.dataSource) {
      throw new BusinessException('当前服务未注入 DataSource，无法开启独立事务');
    }
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const result = await operation(queryRunner.manager);
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
