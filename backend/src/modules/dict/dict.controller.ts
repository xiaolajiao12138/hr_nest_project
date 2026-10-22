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
} from '@nestjs/common';
import { DictService } from './dict.service';
import { PageParamDto } from '../../common/dto/page-param.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { OperLog } from '../../common/decorators/oper-log.decorator';
import { Dict } from './entities/dict.entity';

@Controller('ops/dict')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DictController {
  constructor(private readonly dictService: DictService) {}

  /**
   * 前端根据 dictType 快速获取字典键值项数组
   */
  @Get('data/:dictType')
  async getByType(@Param('dictType') dictType: string) {
    return this.dictService.getDictDataByType(dictType);
  }

  /**
   * 分页获取字典列表
   */
  @Get('list')
  @Permissions('ops:dict:list')
  async getPage(
    @Query() pageParam: PageParamDto,
    @Query('dictType') dictType?: string,
  ) {
    return this.dictService.findDictPage(pageParam, dictType);
  }

  /**
   * 新增字典项
   */
  @Post()
  @Permissions('ops:dict:list')
  @OperLog({ title: '新增数据字典', businessType: 'INSERT' })
  async create(@Body() body: Partial<Dict>) {
    return this.dictService.create(body);
  }

  /**
   * 修改字典项
   */
  @Put(':id')
  @Permissions('ops:dict:list')
  @OperLog({ title: '修改数据字典', businessType: 'UPDATE' })
  async update(@Param('id') id: number, @Body() body: Partial<Dict>) {
    return this.dictService.update(id, body);
  }

  /**
   * 删除字典项
   */
  @Delete(':id')
  @Permissions('ops:dict:list')
  @OperLog({ title: '删除数据字典', businessType: 'DELETE' })
  async delete(@Param('id') id: number) {
    return this.dictService.deleteById(id);
  }
}
