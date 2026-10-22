import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Dept } from './entities/dept.entity';
import { BaseService } from '../../common/base/base.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { CreateDeptDto, UpdateDeptDto } from './dto/dept.dto';

@Injectable()
export class DeptService extends BaseService<Dept> {
  constructor(
    @InjectRepository(Dept)
    private readonly deptRepo: Repository<Dept>,
    dataSource: DataSource,
  ) {
    super(deptRepo, dataSource);
  }

  /**
   * 获取部门树形列表
   */
  async getDeptTree(): Promise<Dept[]> {
    const list = await this.deptRepo.find({
      order: { sort: 'ASC', id: 'ASC' },
    });
    return this.buildTree(list, 0);
  }

  /**
   * 递归获取某个部门及其全部后代子部门的 ID 集合
   */
  async getAllSubDeptIds(deptId: number): Promise<number[]> {
    const allDepts = await this.deptRepo.find();
    const ids: number[] = [deptId];

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
   * 核心事务场景：删除部门
   * 规则：存在下属员工则禁止删除；无员工时，事务删除部门+全部子部门，异常自动回滚
   */
  async deleteDeptWithCascade(deptId: number): Promise<boolean> {
    const dept = await this.findById(deptId);
    if (!dept) {
      throw new BusinessException('部门不存在');
    }

    // 1. 获取当前部门及所有子孙部门 ID
    const targetDeptIds = await this.getAllSubDeptIds(deptId);

    // 2. 检查是否存在员工关联
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
      // 解除 sys_user 表中的部门关联
      await manager
        .createQueryBuilder()
        .update('sys_user')
        .set({ deptId: null })
        .where('dept_id IN (:...deptIds)', { deptIds: targetDeptIds })
        .execute();

      // 删除部门自身和子部门
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
   * 拖拽更新排序及父级
   */
  async updateSort(deptId: number, parentId: number, sort: number): Promise<boolean> {
    if (deptId === parentId) {
      throw new BusinessException('父级部门不能是自身');
    }
    await this.deptRepo.update(deptId, { parentId, sort });
    return true;
  }

  /**
   * 构建树结构
   */
  private buildTree(list: Dept[], parentId = 0): Dept[] {
    const res: Dept[] = [];
    for (const item of list) {
      if (Number(item.parentId) === parentId) {
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
