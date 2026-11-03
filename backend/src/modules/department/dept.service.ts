import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { scopeFor, assertDepartmentScope, requireAdmin } from '../../common/security/data-scope';
import { AuthCacheService } from '../rbac/services/auth-cache.service';
import { Dept } from './entities/dept.entity';
import { BaseService } from '../../common/base/base.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { CreateDeptDto, UpdateDeptDto } from './dto/dept.dto';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';

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
    private readonly authCacheService: AuthCacheService,
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
   * 基于当前登录用户数据权限获取部门组织架构树
   * 1. 超级管理员 (admin) 或具备 'hr:dept:list' / '*' 权限：返回全量部门组织架构树
   * 2. 普通员工：仅返回自身所在部门以及其下属所有子部门构成的树状结构，实现部门数据范围隔离
   *
   * @param user 当前登录用户运行时载荷
   * @returns 组织部门树节点数组
   */
  async getDeptTreeForUser(user: CurrentUserPayload): Promise<Dept[]> {
    const scope = scopeFor(user, 'dept');
    const permitted = new Set(scope.deptIds);
    // 筛选候选为各业务范围的并集，业务接口仍各自施加资源范围。
    for (const item of Object.values(user.dataScopes || {})) for (const id of item.deptIds) permitted.add(id);
    if (user.deptId) permitted.add(user.deptId);
    const all = scope.all || Object.values(user.dataScopes || {}).some(s => s.all);
    const list = await this.deptRepo.find({ order: { sort: 'ASC', id: 'ASC' } });
    const visible = all ? list : list.filter(d => permitted.has(d.id));
    const ids = new Set(visible.map(d => d.id));
    return this.buildTree(visible.map(d => ({...d, parentId: ids.has(Number(d.parentId)) ? d.parentId : 0}) as Dept));
  }

  async getScopedDetail(id: number, user: CurrentUserPayload) {
    assertDepartmentScope(user, 'dept', id);
    return this.findById(id);
  }

  async createScoped(dto:CreateDeptDto,user:CurrentUserPayload){requireAdmin(user);const result=await this.withTransaction(async manager=>{await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))',['department:structure']);if(dto.parentId)await manager.findOneByOrFail(Dept,{id:dto.parentId});return manager.save(manager.create(Dept,dto));});await this.authCacheService.clearAllAuthorities();return result;}

  async updateScoped(id:number,dto:UpdateDeptDto,user:CurrentUserPayload){
 requireAdmin(user);
 const result=await this.withTransaction(async manager=>{
 await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))',['department:structure']);
 await manager.findOneOrFail(Dept,{where:{id},lock:{mode:'pessimistic_write'}});
 if(dto.parentId!==undefined){if((await this.getAllSubDeptIds(id)).includes(dto.parentId))throw new BusinessException('父部门不能为自身或下属部门');if(dto.parentId)await manager.findOneByOrFail(Dept,{id:dto.parentId});}
 await manager.update(Dept,id,dto);return manager.findOneByOrFail(Dept,{id});
 });await this.authCacheService.clearAllAuthorities();return result;
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
        if (Number(item.parentId) === parentId && !ids.includes(item.id)) {
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
  async deleteDeptWithCascade(deptId:number,user?:CurrentUserPayload):Promise<boolean>{
 requireAdmin(user);
 const result=await this.withTransaction(async manager=>{
 await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))',['department:structure']);
 await manager.findOneOrFail(Dept,{where:{id:deptId},lock:{mode:'pessimistic_write'}});
 const ids=await this.getAllSubDeptIds(deptId);
 const [row]=await manager.query('SELECT COUNT(*) AS count FROM hr_employee WHERE dept_id = ANY($1::int[])',[ids]);
 if(Number(row.count))throw new BusinessException('该部门或下属部门仍关联员工，不能删除');
 await manager.createQueryBuilder().update('sys_user').set({deptId:null}).where('dept_id IN (:...ids)',{ids}).execute();
 return (await manager.delete(Dept,{id:In(ids)})).affected>0;
 });
 await this.authCacheService.clearAllAuthorities();return result;
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
  async updateSort(deptId: number, parentId: number, sort: number, user?: CurrentUserPayload): Promise<boolean> {
    await this.updateScoped(deptId, { parentId, sort } as UpdateDeptDto, user);
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
