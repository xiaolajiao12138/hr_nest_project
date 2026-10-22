import { Controller, Get, Delete, Query, UseGuards } from '@nestjs/common';
import { LogService } from './log.service';
import { PageParamDto } from '../../common/dto/page-param.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { OperLog } from '../../common/decorators/oper-log.decorator';

@Controller('ops/log')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LogController {
  constructor(private readonly logService: LogService) {}

  @Get('list')
  @Permissions('ops:log:list')
  async getPage(@Query() pageParam: PageParamDto) {
    return this.logService.findLogPage(pageParam);
  }

  @Delete('clean')
  @Permissions('ops:log:list')
  @OperLog({ title: '清空操作日志', businessType: 'DELETE' })
  async clean() {
    return this.logService.cleanLogs();
  }
}
