<template>
  <div class="salary-container">
    <!-- 顶部核心薪酬统计指标卡片 -->
    <el-row :gutter="16" class="kpi-cards">
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="kpi-card kpi-gross">
          <div class="kpi-header">
            <span class="kpi-title">{{ t("salary.totalGross") }}</span>
            <el-icon class="kpi-icon"><Money /></el-icon>
          </div>
          <div class="kpi-value">¥ {{ formatMoney(kpiData.totalGross) }}</div>
          <div class="kpi-desc">当月全员应发薪酬计提总额</div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="kpi-card kpi-net">
          <div class="kpi-header">
            <span class="kpi-title">{{ t("salary.totalNet") }}</span>
            <el-icon class="kpi-icon"><Wallet /></el-icon>
          </div>
          <div class="kpi-value">¥ {{ formatMoney(kpiData.totalNet) }}</div>
          <div class="kpi-desc">当月实际发放打卡总净额</div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="kpi-card kpi-deduction">
          <div class="kpi-header">
            <span class="kpi-title">{{ t("salary.totalDeductions") }}</span>
            <el-icon class="kpi-icon"><Coin /></el-icon>
          </div>
          <div class="kpi-value">
            ¥ {{ formatMoney(kpiData.totalDeduction) }}
          </div>
          <div class="kpi-desc">含社保公积金、个税与请假扣减</div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="kpi-card kpi-headcount">
          <div class="kpi-header">
            <span class="kpi-title">{{ t("salary.headcount") }}</span>
            <el-icon class="kpi-icon"><User /></el-icon>
          </div>
          <div class="kpi-value">
            {{ kpiData.totalCount }} <span class="unit">人</span>
          </div>
          <div class="kpi-desc">
            <span class="status-dot draft">草稿: {{ kpiData.draftCount }}</span>
            <span class="status-dot confirmed"
              >核准: {{ kpiData.confirmedCount }}</span
            >
            <span class="status-dot paid">已发: {{ kpiData.paidCount }}</span>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 搜索筛选区 -->
    <BaseSearch :model="searchForm" @search="handleSearch" @reset="handleReset">
      <el-form-item label="薪资月份" prop="yearMonth">
        <el-date-picker
          v-model="searchForm.yearMonth"
          type="month"
          value-format="YYYY-MM"
          placeholder="选择月份"
          clearable
          style="width: 150px"
        />
      </el-form-item>

      <el-form-item label="所属部门" prop="departmentId">
        <el-tree-select
          v-model="searchForm.departmentId"
          :data="deptTree"
          :props="{ label: 'deptName', value: 'id', children: 'children' }"
          check-strictly
          placeholder="全部部门"
          clearable
          style="width: 180px"
        />
      </el-form-item>

      <el-form-item label="发放状态" prop="status">
        <el-select
          v-model="searchForm.status"
          placeholder="全部状态"
          clearable
          style="width: 130px"
        >
          <el-option label="草稿待核" :value="1" />
          <el-option label="已核准" :value="2" />
          <el-option label="已发放" :value="3" />
        </el-select>
      </el-form-item>

      <el-form-item label="员工检索" prop="keyword">
        <el-input
          v-model="searchForm.keyword"
          placeholder="工号 / 员工姓名"
          clearable
          style="width: 170px"
          @keyup.enter="handleSearch"
        />
      </el-form-item>
    </BaseSearch>

    <!-- 表格展示区 -->
    <BaseTable
      :loading="loading"
      :data="tableData"
      :columns="columns"
      :pagination="pagination"
      show-selection
      row-key="id"
      @selection-change="handleSelectionChange"
      @page-change="handlePageChange"
      @size-change="handleSizeChange"
    >
      <!-- 顶部操作工具栏 -->
      <template #toolbar>
        <el-button
          v-hasPerm="['hr:salary:calc']"
          type="primary"
          :icon="Cpu"
          @click="openCalculateDialog"
        >
          {{ t("salary.calculate") }}
        </el-button>

        <el-button
          v-hasPerm="['hr:salary:confirm']"
          type="success"
          :icon="Check"
          :disabled="selectedRows.length === 0"
          @click="handleBatchConfirm(2)"
        >
          批量核准
        </el-button>

        <el-button
          v-hasPerm="['hr:salary:confirm']"
          type="warning"
          :icon="CreditCard"
          :disabled="selectedRows.length === 0"
          @click="handleBatchConfirm(3)"
        >
          批量发薪
        </el-button>

        <el-button
          v-hasPerm="['hr:salary:export']"
          type="info"
          plain
          :icon="Download"
          :loading="exportLoading"
          @click="handleExport"
        >
          {{ t("salary.exportExcel") }}
        </el-button>

        <el-button :icon="Refresh" @click="fetchData">刷新</el-button>
      </template>

      <!-- 员工信息复合插槽 -->
      <template #employeeSlot="{ row }">
        <div class="emp-cell">
          <div class="emp-name">{{ row.employee?.name || "-" }}</div>
          <div class="emp-sub">
            工号:
            {{
              (row.employee as any)?.empNo || row.employee?.employeeNo || "-"
            }}
          </div>
        </div>
      </template>

      <!-- 应发构成明细插槽 -->
      <template #grossSlot="{ row }">
        <el-tooltip placement="top" effect="light">
          <template #content>
            <div class="salary-pop-content">
              <div>基本工资: ¥ {{ formatMoney(row.baseSalary) }}</div>
              <div>岗位津贴: ¥ {{ formatMoney(row.postSalary) }}</div>
              <div>绩效奖金: ¥ {{ formatMoney(row.performanceSalary) }}</div>
              <div>加班补贴: ¥ {{ formatMoney(row.overtimeSalary) }}</div>
              <div>各项津贴: ¥ {{ formatMoney(row.allowance) }}</div>
            </div>
          </template>
          <span class="gross-text">¥ {{ formatMoney(row.grossSalary) }}</span>
        </el-tooltip>
      </template>

      <!-- 扣除明细插槽 -->
      <template #deductionSlot="{ row }">
        <el-tooltip placement="top" effect="light">
          <template #content>
            <div class="salary-pop-content">
              <div>缺勤请假扣减: ¥ {{ formatMoney(row.leaveDeduction) }}</div>
              <div>个人社保(五险): ¥ {{ formatMoney(row.socialSecurity) }}</div>
              <div>住房公积金: ¥ {{ formatMoney(row.housingFund) }}</div>
              <div>预扣预缴个税: ¥ {{ formatMoney(row.tax) }}</div>
            </div>
          </template>
          <span class="deduction-text"
            >- ¥ {{ formatMoney(row.totalDeduction) }}</span
          >
        </el-tooltip>
      </template>

      <!-- 实发薪资插槽 -->
      <template #netSalarySlot="{ row }">
        <span class="net-text">¥ {{ formatMoney(row.netSalary) }}</span>
      </template>

      <!-- 状态插槽 -->
      <template #statusSlot="{ row }">
        <el-tag v-if="row.status === 1" type="info" effect="plain">草稿</el-tag>
        <el-tag v-else-if="row.status === 2" type="warning" effect="plain"
          >已核准</el-tag
        >
        <el-tag v-else-if="row.status === 3" type="success" effect="plain"
          >已发放</el-tag
        >
      </template>

      <!-- 工资条保护状态插槽 -->
      <template #securitySlot="{ row }">
        <el-tag
          v-if="row.hasPassword"
          type="success"
          size="small"
          effect="light"
        >
          <el-icon><Lock /></el-icon> 密码加密
        </el-tag>
        <el-tag v-else type="info" size="small" effect="light">
          免密查阅
        </el-tag>
      </template>

      <!-- 操作列插槽 -->
      <template #action="{ row }">
        <el-button
          v-hasPerm="['hr:salary:edit']"
          link
          type="primary"
          :icon="Edit"
          @click="openEditDialog(row)"
        >
          调整
        </el-button>

        <el-button
          v-if="row.status === 1"
          v-hasPerm="['hr:salary:confirm']"
          link
          type="warning"
          :icon="Check"
          @click="quickChangeStatus(row, 2)"
        >
          核准
        </el-button>

        <el-button
          v-if="row.status === 2"
          v-hasPerm="['hr:salary:confirm']"
          link
          type="success"
          :icon="CreditCard"
          @click="quickChangeStatus(row, 3)"
        >
          发薪
        </el-button>
      </template>
    </BaseTable>

    <!-- 一键智能核算弹窗 -->
    <BaseDialog
      v-model="calcDialogVisible"
      title="一键全员月度薪酬智能核算"
      width="540px"
      :confirm-loading="calcSubmitting"
      @confirm="submitCalculate"
    >
      <el-form :model="calcForm" label-width="110px">
        <el-alert
          type="info"
          :closable="false"
          show-icon
          style="margin-bottom: 20px"
          :title="t('salary.calcTip')"
        />

        <el-form-item label="核算月份" required>
          <el-date-picker
            v-model="calcForm.yearMonth"
            type="month"
            value-format="YYYY-MM"
            placeholder="选择待核算年月"
            style="width: 100%"
          />
        </el-form-item>

        <el-form-item label="覆盖已有记录">
          <el-switch
            v-model="calcForm.overwrite"
            active-text="允许重新计算并覆盖当月已有草稿"
          />
        </el-form-item>
      </el-form>
    </BaseDialog>

    <!-- 薪资明细微调与密码设置弹窗 -->
    <BaseDialog
      v-model="editDialogVisible"
      :title="`调整员工薪酬明细 - ${currentEditing?.employee?.name || ''}`"
      width="680px"
      :confirm-loading="editSubmitting"
      @confirm="submitEdit"
    >
      <el-form
        ref="editFormRef"
        :model="editForm"
        label-width="120px"
        class="edit-salary-form"
      >
        <el-divider content-position="left"
          >应发薪酬收入项 (自动累计应发)</el-divider
        >
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="基本工资">
              <el-input-number
                v-model="editForm.baseSalary"
                :precision="2"
                :step="500"
                :min="0"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="岗位津贴">
              <el-input-number
                v-model="editForm.postSalary"
                :precision="2"
                :step="200"
                :min="0"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="绩效奖金">
              <el-input-number
                v-model="editForm.performanceSalary"
                :precision="2"
                :step="200"
                :min="0"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="加班费">
              <el-input-number
                v-model="editForm.overtimeSalary"
                :precision="2"
                :step="100"
                :min="0"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="各项补贴">
              <el-input-number
                v-model="editForm.allowance"
                :precision="2"
                :step="100"
                :min="0"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">法定五险一金与扣减项</el-divider>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="缺勤扣款">
              <el-input-number
                v-model="editForm.leaveDeduction"
                :precision="2"
                :step="50"
                :min="0"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="个人社保">
              <el-input-number
                v-model="editForm.socialSecurity"
                :precision="2"
                :step="100"
                :min="0"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="住房公积金">
              <el-input-number
                v-model="editForm.housingFund"
                :precision="2"
                :step="100"
                :min="0"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="预扣个税">
              <el-input-number
                v-model="editForm.tax"
                :precision="2"
                :step="50"
                :min="0"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">工资条加密与安全</el-divider>
        <el-form-item label="工资条密码">
          <el-input
            v-model="editForm.payslipPassword"
            type="password"
            show-password
            placeholder="若需开启电子工资条防偷窥独立查看密码，在此输入；留空保持不变"
            clearable
          />
        </el-form-item>

        <el-form-item label="核算备注">
          <el-input
            v-model="editForm.remarks"
            type="textarea"
            :rows="2"
            placeholder="填写调整事由或核算说明"
          />
        </el-form-item>

        <!-- 动态合计实时预览栏 -->
        <div class="live-calc-box">
          <div class="calc-item">
            <span class="label">测效应发总额:</span>
            <span class="value gross">¥ {{ formatMoney(calcLiveGross) }}</span>
          </div>
          <div class="calc-item">
            <span class="label">测算扣除总额:</span>
            <span class="value deduction"
              >- ¥ {{ formatMoney(calcLiveDeduction) }}</span
            >
          </div>
          <div class="calc-item">
            <span class="label">测算实发到手:</span>
            <span class="value net">¥ {{ formatMoney(calcLiveNet) }}</span>
          </div>
        </div>
      </el-form>
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  Money,
  Wallet,
  Coin,
  User,
  Cpu,
  Check,
  CreditCard,
  Download,
  Refresh,
  Lock,
  Edit,
} from "@element-plus/icons-vue";
import { useI18n } from "@/locales";
import BaseSearch from "@/components/BaseSearch.vue";
import BaseTable, { type TableColumn } from "@/components/BaseTable.vue";
import BaseDialog from "@/components/BaseDialog.vue";
import {
  getSalaryListApi,
  calculateSalaryApi,
  updateSalaryApi,
  batchConfirmSalaryApi,
  exportSalaryApi,
  SalaryRecord,
  SalaryKPI,
} from "@/api/salary";
import { getDeptTreeApi } from "@/api/dept";

