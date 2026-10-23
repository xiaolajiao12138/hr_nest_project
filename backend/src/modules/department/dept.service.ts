import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Dept } from './entities/dept.entity';
import { BaseService } from '../../common/base/base.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { CreateDeptDto, UpdateDeptDto } from './dto/dept.dto';

/**
 * 组织架构与部门管理业务服务类
 * 
 * 核心业务领域：
 * 1. 递归构建组织架构树形拓扑（Tree）
 * 2. 深度遍历递归检索任意部门的所有后代子部门 ID 集合
 * 3. 级联安全删除事务：严格校验下属在职员工绑定，若有员工强行阻断；无员工时事务内安全级联删除部门树并解除系统用户归属
 * 4. 部门层级调动与拖拽排序（包含防自身环形循环依赖校验）
 */
@Injectable()
export class DeptService extends BaseService<Dept> {
  /**
   * 构造函数注入部门实体仓储与数据源
   * 
   * @param deptRepo 部门实体 Repository
   * @param dataSource TypeORM 全局数据源
   */
  constructor(
    @InjectRepository(Dept)
    private readonly deptRepo: Repository<Dept>,
    dataSource: DataSource,
  ) {
    super(deptRepo, dataSource);
  }

  /**
   * 获取全量组织部门树形结构列表
   * 
   * @returns 组织部门树根节点数组（每个节点附带 children 子部门列表）
   */
  async getDeptTree(): Promise<Dept[]> {
    const list = await this.deptRepo.find({
      order: { sort: 'ASC', id: 'ASC' },
    });
    return this.buildTree(list, 0);
  }

  /**
   * 递归检索指定部门以及其所有下级、孙级后代部门的全部 ID 集合
   * 
   * @param deptId 目标父部门主键 ID
   * @returns 包含自身及所有子孙部门 ID 的数组
   */
  async getAllSubDeptIds(deptId: number): Promise<number[]> {
    const allDepts = await this.deptRepo.find();
    const ids: number[] = [deptId];

    // 内部递归函数：逐层下探收集子部门
    const findChildren = (parentId: number) => {
      for (const item of allDepts) {
        if (Number(item.parentId) === parentId) {
          ids.push(item.id);
          findChildren(item.id);
        }
      }
    };

    findChildren(deptId);
    return ids;
  }

  /**
   * 核心事务业务：安全级联删除部门树
   * 
   * 防御与事务保障规则：
   * 1. 校验目标部门存在性；
   * 2. 递归检索目标部门及其所有子孙部门 ID 范围；
   * 3. 强依赖校验：检查 `hr_employee` 表中是否有员工归属于上述任意部门，若存在则严禁删除并给出具体人数提示；
   * 4. 开启独立事务：先解绑 `sys_user` 账号的部门关联（置为 NULL），再批量原子删除所有相关部门实体。
   * 
   * @param deptId 待删除目标部门 ID
   * @returns 删除影响是否生效
   * @throws BusinessException 当部门不存在或该分支下仍有在职员工时阻断抛出
   */
  async deleteDeptWithCascade(deptId: number): Promise<boolean> {
    const dept = await this.findById(deptId);
    if (!dept) {
      throw new BusinessException('部门不存在');
    }

    // 1. 获取当前部门及所有子孙部门 ID 数组
    const targetDeptIds = await this.getAllSubDeptIds(deptId);

    // 2. 严格检查是否存在在职员工关联
    const employeeCount = await this.deptRepo.manager
      .createQueryBuilder()
      .select('count(*)', 'cnt')
      .from('hr_employee', 'emp')
      .where('emp.dept_id IN (:...deptIds)', { deptIds: targetDeptIds })
      .getRawOne();

    if (Number(employeeCount?.cnt || 0) > 0) {
      throw new BusinessException(
        `删除失败：该部门及其子部门下共有 ${employeeCount.cnt} 名员工，禁止删除！请先将员工调岗至其他部门`,
      );
    }

    // 3. 执行数据库事务：批量删除目标部门及其所有子部门
    return this.withTransaction(async (manager) => {
      // 事务内解绑管理员账号 sys_user 的部门外键
      await manager
        .createQueryBuilder()
        .update('sys_user')
        .set({ deptId: null })
        .where('dept_id IN (:...deptIds)', { deptIds: targetDeptIds })
        .execute();

      // 事务内批量物理删除当前部门及其所有子部门
      const deleteResult = await manager
        .createQueryBuilder()
        .delete()
        .from(Dept)
        .where('id IN (:...deptIds)', { deptIds: targetDeptIds })
        .execute();

      return (deleteResult.affected || 0) > 0;
    });
  }

  /**
   * 调整部门所属上级父部门及同级显示排序值
   * 
   * @param deptId 当前部门 ID
   * @param parentId 新父部门 ID
   * @param sort 新排序数字（越小越靠前）
   * @returns 更新成功标识
   * @throws BusinessException 当试图将自身设为父部门时抛出环形依赖异常
   */
  async updateSort(deptId: number, parentId: number, sort: number): Promise<boolean> {
    // 基础环形依赖防御
    if (deptId === parentId) {
      throw new BusinessException('父级部门不能是自身');
    }
    await this.deptRepo.update(deptId, { parentId, sort });
    return true;
  }

  /**
   * 将扁平部门数组递归转换为树形树状节点结构
   * 
   * @param list 扁平部门实体数组
   * @param parentId 父级部门标识（根节点为 0）
   * @returns 树状嵌套数组
   */
  private buildTree(list: Dept[], parentId = 0): Dept[] {
    const res: Dept[] = [];
    for (const item of list) {
      if (Number(item.parentId) === parentId) {
        // 递归构建当前节点的子分支
        const children = this.buildTree(list, item.id);
        if (children.length > 0) {
          item.children = children;
        }
        res.push(item);
      }
    }
    return res;
  }
}
