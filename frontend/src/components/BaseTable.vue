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

      <!-- 动态列渲染 (支持 Render 函数、插槽 Slot、格式化 Formatter) -->
      <template v-for="col in columns" :key="col.prop || col.label">
        <el-table-column
          :prop="col.prop"
          :label="col.label"
          :width="col.width"
          :min-width="col.minWidth || 120"
          :align="col.align || 'center'"
          :fixed="col.fixed"
        >
          <template #default="scope">
            <!-- 1. 优先使用 render 函数渲染 -->
            <RenderCol
              v-if="col.render"
              :render="col.render"
              :params="{ val: col.prop ? scope.row[col.prop] : undefined, row: scope.row, index: scope.$index }"
            />
            <!-- 2. 自定义插槽列 -->
            <slot v-else-if="col.slot" :name="col.slot" :row="scope.row" :index="scope.$index" />
            <!-- 3. 格式化处理 -->
            <span v-else-if="col.formatter">
              {{ col.formatter(scope.row[col.prop], scope.row) }}
            </span>
            <!-- 4. 默认纯文本回显 -->
            <span v-else>
              {{ scope.row[col.prop] ?? '-' }}
            </span>
          </template>
        </el-table-column>
      </template>

      <!-- 操作列 (支持 actionColumn 配置化驱动 或 原生 #action 插槽向下兼容) -->
      <el-table-column
        v-if="actionColumn || $slots.action"
        :label="actionColumn?.label || '操作'"
        :width="actionColumn?.width || actionWidth"
        :align="actionColumn?.align || 'center'"
        :fixed="actionColumn?.fixed ?? 'right'"
      >
        <template #default="scope">
          <!-- 配置化操作列 -->
          <div v-if="actionColumn" class="action-buttons-group">
            <template
              v-for="(btn, btnIdx) in getVisibleActions(actionColumn.buttons(scope.row, scope.$index), scope.row)"
              :key="btnIdx"
            >
              <!-- 气泡二次确认按钮 (如删除) -->
              <el-popconfirm
                v-if="btn.popconfirm"
                :title="btn.popconfirm.title"
                :confirm-button-text="btn.popconfirm.confirmButtonText || '确定'"
                :cancel-button-text="btn.popconfirm.cancelButtonText || '取消'"
                @confirm="btn.onClick(scope.row, scope.$index)"
              >
                <template #reference>
                  <el-button
                    :type="btn.type || 'primary'"
                    :link="btn.link ?? true"
                    :disabled="isActionDisabled(btn, scope.row)"
                  >
                    {{ btn.label }}
                  </el-button>
                </template>
              </el-popconfirm>

              <!-- 普通操作按钮 -->
              <el-button
                v-else
                :type="btn.type || 'primary'"
                :link="btn.link ?? true"
                :disabled="isActionDisabled(btn, scope.row)"
                @click="btn.onClick(scope.row, scope.$index)"
              >
                {{ btn.label }}
              </el-button>
            </template>
          </div>

          <!-- 原生插槽操作列兼容 -->
          <slot v-else name="action" :row="scope.row" :index="scope.$index" />
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
import { ref, defineComponent, VNodeChild } from 'vue';
import { usePermission } from '@/hooks/usePermission';

// 列配置定义 (支持函数式 Render)
export interface TableColumn {
  prop?: string;
  label: string;
  width?: string | number;
  minWidth?: string | number;
  align?: 'left' | 'center' | 'right';
  slot?: string;
  fixed?: boolean | 'left' | 'right';
  formatter?: (val: any, row: any) => any;
  /**
   * 自定义渲染函数：接收 val (当前字段值), row (整行数据), index (行索引)
   * 支持返回 VNode / JSX / 文本 / 组件
   */
  render?: (params: { val: any; row: any; index: number }) => VNodeChild;
}

// 单个操作按钮定义
export interface TableActionItem {
  label: string;
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  link?: boolean;
  /** 权限码，支持数组或单个字符串，内部自动鉴权，无权限自动隐藏 */
  perm?: string | string[];
  /** 显隐控制，支持布尔值或 (row) => boolean 函数 */
  show?: boolean | ((row: any) => boolean);
  /** 禁用控制，支持布尔值或 (row) => boolean 函数 */
  disabled?: boolean | ((row: any) => boolean);
  /** 点击事件回调 */
  onClick: (row: any, index: number) => void;
  /** 气泡二次确认配置 (如删除危险操作) */
  popconfirm?: {
    title: string;
    confirmButtonText?: string;
    cancelButtonText?: string;
  };
}

// 统一操作列配置
export interface ActionColumnConfig {
  label?: string;
  width?: number | string;
  fixed?: 'right' | 'left' | boolean;
  align?: 'left' | 'center' | 'right';
  /** 动态生成该行可见的操作按钮列表 */
  buttons: (row: any, index: number) => TableActionItem[];
}

// 内部轻量级 Render 渲染包装组件
const RenderCol = defineComponent({
  name: 'RenderCol',
  props: {
    render: {
      type: Function,
      required: true,
    },
    params: {
      type: Object,
      required: true,
    },
  },
  render() {
    return this.render(this.params);
  },
});

const props = withDefaults(
  defineProps<{
    data: any[];
    columns: TableColumn[];
    actionColumn?: ActionColumnConfig;
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
const { hasPermission } = usePermission();

// 按钮显隐与权限检查
const isActionVisible = (btn: TableActionItem, row: any): boolean => {
  // 1. 权限拦截 (若配置了 perm 则严格鉴权)
  if (btn.perm && !hasPermission(btn.perm)) {
    return false;
  }
  // 2. 显隐控制判断
  if (typeof btn.show === 'function') {
    return btn.show(row);
  }
  if (typeof btn.show === 'boolean') {
    return btn.show;
  }
  return true;
};

// 按钮禁用检查
const isActionDisabled = (btn: TableActionItem, row: any): boolean => {
  if (typeof btn.disabled === 'function') {
    return btn.disabled(row);
  }
  return !!btn.disabled;
};

// 过滤获得当前行可见的操作项
const getVisibleActions = (buttons: TableActionItem[], row: any): TableActionItem[] => {
  if (!Array.isArray(buttons)) return [];
  return buttons.filter((btn) => isActionVisible(btn, row));
};

const handleSelectionChange = (selection: any[]) => {
  emit('selection-change', selection);
};

const handleCurrentChange = (val: number) => {
  emit('page-change', val);
};

const handleChange = (val: number) => {
  emit('size-change', val);
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
.action-buttons-group {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}
.table-pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
