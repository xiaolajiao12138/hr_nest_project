import { SysFile } from '../../../upload/entities/file.entity';
import { sanitizeLog } from '../../../common/security/sanitize';
import { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, Like } from 'typeorm';
import { applyScope, assertScope, assertDepartmentScope, assertEmployeeScope, requireAdmin, isAdmin } from '../../../common/security/data-scope';
import { User } from '../entities/user.entity';
import { Role } from '../entities/role.entity';
import { BaseService } from '../../../common/base/base.service';
import {
  CreateUserDto,
  UpdateUserDto,
  ResetPasswordDto,
  UpdateProfileDto,
  UpdatePasswordDto,
} from '../dto/rbac.dto';
import { OperLogEntity } from '../../log/entities/oper-log.entity';
import { BusinessException } from '../../../common/exceptions/business.exception';
import * as bcrypt from 'bcryptjs';
import { PageParamDto } from '../../../common/dto/page-param.dto';
import { PageResultDto } from '../../../common/dto/page-result.dto';
import { AuthCacheService } from './auth-cache.service';
import { SseService } from '../../sse/sse.service';

@Injectable()
export class UserService extends BaseService<User> {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    private readonly authCacheService: AuthCacheService,
    private readonly sseService: SseService,
    dataSource: DataSource,
  ) {
    super(userRepo, dataSource);
  }

  /**
   * 分页查询用户（带关联部门和角色）
   */
  async findUserPage(
    pageParam: PageParamDto,
    deptId?: number, user?: CurrentUserPayload
  ): Promise<PageResultDto<User>> {
    const page = Number(pageParam.page) || 1;
    const pageSize = Number(pageParam.pageSize) || 10;
    const skip = (page - 1) * pageSize;

    const queryBuilder = this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.dept', 'dept')
      .leftJoinAndSelect('user.roles', 'role')
      .skip(skip)
      .take(pageSize)
      .orderBy('user.id', 'DESC');

    applyScope(queryBuilder, user, 'user', 'user.deptId', 'user.employeeId');
    if (pageParam.keyword) {
      queryBuilder.andWhere(
        '(user.username LIKE :kw OR user.realName LIKE :kw OR user.phone LIKE :kw)',
        { kw: `%${pageParam.keyword}%` },
      );
    }

    if (deptId) {
      queryBuilder.andWhere('user.deptId = :deptId', { deptId });
    }

    const [list, total] = await queryBuilder.getManyAndCount();
    return PageResultDto.create(list, total, page, pageSize);
  }

  /**
   * 新增用户
   */
  async createUser(dto: CreateUserDto, actor?: CurrentUserPayload): Promise<User> {
    requireAdmin(actor);
    if (await this.userRepo.existsBy({ username: dto.username })) throw new BusinessException('用户名已存在');
    const boundDept = await this.validateBinding(dto.employeeId, actor);
    if(boundDept && dto.deptId && dto.deptId!==boundDept) throw new BusinessException('账号部门必须与关联员工一致');
    const roles = dto.roleIds?.length ? await this.roleRepo.findBy({ id: In(dto.roleIds) }) : [];
    if (roles.length !== new Set(dto.roleIds || []).size) throw new BusinessException('角色不存在');
    const account = this.userRepo.create({ username: dto.username, password: await bcrypt.hash(dto.password, 12),
      realName: dto.realName, phone: dto.phone, email: dto.email, deptId: boundDept ?? dto.deptId,
      employeeId: dto.employeeId, roles, status: 1 });
    const saved = await this.userRepo.save(account);
    delete saved.password; delete saved.salt;
    return saved;
  }

  async getUserDetail(id: number, relations: string[] = [], actor?: CurrentUserPayload): Promise<User> {
    const account = await super.findById(id, [...new Set([...relations, 'roles'])]);
    if (account.id !== actor?.userId) assertScope(actor, 'user', account.employeeId, account.deptId);
    return account;
  }

  private async validateBinding(employeeId: number | null | undefined, actor: CurrentUserPayload, accountId?: number) {
    if (!employeeId) return null;
    if (accountId === undefined || (await this.userRepo.findOneBy({id:accountId}))?.employeeId !== employeeId) await assertEmployeeScope(this.dataSource, actor, 'employee', employeeId);
    const bound = await this.userRepo.findOneBy({ employeeId });
    if (bound && bound.id !== accountId) throw new BusinessException('该员工档案已关联其他账号');
    const [employee] = await this.dataSource.query('SELECT dept_id, status FROM hr_employee WHERE id=$1',[employeeId]);
    if (![1,3].includes(Number(employee.status))) throw new BusinessException('只能关联在职或试用员工');
    return Number(employee.dept_id);
  }

  private async writableAccount(id: number, actor: CurrentUserPayload) {
    const account = await this.getUserDetail(id, ['roles'], actor);
    if (!isAdmin(actor) && (account.username === 'admin' || account.roles?.some(r => r.roleKey === 'admin'))) {
      throw new ForbiddenException('无权维护管理员账号');
    }
    return account;
  }

  /**
   * 编辑用户
   */
  async updateUser(id: number, dto: UpdateUserDto, actor?: CurrentUserPayload): Promise<User> {
    const account = await this.writableAccount(id, actor);
    if (dto.roleIds !== undefined || dto.employeeId !== undefined) requireAdmin(actor);
    if (dto.deptId !== undefined && dto.deptId !== account.deptId) assertDepartmentScope(actor, 'user', dto.deptId);
    const boundDept = await this.validateBinding(dto.employeeId === undefined ? account.employeeId : dto.employeeId, actor, id);
    if(boundDept && dto.deptId !== undefined && dto.deptId!==boundDept) throw new BusinessException('账号部门必须与关联员工一致');
    if(boundDept) dto.deptId=boundDept;
    if (dto.status !== undefined && ![0,1].includes(dto.status)) throw new BusinessException('无效账号状态');
    if ((id === actor.userId || account.username === 'admin') && dto.status === 0) throw new BusinessException('不能停用当前账号或系统管理员');
    for (const key of ['realName','phone','email','deptId','status','employeeId']) {
      if (dto[key] !== undefined) account[key] = dto[key];
    }
    if (dto.roleIds !== undefined) {
      if (account.username === 'admin') throw new BusinessException('系统管理员角色不可变更');
      account.roles = dto.roleIds.length ? await this.roleRepo.findBy({ id: In(dto.roleIds) }) : [];
      if (account.roles.length !== new Set(dto.roleIds).size) throw new BusinessException('角色不存在');
    }
    const saved = await this.userRepo.save(account);
    await this.authCacheService.clearUserAuthorities(id);
    this.sseService.sendPermissionUpdateToUser(id, '账号权限已更新');
    delete saved.password; delete saved.salt;
    return saved;
  }

  /**
   * 重置密码
   */
  async resetPassword(id: number, dto: ResetPasswordDto, actor?: CurrentUserPayload): Promise<boolean> {
    await this.writableAccount(id, actor);
    await this.userRepo.update(id, { password: await bcrypt.hash(dto.newPassword, 12) });
    await this.authCacheService.clearUserAuthorities(id);
    return true;
  }

  /**
   * 修改用户状态
   */
  async changeStatus(id: number, status: number, actor?: CurrentUserPayload): Promise<boolean> {
    await this.updateUser(id, { status: Number(status) }, actor);
    return true;
  }

  /**
   * 重写用户删除
   */
  async deleteById(id: number, actor?: CurrentUserPayload): Promise<boolean> {
    const account = await this.writableAccount(id, actor);
    if (id === actor.userId || account.username === 'admin') throw new BusinessException('不能删除当前账号或系统管理员');
    const res = await super.deleteById(id);
    await this.authCacheService.clearUserAuthorities(id);
    this.sseService.sendPermissionUpdateToUser(id, '账号已移除');
    return res;
  }

  /**
   * 获取当前登录用户个人详细信息
   */
  async getProfile(userId: number) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['dept', 'roles'],
    });

    if (!user) {
      throw new BusinessException('用户不存在');
    }

    return {
      id: user.id,
      username: user.username,
      realName: user.realName,
      phone: user.phone || '',
      email: user.email || '',
      avatar: user.avatar || '',
      status: user.status,
      createdAt: user.createdAt,
      dept: user.dept ? { id: user.dept.id, deptName: user.dept.deptName } : null,
      roles: (user.roles || []).map((role) => ({
        id: role.id,
        roleName: role.roleName,
        roleKey: role.roleKey,
      })),
    };
  }

  /**
   * 更新当前登录用户个人资料
   */
  async updateProfile(userId: number, dto: UpdateProfileDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new BusinessException('用户不存在');
    }

    if (dto.realName !== undefined) {
      user.realName = dto.realName;
    }
    if (dto.phone !== undefined) {
      user.phone = dto.phone;
    }
    if (dto.email !== undefined) {
      user.email = dto.email;
    }
    if (dto.avatar !== undefined) {
      if (!dto.avatar || /^\/avatars\/avatar-\d+\.svg$/.test(dto.avatar)) {
        user.avatar = dto.avatar;
      } else {
        const directFile = /^\/api\/upload\/avatar\/([a-zA-Z0-9_.-]+\.(?:png|jpg|jpeg|webp|gif))$/i.exec(dto.avatar);
        const logical = /^\/api\/upload\/avatar\/(\d+)$/.exec(dto.avatar);
        const signed = /[?&]fileId=(\d+)(?:&|$)/.exec(dto.avatar);
        const repo = this.dataSource.getRepository(SysFile);
        let file: SysFile | null = null;
        if (directFile?.[1]) {
          file = await repo.findOneBy({ fileName: directFile[1] });
        } else {
          const id = Number(logical?.[1] || signed?.[1]);
          file = Number.isSafeInteger(id) ? await repo.findOneBy({ id }) : null;
        }
        if (
          !file ||
          file.ownerUserId !== userId ||
          !file.filePath.startsWith('avatar/') ||
          !['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes((file.fileExt || '').toLowerCase())
        ) {
          throw new BusinessException('请选择本人上传的图片头像');
        }
        user.avatar = `/api/upload/avatar/${file.fileName}`;
      }
    }

    const updated = await this.userRepo.save(user);
    return {
      id: updated.id,
      username: updated.username,
      realName: updated.realName,
      phone: updated.phone,
      email: updated.email,
      avatar: updated.avatar,
    };
  }

  /**
   * 修改当前登录用户密码
   */
  async updatePassword(userId: number, dto: UpdatePasswordDto) {
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.id = :id', { id: userId })
      .getOne();

    if (!user) {
      throw new BusinessException('用户不存在');
    }

    const isMatch = await bcrypt.compare(dto.oldPassword, user.password);
    if (!isMatch) {
      throw new BusinessException('原旧密码输入错误，请重新确认');
    }

    if (dto.oldPassword === dto.newPassword) {
      throw new BusinessException('新密码不能与原旧密码相同');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepo.update(user.id, { password: hashedPassword });
    return true;
  }

  /**
   * 查询个人操作日志（近况审计）
   */
  async getUserLogs(username: string, pageParam: PageParamDto) {
    const page = Number(pageParam.page) || 1;
    const pageSize = Number(pageParam.pageSize) || 10;
    const skip = (page - 1) * pageSize;

    const logRepo = this.dataSource.getRepository(OperLogEntity);
    const [list, total] = await logRepo.findAndCount({
      where: { operName: username },
      order: { operTime: 'DESC' },
      skip,
      take: pageSize,
    });

    return PageResultDto.create(list.map(sanitizeLog), total, page, pageSize);
  }
}
