import request from '@/utils/request';

export function getEmployeeListApi(params: any) {
  return request({
    url: '/hr/employee/list',
    method: 'get',
    params,
  });
}

export function getEmployeeDetailApi(id: number) {
  return request({
    url: '/hr/employee/detail',
    method: 'get',
    params: { id },
  });
}

export function createEmployeeApi(data: any) {
  return request({
    url: '/hr/employee',
    method: 'post',
    data,
  });
}

export function updateEmployeeApi(id: number, data: any) {
  return request({
    url: `/hr/employee/${id}`,
    method: 'put',
    data,
  });
}

export function deleteEmployeeApi(id: number) {
  return request({
    url: `/hr/employee/${id}`,
    method: 'delete',
  });
}

// 下载 Excel 导入模板
export function downloadTemplateApi() {
  return request({
    url: '/hr/employee/template/download',
    method: 'get',
    responseType: 'blob',
  });
}

// 上传 Excel 导入员工
export function importEmployeeExcelApi(formData: FormData) {
  return request({
    url: '/hr/employee/import',
    method: 'post',
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

// 导出员工档案 Excel
export function exportEmployeeExcelApi(params: any) {
  return request({
    url: '/hr/employee/export/excel',
    method: 'get',
    params,
    responseType: 'blob',
  });
}
