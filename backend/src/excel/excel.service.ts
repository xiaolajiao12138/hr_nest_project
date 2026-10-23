import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { BusinessException } from '../common/exceptions/business.exception';

/**
 * Excel 列定义接口
 * 用于规范导入与导出的表头规则与字段映射
 */
export interface ColumnDefinition {
  /** 表头显示名称（中文） */
  header: string;
  /** 实体对象字段 key */
  key: string;
  /** 列宽（默认 20） */
  width?: number;
  /** 是否为必填项（若为 true 且值为空，校验直接报错） */
  required?: boolean;
  /**
   * 自定义行校验函数
   * @param val 单元格格式化后的文本值
   * @param rowNum 当前处理的 Excel 行号（从 2 开始）
   * @returns 校验失败时返回错误描述字符串，校验通过时返回 null
   */
  validate?: (val: any, rowNum: number) => string | null;
}

/**
 * 批量导入解析与校验结果封装接口
 */
export interface ImportValidationResult<T> {
  /** 全量数据是否全部合法（只有为 true 时才允许执行持久化事务） */
  success: boolean;
  /** 实际解析到的有效行数（包含错误行） */
  totalRows: number;
  /** 校验通过的数据集合 */
  validRows: T[];
  /** 收集到的错误清单（精准定位行号与字段） */
  errors: { row: number; field: string; message: string }[];
}

/**
 * Excel 高性能处理服务
 * 提供 Excel 模板生成、逐行严谨校验解析以及百万级大数据流式防 OOM 导出功能
 */
@Injectable()
export class ExcelService {
  private readonly logger = new Logger(ExcelService.name);

  /**
   * 生成导入模板 Excel Buffer
   *
   * @param columns 列结构定义（包含表头、字段名、宽度、示例填充值）
   * @param sheetName 工作表名称，默认为 '导入模板'
   * @returns 返回生成的 Excel 二进制 Buffer
   */
  async generateTemplate(
    columns: { header: string; key: string; width?: number; sampleValue?: any }[],
    sheetName = '导入模板',
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheetName);

