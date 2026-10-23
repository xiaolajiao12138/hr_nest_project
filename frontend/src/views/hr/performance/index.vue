<template>
  <div class="performance-page">
    <!-- 顶部 4 维核心 KPI 统计与等级正态分布看板 -->
    <div class="analytics-row">
      <el-card shadow="never" class="metric-card">
        <div class="card-icon" style="background-color: #eff6ff; color: #3b82f6">
          <el-icon><UserFilled /></el-icon>
        </div>
        <div class="card-info">
          <div class="card-title">本期参评总人数</div>
          <div class="card-value">{{ analytics.totalCount }} <span class="unit">人</span></div>
        </div>
      </el-card>

      <el-card shadow="never" class="metric-card">
        <div class="card-icon" style="background-color: #f0fdf4; color: #10b981">
          <el-icon><CircleCheckFilled /></el-icon>
        </div>
        <div class="card-info">
          <div class="card-title">考评完成推进率</div>
          <div class="card-value">{{ analytics.completionRate }} <span class="unit">%</span></div>
        </div>
      </el-card>

      <el-card shadow="never" class="metric-card">
        <div class="card-icon" style="background-color: #fefce8; color: #f59e0b">
          <el-icon><TrendCharts /></el-icon>
        </div>
        <div class="card-info">
          <div class="card-title">团队平均考评得分</div>
          <div class="card-value">{{ analytics.avgScore }} <span class="unit">分</span></div>
        </div>
      </el-card>

      <el-card shadow="never" class="metric-card">
        <div class="card-icon" style="background-color: #fdf2f8; color: #ec4899">
          <el-icon><Trophy /></el-icon>
        </div>
        <div class="card-info">
          <div class="card-title">卓越优秀率 (S/A级)</div>
          <div class="card-value">{{ analytics.excellentRate }} <span class="unit">%</span></div>
        </div>
      </el-card>

      <el-card shadow="never" class="distribution-card">
        <div class="dist-header">
          <span class="dist-title">绩效等级正态分布</span>
          <span class="dist-tip">已完成 {{ analytics.completedCount }} 人</span>
        </div>
        <div class="dist-bar-list">
          <div class="dist-item">
            <span class="rank-name s-rank">S级</span>
            <el-progress
              :percentage="getDistPercent(analytics.distribution?.S)"
              status="exception"
              :stroke-width="8"
              class="progress-bar"
            />
            <span class="rank-num">{{ analytics.distribution?.S || 0 }}人</span>
          </div>
          <div class="dist-item">
            <span class="rank-name a-rank">A级</span>
            <el-progress
              :percentage="getDistPercent(analytics.distribution?.A)"
              status="success"
              :stroke-width="8"
              class="progress-bar"
            />
            <span class="rank-num">{{ analytics.distribution?.A || 0 }}人</span>
          </div>
          <div class="dist-item">
            <span class="rank-name b-rank">B级</span>
            <el-progress
              :percentage="getDistPercent(analytics.distribution?.B)"
              :stroke-width="8"
              class="progress-bar"
            />
            <span class="rank-num">{{ analytics.distribution?.B || 0 }}人</span>
          </div>
          <div class="dist-item">
            <span class="rank-name c-rank">C级</span>
            <el-progress
              :percentage="getDistPercent(analytics.distribution?.C)"
              status="warning"
              :stroke-width="8"
              class="progress-bar"
            />
            <span class="rank-num">{{ analytics.distribution?.C || 0 }}人</span>
          </div>
        </div>
      </el-card>
    </div>

    <!-- 考评业务 Tab 标签页 -->
    <el-tabs v-model="activeTab" class="perf-tabs" @tab-change="handleTabChange">
      <!-- Tab 1: 员工考评明细与闭环评审 -->
      <el-tab-pane label="员工考评明细与闭环评审" name="records">
        <BaseSearch :model="searchForm" @search="handleSearch" @reset="handleReset">
          <el-form-item label="所属方案">
            <el-select
              v-model="searchForm.planId"
              placeholder="选择考评方案"
              style="width: 240px"
              @change="handlePlanSelectChange"
            >
              <el-option
                v-for="p in planList"
                :key="p.id"
                :label="p.title"
                :value="p.id"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="所属部门">
            <el-select
              v-model="searchForm.deptId"
              placeholder="全公司"
              clearable
              style="width: 140px"
            >
              <el-option
                v-for="d in deptList"
                :key="d.id"
                :label="d.deptName"
                :value="d.id"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="评审状态">
            <el-select
              v-model="searchForm.status"
              placeholder="全部状态"
              clearable
              style="width: 130px"
            >
              <el-option label="待员工自评" value="PENDING_SELF" />
              <el-option label="待主管评审" value="PENDING_MANAGER" />
              <el-option label="已完成" value="COMPLETED" />
            </el-select>
          </el-form-item>

          <el-form-item label="评定等级">
            <el-select
              v-model="searchForm.rating"
              placeholder="全部等级"
              clearable
              style="width: 110px"
            >
              <el-option label="S (卓越)" value="S" />
              <el-option label="A (优秀)" value="A" />
              <el-option label="B (良好)" value="B" />
              <el-option label="C (需改进)" value="C" />
              <el-option label="D (不合格)" value="D" />
            </el-select>
          </el-form-item>

          <el-form-item label="关键字">
            <el-input
              v-model="searchForm.keyword"
              placeholder="工号/姓名/岗位"
              clearable
              style="width: 160px"
            />
          </el-form-item>
        </BaseSearch>

        <BaseTable
          :loading="recordLoading"
          :data="recordList"
          :columns="recordColumns"
          :action-column="recordActionColumn"
          :pagination="recordPagination"
          @page-change="handleRecordPageChange"
          @size-change="handleRecordSizeChange"
        >
          <template #toolbar>
            <el-button
              v-hasPerm="['hr:performance:start']"
              type="primary"
              :icon="Plus"
              @click="openLaunchDialog"
            >
              发起本期考评
            </el-button>
            <el-button
              v-hasPerm="['hr:performance:eval']"
              type="success"
              plain
              :icon="Money"
              @click="openSyncSalaryDialog"
            >
              绩效联动发薪
            </el-button>
            <el-button
              v-hasPerm="['hr:performance:export']"
              type="warning"
              plain
              :icon="Download"
              @click="handleExportReport"
            >
              导出考评报表
            </el-button>
          </template>
        </BaseTable>
      </el-tab-pane>

      <!-- Tab 2: 考核方案与指标库配置 -->
      <el-tab-pane label="考核方案与指标库管理" name="plans">
        <div class="plans-tab-content">
          <div class="plans-toolbar">
            <el-button
              v-hasPerm="['hr:performance:plan']"
              type="primary"
              :icon="Plus"
              @click="openCreatePlanDialog"
            >
              新建考核方案
            </el-button>
            <span class="plans-tip">
              定义考核周期、双向自评与主管权重比率及 KPI / OKR 核心指标库
            </span>
          </div>

          <BaseTable
            :loading="planLoading"
            :data="planList"
            :columns="planColumns"
            :action-column="planActionColumn"
            :show-pagination="false"
          />
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 考评评审与打分抽屉 -->
    <EvaluationDrawer ref="evalDrawerRef" @success="handleEvalSuccess" />

    <!-- 新建/编辑考评方案弹窗 -->
    <PlanDialog ref="planDialogRef" @success="handlePlanSuccess" />

    <!-- 发起本期考评对话框 -->
    <el-dialog v-model="launchDialogVisible" title="发起本期全员/部门绩效考评" width="500px">
      <el-form label-width="90px">
        <el-form-item label="考评方案">
          <el-select v-model="launchForm.planId" style="width: 100%">
            <el-option
              v-for="p in planList"
              :key="p.id"
              :label="p.title"
              :value="p.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="参评部门">
          <el-select
            v-model="launchForm.deptIds"
            multiple
            placeholder="默认全公司所有在职员工"
            style="width: 100%"
          >
            <el-option
              v-for="d in deptList"
              :key="d.id"
              :label="d.deptName"
              :value="d.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="launchDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="launchLoading" @click="handleConfirmLaunch">
          立即生成考评任务
        </el-button>
      </template>
    </el-dialog>

    <!-- 绩效联动发薪对话框 -->
    <el-dialog v-model="syncSalaryDialogVisible" title="绩效考评结果联动同步至薪资核算" width="500px">
      <el-alert
        type="info"
        :closable="false"
        title="系统将依据本考核周期已评定的员工绩效等级与系数（S:1.5x, A:1.2x, B:1.0x, C:0.8x），自动调整对应月份薪资记录中的绩效奖金。"
        style="margin-bottom: 16px"
      />
      <el-form label-width="110px">
        <el-form-item label="考核方案">
          <el-input :model-value="currentPlan?.title" disabled />
        </el-form-item>
        <el-form-item label="发薪生效月份">
          <el-date-picker
            v-model="syncSalaryForm.yearMonth"
            type="month"
            value-format="YYYY-MM"
            placeholder="选择发薪月份，如 2026-03"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="syncSalaryDialogVisible = false">取消</el-button>
        <el-button type="success" :loading="syncSalaryLoading" @click="handleConfirmSyncSalary">
          确认联动同步
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, h } from 'vue';
import {
  UserFilled,
  CircleCheckFilled,
  TrendCharts,
  Trophy,
  Plus,
  Money,
  Download,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, ElTag } from 'element-plus';
