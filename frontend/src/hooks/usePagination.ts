import { reactive } from 'vue';

export interface PaginationConfig {
  page: number;
  pageSize: number;
  total: number;
}

export function usePagination(callback?: () => void, initialPageSize = 10) {
  const pagination = reactive<PaginationConfig>({
    page: 1,
    pageSize: initialPageSize,
    total: 0,
  });

  const handlePageChange = (newPage: number) => {
    pagination.page = newPage;
    callback && callback();
  };

  const handleSizeChange = (newSize: number) => {
    pagination.pageSize = newSize;
    pagination.page = 1;
    callback && callback();
  };

  const resetPage = () => {
    pagination.page = 1;
  };

  return {
    pagination,
    handlePageChange,
    handleSizeChange,
    resetPage,
  };
}
