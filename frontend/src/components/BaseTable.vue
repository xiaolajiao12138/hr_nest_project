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

/**
 * 通用表格列配置定义
 * 支持字段提取、具名插槽、格式化函数与 JSX/VNode 自定义 Render 渲染
 */
export interface TableColumn {
  /** 实体对象字段 key */
  prop?: string;
  /** 表头标题文本 */
  label: string;
  /** 固定列宽 */
  width?: string | number;
  /** 最小列宽，默认 120 */
  minWidth?: string | number;
  /** 对齐方式，默认居中对齐 */
  align?: 'left' | 'center' | 'right';
  /** 自定义插槽名称 */
  slot?: string;
  /** 列固定位置 ('left' | 'right') */
  fixed?: boolean | 'left' | 'right';
  /**
   * 单元格内容简易格式化函数
   * @param val 当前单元格字段值
   * @param row 当前整行数据对象
   * @returns 格式化后的渲染文本或数字
   */
  formatter?: (val: any, row: any) => any;
  /**
   * 自定义渲染函数：接收 val (当前字段值), row (整行数据), index (行索引)
   * 支持返回 VNode / JSX / 文本 / 组件
   */
  render?: (params: { val: any; row: any; index: number }) => VNodeChild;
}

/**
 * 单个操作按钮规范定义
 */
export interface TableActionItem {
  /** 按钮文案 */
  label: string;
  /** 按钮颜色类型 */
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  /** 是否为文字链接按钮，默认为 true */
  link?: boolean;
  /** 细粒度按钮权限码，支持数组或单个字符串；内部自动鉴权，无权限自动隐藏 */
  perm?: string | string[];
  /** 显隐控制条件，支持布尔值或 (row) => boolean 动态判断函数 */
  show?: boolean | ((row: any) => boolean);
  /** 禁用控制条件，支持布尔值或 (row) => boolean 动态判断函数 */
  disabled?: boolean | ((row: any) => boolean);
  /**
   * 按钮点击事件回调函数
   * @param row 当前操作行数据
   * @param index 当前行索引下标
   */
  onClick: (row: any, index: number) => void;
  /** 气泡二次确认弹窗配置（如用于删除等高危操作） */
  popconfirm?: {
    title: string;
    confirmButtonText?: string;
    cancelButtonText?: string;
  };
}

/**
 * 配置化操作列整体定义
 */
export interface ActionColumnConfig {
  /** 表头文案，默认 '操作' */
  label?: string;
  /** 列宽，默认 180 */
  width?: number | string;
  /** 固定侧，默认 'right' */
  fixed?: 'right' | 'left' | boolean;
  /** 对齐方式，默认 'center' */
  align?: 'left' | 'center' | 'right';
  /**
   * 动态生成该行可见的操作按钮列表函数
   * @param row 行数据
   * @param index 行索引
   * @returns 返回该行所有的操作按钮定义数组
   */
  buttons: (row: any, index: number) => TableActionItem[];
}

/**
 * 内部轻量级 Render 渲染包装组件
 * 将外界传入的 render 闭包函数转化为可直接渲染的 Vue 虚拟节点
 */
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

/**
 * BaseTable 组件 Props 输入属性定义
 */
const props = withDefaults(
  defineProps<{
    /** 表格数据源 */
    data: any[];
    /** 表格列结构配置集合 */
    columns: TableColumn[];
    /** 配置化操作列规则（可选，不传时可使用 #action 插槽兼容） */
    actionColumn?: ActionColumnConfig;
    /** 表格加载中状态 */
    loading?: boolean;
    /** 是否带边框，默认 true */
    border?: boolean;
    /** 是否为斑马纹，默认 true */
    stripe?: boolean;
    /** 行数据唯一键名，默认 'id' */
    rowKey?: string;
    /** 是否显示多选勾选框列，默认 false */
    showSelection?: boolean;
    /** 是否显示序号列，默认 false */
    showIndex?: boolean;
    /** 是否显示底部分页器，默认 true */
    showPagination?: boolean;
    /** 操作列默认宽度，默认 180 */
    actionWidth?: number | string;
    /** 分页器元数据对象（page: 当前页，pageSize: 每页条数，total: 总记录数） */
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

/**
 * BaseTable 事件派发器
 */
const emit = defineEmits<{
  /** 多选勾选集变化事件 */
  (e: 'selection-change', selection: any[]): void;
  /** 页码改变事件 */
  (e: 'page-change', page: number): void;
  /** 每页条数改变事件 */
  (e: 'size-change', size: number): void;
}>();

/** 原生 el-table 实例引用 */
const tableRef = ref();

/** 获取 RBAC 权限判断钩子 */
const { hasPermission } = usePermission();

/**
 * 判断操作按钮是否可见
 * 结合用户细粒度按钮权限 perm 和业务动态 show 函数进行双重校验
 *
 * @param btn 按钮配置对象
 * @param row 当前行实体数据
 * @returns 返回是否可见
 */
const isActionVisible = (btn: TableActionItem, row: any): boolean => {
  // 1. 权限拦截 (若配置了 perm 则严格鉴权，无权限直接隐藏)
  if (btn.perm && !hasPermission(btn.perm)) {
    return false;
  }
  // 2. 显隐控制判断 (支持函数与布尔值)
  if (typeof btn.show === 'function') {
    return btn.show(row);
  }
  if (typeof btn.show === 'boolean') {
    return btn.show;
  }
  return true;
};

/**
 * 判断操作按钮是否禁用
 *
 * @param btn 按钮配置对象
 * @param row 当前行实体数据
 * @returns 返回是否禁用
 */
const isActionDisabled = (btn: TableActionItem, row: any): boolean => {
  if (typeof btn.disabled === 'function') {
    return btn.disabled(row);
  }
  return !!btn.disabled;
};

/**
 * 过滤获取当前行可渲染的合法操作按钮清单
 *
 * @param buttons 按钮配置原始数组
 * @param row 当前行数据
 * @returns 经过权限与业务条件过滤后的按钮数组
 */
const getVisibleActions = (buttons: TableActionItem[], row: any): TableActionItem[] => {
  if (!Array.isArray(buttons)) return [];
  return buttons.filter((btn) => isActionVisible(btn, row));
};

/**
 * 处理勾选行变更事件，向父级派发 selection-change
 */
const handleSelectionChange = (selection: any[]) => {
  emit('selection-change', selection);
};

/**
 * 处理当前页码切换事件，向父级派发 page-change
 */
const handleCurrentChange = (val: number) => {
  emit('page-change', val);
};

/**
 * 处理每页显示条数切换事件，向父级派发 size-change
 */
const handleSizeChange = (val: number) => {
  emit('size-change', val);
};

// 暴露底层 el-table 实例给父组件以调用其原生方法 (如 clearSelection、toggleRowSelection 等)
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