const { t } = useI18n();

/**
 * 格式化金额为千分位保留两位小数
 */
function formatMoney(num?: number | string): string {
  const n = Number(num || 0);
  return n.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** 获取当月 YYYY-MM */
function getCurrentYearMonth(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

// 页面基础响应式状态
const loading = ref(false);
const exportLoading = ref(false);
const tableData = ref<SalaryRecord[]>([]);
const selectedRows = ref<SalaryRecord[]>([]);
const deptTree = ref<any[]>([]);

// 核心指标汇总状态
const kpiData = reactive<SalaryKPI>({
  totalGross: 0,
  totalNet: 0,
  totalDeduction: 0,
  totalCount: 0,
  draftCount: 0,
  confirmedCount: 0,
  paidCount: 0,
});

// 查询搜索表单
const searchForm = reactive({
  yearMonth: getCurrentYearMonth(),
  departmentId: undefined as number | undefined,
  status: undefined as number | undefined,
  keyword: "",
});

// 分页器
const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0,
});

// 表格列定义
const columns: TableColumn[] = [
  { label: "薪资月份", prop: "yearMonth", width: 110, align: "center" },
  { label: "员工档案", slot: "employeeSlot", minWidth: 150, align: "left" },
  {
    label: "所属部门",
    prop: "departmentName",
    width: 130,
    formatter: (_: any, row: SalaryRecord) =>
      (row.employee as any)?.dept?.deptName ||
      row.employee?.department?.name ||
      "-",
  },
  {
    label: "岗位职位",
    prop: "positionName",
    width: 120,
    formatter: (_: any, row: SalaryRecord) =>
      (row.employee as any)?.post || row.employee?.position?.name || "-",
  },
  { label: "应发薪资", slot: "grossSlot", width: 130, align: "right" },
  { label: "扣除合计", slot: "deductionSlot", width: 130, align: "right" },
  { label: "实发到手", slot: "netSalarySlot", width: 140, align: "right" },
  { label: "发放状态", slot: "statusSlot", width: 100, align: "center" },
  { label: "安全防护", slot: "securitySlot", width: 120, align: "center" },
  { label: "备注说明", prop: "remarks", minWidth: 140, align: "left" },
];

