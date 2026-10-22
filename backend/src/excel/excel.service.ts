import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { BusinessException } from '../common/exceptions/business.exception';

export interface ColumnDefinition {
  header: string;
  key: string;
  width?: number;
  required?: boolean;
  validate?: (val: any, rowNum: number) => string | null; // 返回错误原因字符串，无错误返回 null
}

export interface ImportValidationResult<T> {
  success: boolean;
  totalRows: number;
  validRows: T[];
  errors: { row: number; field: string; message: string }[];
}

@Injectable()
export class ExcelService {
  private readonly logger = new Logger(ExcelService.name);

  /**
   * 生成导入模板 Excel Buffer
   */
  async generateTemplate(
    columns: { header: string; key: string; width?: number; sampleValue?: any }[],
    sheetName = '导入模板',
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheetName);

    worksheet.columns = columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width || 20,
    }));

    // 表头样式加粗与背景色
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF409EFF' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 28;

    // 写入示例行
    const sampleData: Record<string, any> = {};
    columns.forEach((col) => {
      sampleData[col.key] = col.sampleValue ?? '';
    });
    worksheet.addRow(sampleData);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * 解析并严格校验 Excel 数据（全量通过校验原则）
   * 逐行校验字段，若存在任意一行不合规，返回完整的错误行号与原因列表
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

    // 获取第一行作为表头映射
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

    // 逐行解析并校验数据（从第2行开始）
    for (let rowNumber = 2; rowNumber <= totalRows; rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      
      // 判断是否全为空行
      let isRowEmpty = true;
      row.eachCell((cell) => {
        if (cell.value !== null && cell.value !== undefined && String(cell.value).trim() !== '') {
          isRowEmpty = false;
        }
      });
      if (isRowEmpty) continue;

      const rowData: Record<string, any> = {};
      let rowHasError = false;

      // 遍历所有定义的列进行提取与校验
      for (const colDef of columnDefs) {
        // 查找该列对应的单元格值
        let cellValue: any = null;
        for (const [colIndex, mappedDef] of Object.entries(colIndexToKeyMap)) {
          if (mappedDef.key === colDef.key) {
            const rawVal = row.getCell(Number(colIndex)).value;
            // 处理 Excel 日期或富文本对象
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

        // 1. 必填校验
        if (colDef.required && !stringVal) {
          errors.push({
            row: rowNumber,
            field: colDef.header,
            message: `第 ${rowNumber} 行【${colDef.header}】不能为空`,
          });
          rowHasError = true;
          continue;
        }

        // 2. 自定义规则校验
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
   * 采用批次流式写入，解决千万级/百万级数据导出时的内存溢出 (OOM)
   */
  async exportLargeDataStream<T>(
    res: Response,
    fileName: string,
    columns: { header: string; key: string; width?: number }[],
    fetchPage: (page: number, pageSize: number) => Promise<{ list: T[]; total: number }>,
    pageSize = 500,
  ): Promise<void> {
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}.xlsx"`,
    );

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

    worksheet.commit();
    await workbook.commit();
  }
}
