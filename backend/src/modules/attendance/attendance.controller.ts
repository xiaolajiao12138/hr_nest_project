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
import { AttendanceService } from './attendance.service';
import {
  SaveShiftDto,
  BatchSetScheduleDto,
  ClockInDto,
  QueryAttendanceRecordDto,
  RepairAttendanceDto,
} from './dto/attendance.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

/**
 * 考勤打卡与排班日历管理控制器
 */
@Controller('attendance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  // ==================== 班次管理 ====================

  /**
   * 根据 ID 查询班次规则详情
   * Query 传参: GET /attendance/shift/detail?id=4
   */
  @Get('shift/detail')
  @Permissions('hr:attendance:list')
  async getShiftDetail(@Query('id', ParseIntPipe) id: number) {
    return this.attendanceService.getShiftDetail(id);
  }

  @Get('shift/list')
  @Permissions('hr:attendance:list')
  async getShiftList() {
    return this.attendanceService.getShiftList();
  }

  @Post('shift')
  @Permissions('hr:attendance:shift')
  async createShift(@Body() dto: SaveShiftDto) {
    return this.attendanceService.saveShift(dto);
  }

  @Put('shift/:id')
  @Permissions('hr:attendance:shift')
  async updateShift(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveShiftDto,
  ) {
    return this.attendanceService.saveShift(dto, id);
  }

  @Delete('shift/:id')
  @Permissions('hr:attendance:shift')
  async deleteShift(@Param('id', ParseIntPipe) id: number) {
    return this.attendanceService.deleteShift(id);
  }

  // ==================== 排班日历 ====================

  @Get('schedule/month')
  @Permissions('hr:attendance:list')
  async getMonthSchedule(
    @Query('yearMonth') yearMonth: string,
    @Query('deptId') deptId?: number,
  ) {
    return this.attendanceService.getMonthSchedule(yearMonth, deptId ? Number(deptId) : undefined);
  }

  @Post('schedule/batch-set')
  @Permissions('hr:attendance:schedule')
  async batchSetSchedule(@Body() dto: BatchSetScheduleDto) {
    return this.attendanceService.batchSetSchedule(dto);
  }

  // ==================== 打卡业务 ====================

  @Post('clock')
  @Permissions('hr:attendance:clock')
  async clockIn(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ClockInDto,
  ) {
    return this.attendanceService.clockIn(user.userId, dto);
  }

  @Get('today')
  async getTodayStatus(@CurrentUser() user: CurrentUserPayload) {
    return this.attendanceService.getTodayStatus(user.userId);
  }

  // ==================== 明细监控与补卡 ====================

  /**
   * 根据 ID 查询单条考勤记录详情
   * Query 传参: GET /attendance/record/detail?id=4
   */
  @Get('record/detail')
  @Permissions('hr:attendance:list')
  async getRecordDetail(@Query('id', ParseIntPipe) id: number) {
    return this.attendanceService.getRecordDetail(id);
  }

  @Get('record/list')
  @Permissions('hr:attendance:list')
  async getRecordList(@Query() query: QueryAttendanceRecordDto) {
    return this.attendanceService.getRecordList(query);
  }

  @Post('record/repair')
  @Permissions('hr:attendance:repair')
  async repairRecord(@Body() dto: RepairAttendanceDto) {
    return this.attendanceService.repairRecord(dto);
  }
}