import BaseTable, { TableColumn, ActionColumnConfig } from '@/components/BaseTable.vue';
import BaseSearch from '@/components/BaseSearch.vue';
import { usePagination } from '@/hooks/usePagination';
import { formatDateTime } from '@/utils/date';
import { getDeptTreeApi } from '@/api/dept';
import {
  getPlanListApi,
  getPerformanceRecordListApi,
  getPerformanceAnalyticsApi,
  launchPerformanceAppraisalApi,
  archivePerformancePlanApi,
  deletePlanApi,
  syncPerformanceToSalaryApi,
  PerformancePlanItem,
  PerformanceRecordItem,
} from '@/api/performance';
import EvaluationDrawer from './components/EvaluationDrawer.vue';
import PlanDialog from './components/PlanDialog.vue';

const activeTab = ref('records');
const evalDrawerRef = ref<InstanceType<typeof EvaluationDrawer>>();
const planDialogRef = ref<InstanceType<typeof PlanDialog>>();

// 基础数据
const planList = ref<PerformancePlanItem[]>([]);
const deptList = ref<any[]>([]);
const planLoading = ref(false);
const recordLoading = ref(false);
const recordList = ref<PerformanceRecordItem[]>([]);

// 统计分析
const analytics = reactive({
  totalCount: 0,
  completedCount: 0,
  completionRate: 0,
  avgScore: 0,
  excellentRate: 0,
  distribution: { S: 0, A: 0, B: 0, C: 0, D: 0 },
});

