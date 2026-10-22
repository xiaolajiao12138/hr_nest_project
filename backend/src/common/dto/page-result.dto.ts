/**
 * 通用分页返回结构 DTO
 */
export class PageResultDto<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;

  constructor(list: T[], total: number, page: number, pageSize: number) {
    this.list = list;
    this.total = total;
    this.page = page;
    this.pageSize = pageSize;
    this.totalPages = Math.ceil(total / (pageSize || 10));
  }

  static create<T>(
    list: T[],
    total: number,
    page: number,
    pageSize: number,
  ): PageResultDto<T> {
    return new PageResultDto(list, total, page, pageSize);
  }
}
