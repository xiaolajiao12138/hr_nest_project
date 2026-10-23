import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { UserService } from '../services/user.service';
import {
  CreateUserDto,
  UpdateUserDto,
  ResetPasswordDto,
  ChangeUserStatusDto,
  UpdateProfileDto,
  UpdatePasswordDto,
} from '../dto/rbac.dto';
import { PageParamDto } from '../../../common/dto/page-param.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { OperLog } from '../../../common/decorators/oper-log.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../../common/decorators/current-user.decorator';

/**
 * 系统用户与账号权限管理控制器
 * 涵盖当前登录用户个人中心管理（资料修改、修改自身密码、个人操作审计日志），
 * 以及系统管理员用户维护（用户分页检索、新增用户、重置密码、启停用账号、编辑更新与注销删除）
 */
@Controller('system/user')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * 获取当前登录用户个人资料详情
   * 免细粒度权限校验，仅依赖合法 JWT 认证
   *
   * @param user 从当前请求 Token 载荷提取出的用户信息
   * @returns 返回当前用户基本信息及绑定角色列表
   */
  @Get('profile')
  async getProfile(@CurrentUser() user: CurrentUserPayload) {
    return this.userService.getProfile(user.userId);
  }

  /**
   * 修改当前登录用户个人基本资料（昵称、手机号、邮箱、头像等）
   *
   * @param user 当前登录用户上下文
   * @param dto 个人资料更新载荷
   * @returns 返回修改后的实体
   */
  @Put('profile')
  @OperLog({ title: '修改个人资料', businessType: 'UPDATE' })
  async updateProfile(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.userService.updateProfile(user.userId, dto);
  }

  /**
   * 当前登录用户修改个人登录密码
   * 需校验旧密码是否匹配，校验通过后采用 BCrypt 加盐哈希安全持久化
   *
   * @param user 当前登录用户上下文
   * @param dto 包含旧密码与新密码的入参载荷
   * @returns 返回操作结果布尔值
   */
  @Put('profile/update-pwd')
  @OperLog({ title: '修改个人密码', businessType: 'UPDATE' })
  async updatePassword(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdatePasswordDto,
  ) {
    return this.userService.updatePassword(user.userId, dto);
  }

  /**
   * 分页获取当前登录用户的操作审计日志
   *
   * @param user 当前登录用户上下文
   * @param pageParam 分页请求参数
   * @returns 返回该用户触发的操作日志分页结果
   */
  @Get('profile/logs')
  async getProfileLogs(
    @CurrentUser() user: CurrentUserPayload,
    @Query() pageParam: PageParamDto,
  ) {
    return this.userService.getUserLogs(user.username, pageParam);
  }

  /**
   * 分页获取系统用户列表
   * 支持通过部门 ID 级联筛选其归属用户
   *
   * @param pageParam 分页请求参数
   * @param deptId 组织部门主键 ID（可选）
   * @returns 返回用户分页列表及总数
   */
  @Get('list')
  @Permissions('system:user:list')
  async getPage(
    @Query() pageParam: PageParamDto,
    @Query('deptId') deptId?: number,
  ) {
    return this.userService.findUserPage(pageParam, deptId);
  }

  /**
   * 根据主键 ID 获取用户完整详情
   * 自动加载关联的角色实体 roles 与所属部门实体 dept
   *
   * @param id 用户主键 ID
   * @returns 返回关联后的用户完整实体
   */
  @Get(':id')
  @Permissions('system:user:list')
  async getDetail(@Param('id', ParseIntPipe) id: number) {
    return this.userService.findById(id, ['roles', 'dept']);
  }

  /**
   * 新增录入系统后台用户
   *
   * @param dto 创建用户参数（用户名、昵称、初始密码、所属部门、分配角色等）
   * @returns 返回创建成功的用户实体
   */
  @Post()
  @Permissions('system:user:add')
  @OperLog({ title: '新增用户', businessType: 'INSERT' })
  async create(@Body() dto: CreateUserDto) {
    return this.userService.createUser(dto);
  }

  /**
   * 管理员强制重置目标用户登录密码
   *
   * @param dto 包含目标用户 ID 和新密码的入参载荷
   * @returns 返回操作结果布尔值
   */
  @Put('reset-password')
  @Permissions('system:user:resetPwd')
  @OperLog({ title: '重置用户密码', businessType: 'UPDATE' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.userService.resetPassword(dto.id, dto);
  }

  /**
   * 切换用户状态（启用 1 / 禁用 0）
   *
   * @param dto 包含用户 ID 与目标状态的载荷
   * @returns 返回操作结果布尔值
   */
  @Put('status')
  @Permissions('system:user:edit')
  @OperLog({ title: '修改用户状态', businessType: 'UPDATE' })
  async changeStatus(@Body() dto: ChangeUserStatusDto) {
    return this.userService.changeStatus(dto.id, dto.status);
  }

  /**
   * 编辑修改用户信息及重新分配绑定角色
   *
   * @param id 用户主键 ID
   * @param dto 更新参数载荷
   * @returns 返回更新后的用户实体
   */
  @Put(':id')
  @Permissions('system:user:edit')
  @OperLog({ title: '编辑用户', businessType: 'UPDATE' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.userService.updateUser(id, dto);
  }

  /**
   * 删除指定的系统用户
   *
   * @param id 用户主键 ID
   * @returns 返回删除影响行数对象
   */
  @Delete(':id')
  @Permissions('system:user:delete')
  @OperLog({ title: '删除用户', businessType: 'DELETE' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.userService.deleteById(id);
  }
}