    // 设置列头与宽度
    worksheet.columns = columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width || 20,
    }));

    // 表头行样式美化：加粗、居中、品牌蓝底白字
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF409EFF' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 28;

    // 写入一行示例提示数据，帮助用户了解填写规范
    const sampleData: Record<string, any> = {};
    columns.forEach((col) => {
      sampleData[col.key] = col.sampleValue ?? '';
    });
    worksheet.addRow(sampleData);

    // 生成内存二进制 Buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * 解析并严格校验 Excel 数据（全量通过校验原则）
   * 逐行校验字段，若存在任意一行不合规，返回完整的错误行号与原因列表
   *
   * @param fileBuffer 上传的 Excel 文件内存 Buffer
   * @param columnDefs 列校验规则定义
   * @returns 返回解析与校验结果报告
   * @throws {BusinessException} 当文件为空或未包含任何有效数据行时抛出业务异常
   */
  async parseAndValidate<T>(
    fileBuffer: Buffer,
    columnDefs: ColumnDefinition[],
  ): Promise<ImportValidationResult<T>> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new BusinessException('Excel工作表为空');
    }

    const errors: { row: number; field: string; message: string }[] = [];
    const validRows: T[] = [];

    // 获取第一行作为表头映射，动态根据表头名称匹配列索引，防止列顺序颠倒导致解析错乱
    const headerRow = worksheet.getRow(1);
    const colIndexToKeyMap: Record<number, ColumnDefinition> = {};

    headerRow.eachCell((cell, colNumber) => {
      const headerText = String(cell.value || '').trim();
      const matchedCol = columnDefs.find((c) => c.header === headerText);
      if (matchedCol) {
        colIndexToKeyMap[colNumber] = matchedCol;
      }
    });

    const totalRows = worksheet.rowCount;
    if (totalRows <= 1) {
      throw new BusinessException('导入文件中未检测到任何数据行');
    }

    // 逐行解析并校验数据（从第 2 行开始，跳过表头）
    for (let rowNumber = 2; rowNumber <= totalRows; rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      
      // 判断是否全为空行（跳过用户在表格底部误输入的空白行）
      let isRowEmpty = true;
      row.eachCell((cell) => {
        if (cell.value !== null && cell.value !== undefined && String(cell.value).trim() !== '') {
          isRowEmpty = false;
        }
      });
      if (isRowEmpty) continue;

      const rowData: Record<string, any> = {};
      let rowHasError = false;

      // 遍历所有定义的列规则进行数据提取与合规性校验
      for (const colDef of columnDefs) {
        // 查找该列对应的单元格值
        let cellValue: any = null;
        for (const [colIndex, mappedDef] of Object.entries(colIndexToKeyMap)) {
          if (mappedDef.key === colDef.key) {
            const rawVal = row.getCell(Number(colIndex)).value;
            // 处理 Excel 日期或富文本复杂对象结构
            if (rawVal && typeof rawVal === 'object' && 'text' in rawVal) {
              cellValue = (rawVal as any).text;
            } else if (rawVal instanceof Date) {
              cellValue = rawVal.toISOString().split('T')[0];
            } else {
              cellValue = rawVal;
            }
            break;
          }
        }

        const stringVal = cellValue !== null && cellValue !== undefined ? String(cellValue).trim() : '';

        // 1. 必填字段非空校验
        if (colDef.required && !stringVal) {
          errors.push({
            row: rowNumber,
            field: colDef.header,
            message: `第 ${rowNumber} 行【${colDef.header}】不能为空`,
          });
          rowHasError = true;
          continue;
        }

        // 2. 字段格式/业务规则自定义校验
        if (colDef.validate && stringVal) {
          const errMsg = colDef.validate(stringVal, rowNumber);
          if (errMsg) {
            errors.push({
              row: rowNumber,
              field: colDef.header,
              message: `第 ${rowNumber} 行【${colDef.header}】：${errMsg}`,
            });
            rowHasError = true;
            continue;
          }
        }

        rowData[colDef.key] = stringVal;
      }

      // 该行所有字段均合规时加入有效数据列表
      if (!rowHasError) {
        validRows.push(rowData as T);
      }
    }

    return {
      success: errors.length === 0,
      totalRows: validRows.length + errors.length,
      validRows,
      errors,
    };
  }

  /**
   * 大数据流式分页导出
   * 采用批次流式写入 (WorkbookWriter)，避免一次性将全部实体载入内存引发 Node.js 堆内存溢出 (OOM)
   *
   * @param res Express HTTP 响应流
   * @param fileName 导出文件名（无需后缀名）
   * @param columns 列结构定义
   * @param fetchPage 分页加载函数（提供当前页码和每页条数，返回当页数据及总记录数）
   * @param pageSize 每批次分页抓取数据量，默认 500
   */
  async exportLargeDataStream<T>(
    res: Response,
    fileName: string,
    columns: { header: string; key: string; width?: number }[],
    fetchPage: (page: number, pageSize: number) => Promise<{ list: T[]; total: number }>,
    pageSize = 500,
  ): Promise<void> {
    // 设置响应头，声明为流式二进制 Excel 文件下载
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}.xlsx"`,
    );

    // 启用 ExcelJS 流式写入器
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: res,
      useStyles: true,
      useSharedStrings: true,
    });

    const worksheet = workbook.addWorksheet('数据列表');
    worksheet.columns = columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width || 18,
    }));

    let page = 1;
    let fetchedTotal = 0;
    let totalCount = 0;

    // 分页拉取数据并即时 commit 写入流，降低内存驻留
    do {
      const result = await fetchPage(page, pageSize);
      totalCount = result.total;

      for (const item of result.list) {
        worksheet.addRow(item).commit();
      }

      fetchedTotal += result.list.length;
      page++;

      if (result.list.length === 0) break;
    } while (fetchedTotal < totalCount);

    // 提交工作表与工作簿完成流式传输
    worksheet.commit();
    await workbook.commit();
  }
}
