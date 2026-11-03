import { reactive } from 'vue';
import { getDictDataByTypeApi } from '@/api/ops';
import { getToken } from '@/utils/auth';
const cache = new Map<string, Promise<any[]>>();
export function useDict(...types: string[]) {
  const data = reactive<Record<string, any[]>>({});
  for (const type of types) {
    data[type] = [];
    const key = (getToken() || '') + ':' + type;
    if (!cache.has(key)) cache.set(key, getDictDataByTypeApi(type).then((r:any)=>r || []).catch(error=>{cache.delete(key);throw error;}));
    cache.get(key)!.then(value=>{data[type]=value;}).catch(()=>{});
  }
  return data;
}
