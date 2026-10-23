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
 * 基础通用服务抽象基类
 * 
 * 核心职责：
 * 1. 统一封装 TypeORM 常用 CRUD、动态分页检索与关联实体查询
 * 2. 提供数据库事务原子化执行模板方法（自动开启、提交、异常回滚及连接释放）
 * 3. 统一规范空记录校验与业务异常抛出
 * 
 * @template T 继承自 BaseEntity 的数据库实体类
 */
export abstract class BaseService<T extends BaseEntity> {
  /**
   * 构造函数注入实体 Repository 与可选的全局数据源 DataSource
   * 
   * @param repository 当前实体的主 Repository
   * @param dataSource TypeORM 数据源实例（用于创建独立事务 QueryRunner）
   */
  constructor(
    protected readonly repository: Repository<T>,
    protected readonly dataSource?: DataSource,
  ) {}

  /**
   * 统一动态条件分页检索
   * 
   * @param pageParam 分页入参对象（页码、每页条数、排序字段及排序规则）
   * @param where 可选的查询条件过滤器（支持单一对象或多条件 OR 数组）
   * @param relations 可选的左连接关联实体数组
   * @returns 统一包装的分页结果实体 PageResultDto（含当前页数据、总数及页码信息）
   */
  async findPage(
    pageParam: PageParamDto,
    where?: FindOptionsWhere<T> | FindOptionsWhere<T>[],
    relations?: string[],
  ): Promise<PageResultDto<T>> {
    // 规范化页码与条数，兜底防负数及非法字符
    const page = Number(pageParam.page) || 1;
    const pageSize = Number(pageParam.pageSize) || 10;
    const skip = (page - 1) * pageSize;

    // 解析动态排序规则，默认按 id 降序倒排
    const sortField = (pageParam.sortField || 'id') as string;
    const sortOrder = (pageParam.sortOrder || 'DESC').toUpperCase() as
      | 'ASC'
      | 'DESC';

    // 构建 TypeORM 查询参数选项
    const options: FindManyOptions<T> = {
      where,
      skip,
      take: pageSize,
      order: { [sortField]: sortOrder } as any,
      relations,
    };

    // 执行并发统计总数与分页查询
    const [list, total] = await this.repository.findAndCount(options);
    return PageResultDto.create(list, total, page, pageSize);
  }

  /**
   * 根据主键 ID 精准检索单条实体
   * 
   * @param id 目标实体自增主键 ID
   * @param relations 可选的级联加载关联实体名称数组
   * @param throwsIfNotFound 当记录不存在时是否直接抛出 404 业务异常，默认为 true
   * @returns 目标实体对象，或未查到且不抛错时返回 null
   * @throws BusinessException 当记录不存在且 throwsIfNotFound 为 true 时抛出
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

    // 严密校验存在性，防止后续空指针
    if (!entity && throwsIfNotFound) {
      throw new BusinessException(`ID 为 ${id} 的记录不存在`, 404);
    }
    return entity;
  }

  /**
   * 根据自定义匹配条件查询首条匹配记录
   * 
   * @param where 查询过滤条件
   * @param relations 可选关联实体名称数组
   * @returns 匹配的首条记录或 null
   */
  async findOne(
    where: FindOptionsWhere<T> | FindOptionsWhere<T>[],
    relations?: string[],
  ): Promise<T | null> {
    return this.repository.findOne({ where, relations });
  }

  /**
   * 列表全量条件查询
   * 
   * @param where 查询过滤条件
   * @param relations 可选关联实体名称数组
   * @returns 符合条件的所有实体记录数组
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
   * 创建并持久化新实体
   * 
   * @param createDto 实体创建数据载荷
   * @returns 持久化成功后带有生成主键的完整实体对象
   */
  async create(createDto: DeepPartial<T>): Promise<T> {
    // 实例化实体并补齐默认列属性
    const entity = this.repository.create(createDto);
    // 写入数据库并触发实体生命周期钩子
    return this.repository.save(entity);
  }

  /**
   * 根据主键 ID 更新实体字段
   * 
   * @param id 待修改的目标主键 ID
   * @param updateDto 待更新的数据载荷
   * @returns 更新完成后重新查询获取的最新实体对象
   * @throws BusinessException 当目标 ID 记录不存在时阻断操作
   */
  async update(id: number, updateDto: DeepPartial<T>): Promise<T> {
    // 先严格校验该实体是否存在，不存在则抛出 404
    await this.findById(id);
    // 执行底层 SQL UPDATE 语句
    await this.repository.update(id, updateDto as any);
    // 重新拉取最新记录返回调用端
    return this.findById(id);
  }

  /**
   * 根据主键 ID 删除单条数据
   * 
   * @param id 待删除目标主键 ID
   * @returns 删除影响行数是否大于 0
   * @throws BusinessException 当目标记录不存在时中断操作
   */
  async deleteById(id: number): Promise<boolean> {
    // 校验记录存在性
    const entity = await this.findById(id);
    // 执行物理删除操作
    const result = await this.repository.delete(entity.id);
    return (result.affected || 0) > 0;
  }

  /**
   * 根据主键数组批量删除多条记录
   * 
   * @param ids 待删除主键 ID 数组
   * @returns 是否有记录被成功删除
   * @throws BusinessException 当传入空数组时抛出参数校验异常
   */
  async deleteBatch(ids: number[]): Promise<boolean> {
    if (!ids || ids.length === 0) {
      throw new BusinessException('请选择要删除的记录ID');
    }
    // 使用 IN 条件批量删除
    const result = await this.repository.delete({ id: In(ids) } as any);
    return (result.affected || 0) > 0;
  }

  /**
   * 高阶数据库事务包装器模板方法
   * 
   * 运行机制：
   * 1. 自动从 DataSource 提取独立连接 QueryRunner 并开启底层事务；
   * 2. 执行传入的业务闭包 operation(manager)；
   * 3. 闭包正常结束则自动 commitTransaction 提交事务；
   * 4. 任意步骤发生异常则立即 rollbackTransaction 自动整体回滚，并将异常向上透传；
   * 5. finally 块中绝对保证释放 QueryRunner 连接资源，杜绝连接池泄露。
   * 
   * @template R 业务回调返回的数据类型
   * @param operation 事务内部执行的业务函数，接收事务级 EntityManager 参数
   * @returns 回调函数执行的结果值
   * @throws BusinessException 当未配置 DataSource 时抛出异常
   */
  async withTransaction<R>(
    operation: (manager: EntityManager) => Promise<R>,
  ): Promise<R> {
    if (!this.dataSource) {
      throw new BusinessException('当前服务未注入 DataSource，无法开启独立事务');
    }
    // 获取底层 QueryRunner 连接并开启事务隔离
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 业务逻辑执行（使用事务管理器的 EntityManager）
      const result = await operation(queryRunner.manager);
      // 无异常则整体提交
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      // 捕获异常立即全量回滚
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      // 绝对保证释放连接，归还数据库连接池
      await queryRunner.release();
    }
  }
}