// 查询表单
const searchForm = reactive({
  planId: undefined as number | undefined,
  deptId: undefined as number | undefined,
  status: '',
  rating: '',
  keyword: '',
});

// 当前选中的方案
const currentPlan = computed(() => {
  return planList.value.find((p) => p.id === searchForm.planId) || planList.value[0];
});

// 员工考评明细分页器
const {
  pagination: recordPagination,
  handlePageChange: handleRecordPageChange,
  handleSizeChange: handleRecordSizeChange,
  resetPage: resetRecordPage,
} = usePagination(() => fetchRecordList());

// 发起考评与薪资联动表单
const launchDialogVisible = ref(false);
const launchLoading = ref(false);
const launchForm = reactive({
  planId: 0,
  deptIds: [] as number[],
});

const syncSalaryDialogVisible = ref(false);
const syncSalaryLoading = ref(false);
const syncSalaryForm = reactive({
  yearMonth: '2026-03',
});

// ----------------- 表格列定义 -----------------
const recordColumns: TableColumn[] = [
  { prop: 'empNo', label: '工号', width: 100 },
  { prop: 'empName', label: '员工姓名', minWidth: 120 },
  { prop: 'deptName', label: '所属部门', minWidth: 120 },
  { prop: 'post', label: '岗位职位', minWidth: 120 },
  {
    prop: 'selfScore',
    label: '自评分数',
    width: 95,
    formatter: (val) => (val !== null && val !== undefined ? `${val}分` : '-'),
  },
  {
    prop: 'managerScore',
    label: '主管评分',
    width: 95,
    formatter: (val) => (val !== null && val !== undefined ? `${val}分` : '-'),
  },
  {
    prop: 'finalScore',
    label: '综合得分',
    width: 105,
    render: ({ row }) =>
      h(
        'span',
        {
          style: {
            fontWeight: '700',
            color: row.finalScore >= 85 ? '#10b981' : row.finalScore >= 70 ? '#3b82f6' : '#f59e0b',
          },
        },
        row.finalScore !== null && row.finalScore !== undefined ? `${row.finalScore} 分` : '-',
      ),
  },
  {
    prop: 'rating',
    label: '绩效等级',
    width: 95,
    render: ({ row }) => {
      if (!row.rating) return h('span', '-');
      const typeMap: Record<string, any> = {
        S: 'danger',
        A: 'success',
        B: 'primary',
        C: 'warning',
        D: 'info',
      };
      return h(
        ElTag,
        { size: 'small', type: typeMap[row.rating] || 'info', effect: 'dark' },
        () => `${row.rating} 级`,
      );
    },
  },
  {
    prop: 'coefficient',
    label: '绩效系数',
    width: 95,
    formatter: (val) => (val ? `${Number(val).toFixed(2)}x` : '1.00x'),
  },
  {
    prop: 'status',
    label: '考评状态',
    width: 115,
    render: ({ row }) => {
      const map: Record<string, { label: string; type: any }> = {
        PENDING_SELF: { label: '待员工自评', type: 'info' },
        PENDING_MANAGER: { label: '待主管考评', type: 'warning' },
        COMPLETED: { label: '已完成评定', type: 'success' },
      };
      const cur = map[row.status] || { label: row.status, type: 'info' };
      return h(ElTag, { size: 'small', type: cur.type }, () => cur.label);
    },
  },
  {
    prop: 'evaluatedAt',
    label: '完成时间',
    width: 175,
    formatter: (val) => formatDateTime(val) || '-',
  },
];