/**
 * 加载薪酬列表与 KPI 数据
 */
async function fetchData() {
  loading.value = true;
  try {
    const res: any = await getSalaryListApi({
      page: pagination.page,
      pageSize: pagination.pageSize,
      yearMonth: searchForm.yearMonth || undefined,
      departmentId: searchForm.departmentId,
      status: searchForm.status,
      keyword: searchForm.keyword.trim() || undefined,
    });

    tableData.value = res.list || [];
    pagination.total = res.total || 0;

    if (res.kpi) {
      Object.assign(kpiData, res.kpi);
    }
  } catch (error) {
    console.error("加载薪酬列表失败:", error);
  } finally {
    loading.value = false;
  }
}

/** 加载部门树 */
async function loadDeptTree() {
  try {
    const res: any = await getDeptTreeApi();
    deptTree.value = res || [];
  } catch (error) {
    console.error("加载部门树失败:", error);
  }
}

// 搜索与重置处理
function handleSearch() {
  pagination.page = 1;
  fetchData();
}

function handleReset() {
  searchForm.yearMonth = getCurrentYearMonth();
  searchForm.departmentId = undefined;
  searchForm.status = undefined;
  searchForm.keyword = "";
  pagination.page = 1;
  fetchData();
}

// 分页联动
function handlePageChange(page: number) {
  pagination.page = page;
  fetchData();
}

