import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, Like } from 'typeorm';
import { User } from '../entities/user.entity';
import { Role } from '../entities/role.entity';
import { BaseService } from '../../../common/base/base.service';
import { CreateUserDto, UpdateUserDto, ResetPasswordDto } from '../dto/rbac.dto';
import { BusinessException } from '../../../common/exceptions/business.exception';
import * as bcrypt from 'bcryptjs';
import { PageParamDto } from '../../../common/dto/page-param.dto';
import { PageResultDto } from '../../../common/dto/page-result.dto';

@Injectable()
export class UserService extends BaseService<User> {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    dataSource: DataSource,
  ) {
    super(userRepo, dataSource);
  }

  /**
   * 分页查询用户（带关联部门和角色）
   */
  async findUserPage(
    pageParam: PageParamDto,
    deptId?: number,
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
  async createUser(dto: CreateUserDto): Promise<User> {
    const exist = await this.userRepo.findOne({
      where: { username: dto.username },
    });
    if (exist) {
      throw new BusinessException(`用户名 ${dto.username} 已存在`);
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = this.userRepo.create({
      username: dto.username,
      password: hashedPassword,
      realName: dto.realName,
      phone: dto.phone,
      email: dto.email,
      deptId: dto.deptId,
      status: 1,
    });

    if (dto.roleIds && dto.roleIds.length > 0) {
      user.roles = await this.roleRepo.findBy({ id: In(dto.roleIds) });
    }

    return this.userRepo.save(user);
  }

  /**
   * 编辑用户
   */
  async updateUser(id: number, dto: UpdateUserDto): Promise<User> {
    const user = await this.findById(id, ['roles']);
    if (!user) {
      throw new BusinessException('用户不存在');
    }

    user.realName = dto.realName ?? user.realName;
    user.phone = dto.phone ?? user.phone;
    user.email = dto.email ?? user.email;
    user.deptId = dto.deptId ?? user.deptId;
    if (dto.status !== undefined) {
      user.status = dto.status;
    }

    if (dto.roleIds) {
      user.roles = await this.roleRepo.findBy({ id: In(dto.roleIds) });
    }

    return this.userRepo.save(user);
  }

  /**
   * 重置密码
   */
  async resetPassword(id: number, dto: ResetPasswordDto): Promise<boolean> {
    const user = await this.findById(id);
    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepo.update(user.id, { password: hashedPassword });
    return true;
  }

  /**
   * 修改用户状态
   */
  async changeStatus(id: number, status: number): Promise<boolean> {
    const user = await this.findById(id);
    if (!user) {
      throw new BusinessException('待修改状态的用户不存在');
    }
    // 企业级核心防护：超级管理员禁止停用
    if (user.username === 'admin' && Number(status) === 0) {
      throw new BusinessException('系统安全保护：超级管理员账号禁止停用');
    }
    await this.userRepo.update(id, { status: Number(status) });
    return true;
  }
}
