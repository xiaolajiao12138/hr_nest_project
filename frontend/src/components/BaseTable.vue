<template>
  <div class="base-table-container">
    <!-- 顶部工具栏插槽 (如新增、批量删除、导出按钮等) -->
    <div v-if="$slots.toolbar" class="table-toolbar">
      <slot name="toolbar" />
    </div>

    <!-- 表格核心 -->
    <el-table
      ref="tableRef"
      v-loading="loading"
      :data="data"
      :border="border"
      :stripe="stripe"
      :row-key="rowKey"
      style="width: 100%"
      @selection-change="handleSelectionChange"
    >
      <!-- 多选列 -->
      <el-table-column
        v-if="showSelection"
        type="selection"
        width="50"
        align="center"
      />

      <!-- 序号列 -->
      <el-table-column
        v-if="showIndex"
        type="index"
        label="序号"
        width="65"
        align="center"
      />

      <!-- 动态列渲染 -->
      <template v-for="col in columns" :key="col.prop">
        <el-table-column
          :prop="col.prop"
          :label="col.label"
          :width="col.width"
          :min-width="col.minWidth || 120"
          :align="col.align || 'center'"
          :fixed="col.fixed"
        >
          <template #default="scope">
            <!-- 自定义插槽列 -->
            <slot v-if="col.slot" :name="col.slot" :row="scope.row" :index="scope.$index" />
            <!-- 格式化处理 -->
            <span v-else-if="col.formatter">
              {{ col.formatter(scope.row[col.prop], scope.row) }}
            </span>
            <!-- 默认展示 -->
            <span v-else>
              {{ scope.row[col.prop] ?? '-' }}
            </span>
          </template>
        </el-table-column>
      </template>

      <!-- 操作列插槽 -->
      <el-table-column
        v-if="$slots.action"
        label="操作"
        :width="actionWidth"
        align="center"
        fixed="right"
      >
        <template #default="scope">
          <slot name="action" :row="scope.row" :index="scope.$index" />
        </template>
      </el-table-column>
    </el-table>

    <!-- 底部底栏与分页 -->
    <div v-if="showPagination" class="table-pagination">
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        background
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

export interface TableColumn {
  prop: string;
  label: string;
  width?: string | number;
  minWidth?: string | number;
  align?: 'left' | 'center' | 'right';
  slot?: string;
  fixed?: boolean | 'left' | 'right';
  formatter?: (val: any, row: any) => any;
}

const props = withDefaults(
  defineProps<{
    data: any[];
    columns: TableColumn[];
    loading?: boolean;
    border?: boolean;
    stripe?: boolean;
    rowKey?: string;
    showSelection?: boolean;
    showIndex?: boolean;
    showPagination?: boolean;
    actionWidth?: number | string;
    pagination?: { page: number; pageSize: number; total: number };
  }>(),
  {
    loading: false,
    border: true,
    stripe: true,
    rowKey: 'id',
    showSelection: false,
    showIndex: false,
    showPagination: true,
    actionWidth: 180,
    pagination: () => ({ page: 1, pageSize: 10, total: 0 }),
  },
);

const emit = defineEmits<{
  (e: 'selection-change', selection: any[]): void;
  (e: 'page-change', page: number): void;
  (e: 'size-change', size: number): void;
}>();

const tableRef = ref();

const handleSelectionChange = (selection: any[]) => {
  emit('selection-change', selection);
};

const handleCurrentChange = (val: number) => {
  emit('page-change', val);
};

const handleSizeChange = (val: number) => {
  emit('size-change', val);
};

defineExpose({
  tableRef,
});
</script>

<style scoped>
.base-table-container {
  background-color: #fff;
  border-radius: 6px;
  padding: 16px;
}
.table-toolbar {
  margin-bottom: 16px;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 10px;
}
.table-pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
