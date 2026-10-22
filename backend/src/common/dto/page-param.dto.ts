import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min, Max, IsIn } from 'class-validator';

/**
 * 通用分页请求入参 DTO
 */
export class PageParamDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '当前页码必须是整数' })
  @Min(1, { message: '当前页码最小为1' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '每页条数必须是整数' })
  @Min(1, { message: '每页条数最小为1' })
  @Max(100, { message: '单次最多请求100条' })
  pageSize: number = 10;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  sortField?: string = 'id';

  @IsOptional()
  @IsIn(['ASC', 'DESC', 'asc', 'desc'], { message: '排序方向仅允许 ASC 或 DESC' })
  sortOrder?: 'ASC' | 'DESC' | 'asc' | 'desc' = 'DESC';
}