const recordActionColumn: ActionColumnConfig = {
  label: '操作',
  width: 140,
  fixed: 'right',
  buttons: (row) => [
    {
      label: '评审打分',
      type: 'primary',
      onClick: () => evalDrawerRef.value?.open(row, currentPlan.value),
    },
  ],
};

const planColumns: TableColumn[] = [
  { prop: 'title', label: '方案名称', minWidth: 200 },
  {
    prop: 'cycleType',
    label: '周期类型',
    width: 110,
    render: ({ row }) => {
      const map: Record<string, string> = {
        QUARTERLY: '季度考核',
        MONTHLY: '月度考核',
        ANNUAL: '年度考评',
      };
      return h(ElTag, { size: 'small', type: 'info', effect: 'plain' }, () => map[row.cycleType] || row.cycleType);
    },
  },
  {
    prop: 'startDate',
    label: '考核周期区间',
    minWidth: 180,
    formatter: (_, row) => `${row.startDate} ~ ${row.endDate}`,
  },
  {
    prop: 'weightSelf',
    label: '权重配比',
    width: 140,
    formatter: (_, row) => `自评 ${row.weightSelf}% : 主管 ${row.weightManager}%`,
  },
  {
    prop: 'totalEmployees',
    label: '参评人次',
    width: 100,
    formatter: (val) => `${val || 0} 人`,
  },
  {
    prop: 'completionRate',
    label: '完成推进度',
    width: 130,
    render: ({ row }) =>
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
        h(ElTag, { size: 'small', type: row.completionRate === 100 ? 'success' : 'primary' }, () => `${row.completionRate || 0}%`),
        h('span', { style: { fontSize: '12px', color: '#64748b' } }, `(${row.completedCount || 0}/${row.totalEmployees || 0})`),
      ]),
  },
  {
    prop: 'status',
    label: '状态',
    width: 100,
    render: ({ row }) =>
      h(
        ElTag,
        {
          size: 'small',
          type: row.status === 'COMPLETED' ? 'info' : row.status === 'IN_PROGRESS' ? 'success' : 'warning',
        },
        () => (row.status === 'COMPLETED' ? '已归档' : row.status === 'IN_PROGRESS' ? '进行中' : '草稿'),
      ),
  },
];