function handleSizeChange(size: number) {
  pagination.pageSize = size;
  pagination.page = 1;
  fetchData();
}

// 表格多选行勾选变化
function handleSelectionChange(rows: SalaryRecord[]) {
  selectedRows.value = rows;
}

// 批量确认核准或发放
async function handleBatchConfirm(targetStatus: number) {
  const label = targetStatus === 2 ? "核准" : "发放";
  const ids = selectedRows.value.map((r) => r.id);
  if (!ids.length) return;

  try {
    await ElMessageBox.confirm(
      `确定要将选中的 ${ids.length} 笔薪酬记录流转为【${label}】状态吗？`,
      "批量流转提示",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: targetStatus === 3 ? "warning" : "info",
      },
    );

    await batchConfirmSalaryApi({ ids, targetStatus: targetStatus });
    ElMessage.success(`批量${label}操作成功`);
    fetchData();
  } catch (error) {
    // 用户取消或请求失败
  }
}

// 单笔快捷流转状态
async function quickChangeStatus(row: SalaryRecord, targetStatus: number) {
  const label = targetStatus === 2 ? "核准" : "发放";
  try {
    await ElMessageBox.confirm(
      `确认将员工 ${row.employee?.name || ""} 的薪资置为【${label}】吗？`,
      "状态流转",
      {
        type: targetStatus === 3 ? "warning" : "info",
      },
    );
    await batchConfirmSalaryApi({ ids: [row.id], targetStatus: targetStatus });
    ElMessage.success(`${label}成功`);
    fetchData();
  } catch {
    // 忽略取消
  }
}

