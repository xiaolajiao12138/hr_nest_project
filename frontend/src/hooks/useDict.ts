import { ref, reactive } from 'vue';
import { getDictDataByTypeApi } from '@/api/ops';

const dictCache = new Map<string, any[]>();

export function useDict(...types: string[]) {
  const dictData = reactive<Record<string, any[]>>({});

  types.forEach((type) => {
    dictData[type] = [];
    if (dictCache.has(type)) {
      dictData[type] = dictCache.get(type)!;
    } else {
      getDictDataByTypeApi(type)
        .then((res: any) => {
          dictData[type] = res || [];
          dictCache.set(type, res || []);
        })
        .catch(() => {
          dictData[type] = [];
        });
    }
  });

  return dictData;
}