const planActionColumn: ActionColumnConfig = {
  label: '操作',
  width: 180,
  fixed: 'right',
  buttons: (row) => [
    {
      label: '编辑',
      type: 'primary',
      onClick: () => planDialogRef.value?.open(row),
    },
    {
      label: '归档',
      type: 'warning',
      show: row.status !== 'COMPLETED',
      popconfirm: {
        title: `确定将【${row.title}】归档吗？归档后所有未完结单据将自动完结。`,
      },
      onClick: async () => {
        await archivePerformancePlanApi(row.id);
        ElMessage.success('方案已归档');
        fetchPlanList();
      },
    },
    {
      label: '删除',
      type: 'danger',
      onClick: () => handleDeletePlan(row),
    },
  ],
};

// ----------------- 数据请求 -----------------
const fetchPlanList = async () => {
  planLoading.value = true;
  try {
    const res: any = await getPlanListApi();
    planList.value = res || [];
    if (!searchForm.planId && planList.value.length > 0) {
      searchForm.planId = planList.value[0].id;
    }
  } finally {
    planLoading.value = false;
  }
};

const fetchAnalytics = async () => {
  try {
    const res: any = await getPerformanceAnalyticsApi(searchForm.planId);
    if (res) {
      Object.assign(analytics, res);
    }
  } catch {
    // 忽略异常
  }
};

const fetchRecordList = async () => {
  recordLoading.value = true;
  try {
    const res: any = await getPerformanceRecordListApi({
      planId: searchForm.planId,
      deptId: searchForm.deptId,
      status: searchForm.status,
      rating: searchForm.rating,
      keyword: searchForm.keyword,
      page: recordPagination.page,
      pageSize: recordPagination.pageSize,
    });
    recordList.value = res.list || [];
    recordPagination.total = res.total || 0;
  } finally {
    recordLoading.value = false;
  }
};

const flattenTree = (tree: any[]): any[] => {
  let list: any[] = [];
  tree.forEach((item) => {
    list.push(item);
    if (item.children && item.children.length > 0) {
      list = list.concat(flattenTree(item.children));
    }
  });
  return list;
};

const fetchDepts = async () => {
  try {
    const res: any = await getDeptTreeApi();
    deptList.value = flattenTree(res || []);
  } catch {
    deptList.value = [];
  }
};

const getDistPercent = (val?: number) => {
  if (!val || !analytics.completedCount) return 0;
  return Math.min(100, Math.round((val / analytics.completedCount) * 100));
};

// ----------------- 交互回调 -----------------
const handlePlanSelectChange = () => {
  resetRecordPage();
  fetchAnalytics();
  fetchRecordList();
};

const handleSearch = () => {
  resetRecordPage();
  fetchRecordList();
};

const handleReset = () => {
  searchForm.deptId = undefined;
  searchForm.status = '';
  searchForm.rating = '';
  searchForm.keyword = '';
  resetRecordPage();
  fetchRecordList();
};

const handleTabChange = (tab: string | number) => {
  if (tab === 'records') {
    fetchRecordList();
    fetchAnalytics();
  } else if (tab === 'plans') {
    fetchPlanList();
  }
};

