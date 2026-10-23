import { Controller, Get, Delete, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
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

  /**
   * 根据 ID 查询日志详情（包含入参、出参和异常信息）
   * Query 风格: GET /ops/log/detail?id=4
   */
  @Get('detail')
  @Permissions('ops:log:list')
  async getDetail(@Query('id', ParseIntPipe) id: number) {
    return this.logService.getLogDetail(id);
  }

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
