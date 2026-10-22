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
  Patch,
  ParseIntPipe,
} from '@nestjs/common';
import { UserService } from '../services/user.service';
import {
  CreateUserDto,
  UpdateUserDto,
  ResetPasswordDto,
  ChangeUserStatusDto,
} from '../dto/rbac.dto';
import { PageParamDto } from '../../../common/dto/page-param.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { OperLog } from '../../../common/decorators/oper-log.decorator';

@Controller('system/user')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * 分页获取用户列表
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
   * 根据 ID 获取用户详情
   */
  @Get(':id')
  @Permissions('system:user:list')
  async getDetail(@Param('id') id: number) {
    return this.userService.findById(id, ['roles', 'dept']);
  }

  /**
   * 新增用户
   */
  @Post()
  @Permissions('system:user:add')
  @OperLog({ title: '新增用户', businessType: 'INSERT' })
  async create(@Body() dto: CreateUserDto) {
    return this.userService.createUser(dto);
  }

  /**
   * 编辑用户
   */
  @Put(':id')
  @Permissions('system:user:edit')
  @OperLog({ title: '编辑用户', businessType: 'UPDATE' })
  async update(@Param('id') id: number, @Body() dto: UpdateUserDto) {
    return this.userService.updateUser(id, dto);
  }

  /**
   * 删除用户
   */
  @Delete(':id')
  @Permissions('system:user:delete')
  @OperLog({ title: '删除用户', businessType: 'DELETE' })
  async delete(@Param('id') id: number) {
    return this.userService.deleteById(id);
  }

  /**
   * 重置密码
   */
  @Patch(':id/reset-password')
  @Permissions('system:user:resetPwd')
  @OperLog({ title: '重置用户密码', businessType: 'UPDATE' })
  async resetPassword(
    @Param('id') id: number,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.userService.resetPassword(id, dto);
  }

  /**
   * 切换用户状态 (启用/禁用)
   */
  @Patch(':id/status')
  @Permissions('system:user:edit')
  @OperLog({ title: '修改用户状态', businessType: 'UPDATE' })
  async changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeUserStatusDto,
  ) {
    return this.userService.changeStatus(id, dto.status);
  }
}