const openCreatePlanDialog = () => {
  planDialogRef.value?.open();
};

const openLaunchDialog = () => {
  if (planList.value.length === 0) {
    ElMessage.warning('请先创建考评方案');
    return;
  }
  launchForm.planId = searchForm.planId || planList.value[0].id;
  launchForm.deptIds = [];
  launchDialogVisible.value = true;
};

const handleConfirmLaunch = async () => {
  if (!launchForm.planId) {
    ElMessage.warning('请选择考评方案');
    return;
  }
  launchLoading.value = true;
  try {
    const res: any = await launchPerformanceAppraisalApi(launchForm);
    ElMessage.success(`发起成功，新增 ${res.createdCount} 条员工待考评单`);
    launchDialogVisible.value = false;
    fetchPlanList();
    fetchAnalytics();
    fetchRecordList();
  } finally {
    launchLoading.value = false;
  }
};

const openSyncSalaryDialog = () => {
  syncSalaryDialogVisible.value = true;
};

const handleConfirmSyncSalary = async () => {
  if (!currentPlan.value) return;
  syncSalaryLoading.value = true;
  try {
    const res: any = await syncPerformanceToSalaryApi({
      planId: currentPlan.value.id,
      yearMonth: syncSalaryForm.yearMonth,
    });
    ElMessage.success(`绩效联动发薪成功！已更新 ${res.updatedCount} 位员工的绩效奖金与实发薪酬`);
    syncSalaryDialogVisible.value = false;
  } finally {
    syncSalaryLoading.value = false;
  }
};

const handleExportReport = () => {
  if (!currentPlan.value) return;
  const url = `/api/hr/performance/export/${currentPlan.value.id}`;
  window.open(url, '_blank');
};

const handleDeletePlan = (row: any) => {
  ElMessageBox.confirm(`确定删除考评方案【${row.title}】吗？`, '警告', {
    type: 'warning',
    confirmButtonText: '确定删除',
    cancelButtonText: '取消',
  }).then(async () => {
    await deletePlanApi(row.id);
    ElMessage.success('方案已删除');
    fetchPlanList();
  });
};

const handlePlanSuccess = () => {
  fetchPlanList();
  fetchAnalytics();
};

const handleEvalSuccess = () => {
  fetchAnalytics();
  fetchRecordList();
  fetchPlanList();
};

onMounted(async () => {
  await fetchDepts();
  await fetchPlanList();
  await fetchAnalytics();
  await fetchRecordList();
});
</script>

<style scoped>
.performance-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.analytics-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr) 1.5fr;
  gap: 16px;
}

.metric-card {
  border-radius: 8px;
  background-color: #fff;
}
.metric-card :deep(.el-card__body) {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
}
.card-icon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}
.card-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.card-title {
  font-size: 13px;
  color: #64748b;
}
.card-value {
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
}
.unit {
  font-size: 13px;
  font-weight: normal;
  color: #94a3b8;
}

.distribution-card {
  border-radius: 8px;
  background-color: #fff;
}
.distribution-card :deep(.el-card__body) {
  padding: 12px 16px;
}
.dist-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.dist-title {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}
.dist-tip {
  font-size: 12px;
  color: #94a3b8;
}
.dist-bar-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dist-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.rank-name {
  width: 24px;
  font-weight: 600;
}
.s-rank { color: #ec4899; }
.a-rank { color: #10b981; }
.b-rank { color: #3b82f6; }
.c-rank { color: #f59e0b; }
.progress-bar {
  flex: 1;
}
.rank-num {
  width: 32px;
  text-align: right;
  color: #64748b;
}

.perf-tabs {
  background-color: #fff;
  border-radius: 8px;
  padding: 12px 16px 20px 16px;
}

.plans-tab-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.plans-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
}
.plans-tip {
  font-size: 13px;
  color: #64748b;
}

@media (max-width: 1400px) {
  .analytics-row {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