// 导出当前月份明细 Excel
async function handleExport() {
  exportLoading.value = true;
  try {
    const month = searchForm.yearMonth || getCurrentYearMonth();
    const res: any = await exportSalaryApi(month);

    const blob = new Blob([res], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `员工薪资明细_${month}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    ElMessage.success("薪资报表导出成功");
  } catch (error) {
    ElMessage.error("导出报表失败");
  } finally {
    exportLoading.value = false;
  }
}

// 一键智能核算弹窗相关
const calcDialogVisible = ref(false);
const calcSubmitting = ref(false);
const calcForm = reactive({
  yearMonth: getCurrentYearMonth(),
  overwrite: true,
});

function openCalculateDialog() {
  calcForm.yearMonth = searchForm.yearMonth || getCurrentYearMonth();
  calcDialogVisible.value = true;
}

async function submitCalculate() {
  if (!calcForm.yearMonth) {
    ElMessage.warning("请选择核算月份");
    return;
  }
  calcSubmitting.value = true;
  try {
    const res: any = await calculateSalaryApi(calcForm);
    ElMessage.success(`核算成功，共计算生成 ${res.count || 0} 笔薪酬记录`);
    calcDialogVisible.value = false;
    searchForm.yearMonth = calcForm.yearMonth;
    fetchData();
  } catch (error: any) {
    ElMessage.error(error?.message || "智能核算异常");
  } finally {
    calcSubmitting.value = false;
  }
}

// 薪资明细微调弹窗相关
const editDialogVisible = ref(false);
const editSubmitting = ref(false);
const currentEditing = ref<SalaryRecord | null>(null);
const editForm = reactive({
  id: 0,
  baseSalary: 0,
  postSalary: 0,
  performanceSalary: 0,
  overtimeSalary: 0,
  allowance: 0,
  leaveDeduction: 0,
  socialSecurity: 0,
  housingFund: 0,
  tax: 0,
  payslipPassword: "",
  remarks: "",
});

function openEditDialog(row: SalaryRecord) {
  currentEditing.value = row;
  editForm.id = row.id;
  editForm.baseSalary = Number(row.baseSalary || 0);
  editForm.postSalary = Number(row.postSalary || 0);
  editForm.performanceSalary = Number(row.performanceSalary || 0);
  editForm.overtimeSalary = Number(row.overtimeSalary || 0);
  editForm.allowance = Number(row.allowance || 0);
  editForm.leaveDeduction = Number(row.leaveDeduction || 0);
  editForm.socialSecurity = Number(row.socialSecurity || 0);
  editForm.housingFund = Number(row.housingFund || 0);
  editForm.tax = Number(row.tax || 0);
  editForm.payslipPassword = "";
  editForm.remarks = row.remarks || "";
  editDialogVisible.value = true;
}

// 动态测算实发金额实时联动
const calcLiveGross = computed(() => {
  return (
    Number(editForm.baseSalary || 0) +
    Number(editForm.postSalary || 0) +
    Number(editForm.performanceSalary || 0) +
    Number(editForm.overtimeSalary || 0) +
    Number(editForm.allowance || 0)
  );
});

const calcLiveDeduction = computed(() => {
  return (
    Number(editForm.leaveDeduction || 0) +
    Number(editForm.socialSecurity || 0) +
    Number(editForm.housingFund || 0) +
    Number(editForm.tax || 0)
  );
});

const calcLiveNet = computed(() => {
  return Math.max(0, calcLiveGross.value - calcLiveDeduction.value);
});

async function submitEdit() {
  if (!editForm.id) return;
  editSubmitting.value = true;
  try {
    await updateSalaryApi(editForm.id, {
      baseSalary: editForm.baseSalary,
      postSalary: editForm.postSalary,
      performanceSalary: editForm.performanceSalary,
      overtimeSalary: editForm.overtimeSalary,
      allowance: editForm.allowance,
      leaveDeduction: editForm.leaveDeduction,
      socialSecurity: editForm.socialSecurity,
      housingFund: editForm.housingFund,
      tax: editForm.tax,
      payslipPassword: editForm.payslipPassword || undefined,
      remarks: editForm.remarks,
    });
    ElMessage.success("薪酬微调保存成功");
    editDialogVisible.value = false;
    fetchData();
  } catch (error: any) {
    ElMessage.error(error?.message || "调整失败");
  } finally {
    editSubmitting.value = false;
  }
}

onMounted(() => {
  loadDeptTree();
  fetchData();
});
</script>

<style scoped lang="scss">
.salary-container {
  padding: 16px;

  .kpi-cards {
    margin-bottom: 16px;

    .kpi-card {
      border-radius: 8px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

      &:hover {
        transform: translateY(-2px);
      }

      .kpi-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;

        .kpi-title {
          font-size: 14px;
          color: var(--el-text-color-secondary);
        }

        .kpi-icon {
          font-size: 20px;
        }
      }

      .kpi-value {
        font-size: 24px;
        font-weight: 700;
        font-family: "Helvetica Neue", Arial, sans-serif;
        line-height: 1.2;
        margin-bottom: 8px;

        .unit {
          font-size: 14px;
          font-weight: normal;
          color: var(--el-text-color-secondary);
          margin-left: 4px;
        }
      }

      .kpi-desc {
        font-size: 12px;
        color: var(--el-text-color-placeholder);
        display: flex;
        gap: 8px;

        .status-dot {
          &.draft {
            color: var(--el-color-info);
          }
          &.confirmed {
            color: var(--el-color-warning);
          }
          &.paid {
            color: var(--el-color-success);
          }
        }
      }

      &.kpi-gross {
        border-top: 3px solid var(--el-color-primary);
        .kpi-icon {
          color: var(--el-color-primary);
        }
      }

      &.kpi-net {
        border-top: 3px solid var(--el-color-success);
        .kpi-icon {
          color: var(--el-color-success);
        }
        .kpi-value {
          color: var(--el-color-success);
        }
      }

      &.kpi-deduction {
        border-top: 3px solid var(--el-color-danger);
        .kpi-icon {
          color: var(--el-color-danger);
        }
      }

      &.kpi-headcount {
        border-top: 3px solid var(--el-color-warning);
        .kpi-icon {
          color: var(--el-color-warning);
        }
      }
    }
  }

  .emp-cell {
    display: flex;
    flex-direction: column;

    .emp-name {
      font-weight: 600;
      color: var(--el-text-color-primary);
    }

    .emp-sub {
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }
  }

  .gross-text {
    font-weight: 500;
    color: var(--el-text-color-regular);
    cursor: pointer;
    border-bottom: 1px dashed var(--el-border-color);
  }

  .deduction-text {
    color: var(--el-color-danger);
    cursor: pointer;
    border-bottom: 1px dashed var(--el-border-color);
  }

  .net-text {
    font-size: 15px;
    font-weight: 700;
    color: var(--el-color-success);
  }

  .salary-pop-content {
    line-height: 1.8;
    font-size: 13px;
  }

  .live-calc-box {
    margin-top: 16px;
    padding: 12px 16px;
    background: var(--el-fill-color-light);
    border-radius: 6px;
    display: flex;
    justify-content: space-around;
    align-items: center;

    .calc-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;

      .label {
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }

      .value {
        font-size: 16px;
        font-weight: 700;

        &.gross {
          color: var(--el-color-primary);
        }
        &.deduction {
          color: var(--el-color-danger);
        }
        &.net {
          color: var(--el-color-success);
          font-size: 18px;
        }
      }
    }
  }
}
</style>
