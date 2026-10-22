import request from '@/utils/request';

// 公告管理
export function getNoticeListApi(params: any) {
  return request({ url: '/ops/notice/list', method: 'get', params });
}
export function createNoticeApi(data: any) {
  return request({ url: '/ops/notice', method: 'post', data });
}
export function updateNoticeApi(id: number, data: any) {
  return request({ url: `/ops/notice/${id}`, method: 'put', data });
}
export function changeNoticeStatusApi(data: { id: number; status: number }) {
  return request({ url: '/ops/notice/status', method: 'put', data });
}
export function deleteNoticeApi(id: number) {
  return request({ url: `/ops/notice/${id}`, method: 'delete' });
}

// 数据字典
export function getDictDataByTypeApi(dictType: string) {
  return request({ url: `/ops/dict/data/${dictType}`, method: 'get' });
}
export function getDictListApi(params: any) {
  return request({ url: '/ops/dict/list', method: 'get', params });
}
export function createDictApi(data: any) {
  return request({ url: '/ops/dict', method: 'post', data });
}
export function updateDictApi(id: number, data: any) {
  return request({ url: `/ops/dict/${id}`, method: 'put', data });
}
export function deleteDictApi(id: number) {
  return request({ url: `/ops/dict/${id}`, method: 'delete' });
}

// 操作日志
export function getLogListApi(params: any) {
  return request({ url: '/ops/log/list', method: 'get', params });
}
export function cleanLogApi() {
  return request({ url: '/ops/log/clean', method: 'delete' });
}
