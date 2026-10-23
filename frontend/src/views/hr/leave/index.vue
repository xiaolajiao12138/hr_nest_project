<template>
  <div class="leave-page">
    <el-tabs v-model="activeTab" class="leave-tabs" @tab-change="handleTabChange">
      <!-- Tab 1: 请假审批单记录 -->
      <el-tab-pane label="请假审批记录" name="leaves">
        <BaseSearch :model="searchForm" @search="handleSearch" @reset="handleReset">
          <el-form-item label="关键字" prop="keyword">
            <el-input
              v-model="searchForm.keyword"
              placeholder="单号/员工姓名/事由"
              clearable
              style="width: 180px"
            />
          </el-form-item>
          <el-form-item label="请假类型" prop="leaveType">
            <el-select
              v-model="searchForm.leaveType"
              placeholder="全部类型"
              clearable
              style="width: 140px"
            >
              <el-option label="年假" value="ANNUAL" />
              <el-option label="病假" value="SICK" />
              <el-option label="事假" value="CASUAL" />
            </el-select>
          </el-form-item>
          <el-form-item label="审批状态" prop="status">
            <el-select
              v-model="searchForm.status"
              placeholder="全部状态"
              clearable
              style="width: 140px"
            >
              <el-option label="待审批" value="PENDING" />
              <el-option label="已通过" value="APPROVED" />
              <el-option label="已驳回" value="REJECTED" />
            </el-select>
          </el-form-item>
        </BaseSearch>

        <BaseTable
          :loading="loading"
          :data="tableData"
          :columns="columns"
          :action-column="actionColumn"
          :pagination="pagination"
          @page-change="handlePageChange"
          @size-change="handleSizeChange"
        >
          <template #toolbar>
            <el-button
              v-hasPerm="['hr:leave:add']"
              type="primary"
              :icon="Plus"
              @click="handleApply"
            >
              请假申请
            </el-button>
          </template>

          <!-- 请假单号插槽 -->
          <template #leaveNoSlot="{ row }">
            <span style="font-family: monospace; font-weight: bold">{{
              row.leaveNo
            }}</span>
          </template>
        </BaseTable>
      </el-tab-pane>

      <!-- Tab 2: 员工年假额度台账 (hr_annual 强事务联动) -->
      <el-tab-pane label="员工年假额度台账" name="annual">
        <BaseSearch :model="annualSearch" @search="handleAnnualSearch" @reset="handleAnnualReset">
          <el-form-item label="核算年度">
            <el-date-picker
              v-model="annualYearStr"
              type="year"
              placeholder="选择年度"
              value-format="YYYY"
              style="width: 130px"
              @change="handleAnnualYearChange"
            />
          </el-form-item>
          <el-form-item label="所属部门">
            <el-select
              v-model="annualSearch.deptId"
              placeholder="全部部门"
              clearable
              style="width: 150px"
            >
              <el-option
                v-for="d in deptOptions"
                :key="d.id"
                :label="d.deptName"
                :value="d.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="关键字">
            <el-input
              v-model="annualSearch.keyword"
              placeholder="工号/姓名/岗位"
              clearable
              style="width: 170px"
            />
          </el-form-item>
        </BaseSearch>

        <BaseTable
          :loading="annualLoading"
          :data="annualTableData"
          :columns="annualColumns"
          :action-column="annualActionColumn"
          :pagination="annualPagination"
          @page-change="handleAnnualPageChange"
          @size-change="handleAnnualSizeChange"
        >
          <template #toolbar>
            <el-button
              v-hasPerm="['hr:leave:audit']"
              type="success"
              plain
              :icon="Calendar"
              @click="openInitAnnualDialog"
            >
              全员年度额度批量开户/初始化
            </el-button>
            <span class="annual-toolbar-tip">
              数据源自 <code>hr_annual</code> 强事务表：申请年假时悲观排他锁扣减，审批驳回时原路返还
            </span>
          </template>
        </BaseTable>
      </el-tab-pane>
    </el-tabs>

    <!-- 请假申请弹窗 -->
    <BaseDialog
      v-model="applyDialogVisible"
      title="发起请假申请 (强事务控制)"
      width="600px"
      :confirm-loading="submitLoading"
      @confirm="submitApply"
    >
      <el-form
        ref="applyFormRef"
        :model="applyForm"
        :rules="applyRules"
        label-width="100px"
      >
        <el-form-item label="申请员工" prop="empId">
          <el-select
            v-model="applyForm.empId"
            placeholder="请选择员工"
            filterable
            style="width: 100%"
            @change="handleEmpChange"
          >
            <el-option
              v-for="item in employeeOptions"
              :key="item.id"
              :label="`${item.name} (${item.empNo} - ${item.dept?.deptName || '无部门'})`"
              :value="item.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="请假类型" prop="leaveType">
          <el-radio-group
            v-model="applyForm.leaveType"
            @change="checkAnnualBalance"
          >
            <el-radio label="ANNUAL">带薪年假</el-radio>
            <el-radio label="SICK">病假</el-radio>
            <el-radio label="CASUAL">事假</el-radio>
          </el-radio-group>
        </el-form-item>

        <!-- 年假余额提醒卡片 -->
        <el-form-item v-if="applyForm.leaveType === 'ANNUAL' && annualInfo">
          <el-alert
            type="info"
            :closable="false"
            show-icon
            :title="`该员工当前年度总年假: ${annualInfo.totalDays}天，已使用: ${annualInfo.usedDays}天，剩余可用: ${annualInfo.remainDays}天`"
          />
        </el-form-item>

        <el-form-item label="起止时间" prop="timeRange">
          <el-date-picker
            v-model="applyForm.timeRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 100%"
            @change="calcDays"
          />
        </el-form-item>

        <el-form-item label="请假天数" prop="days">
          <el-input-number
            v-model="applyForm.days"
            :min="0.5"
            :step="0.5"
            :precision="1"
          />
          <span style="margin-left: 8px; color: #909399">天</span>
        </el-form-item>

        <el-form-item label="请假事由" prop="reason">
          <el-input
            v-model="applyForm.reason"
            type="textarea"
            :rows="3"
            placeholder="请输入请假事由"
          />
        </el-form-item>
      </el-form>
    </BaseDialog>

    <!-- 审批弹窗 -->
    <BaseDialog
      v-model="auditDialogVisible"
      title="审批请假单"
      width="500px"
      :confirm-loading="auditLoading"
      @confirm="submitAudit"
    >
      <div v-loading="detailLoading">
        <div
          v-if="currentLeave"
          style="margin-bottom: 16px; font-size: 13px; color: #606266"
        >
          <p><strong>申请人：</strong>{{ currentLeave.empName }}</p>
          <p>
            <strong>请假天数：</strong>{{ currentLeave.days }} 天 ({{
              currentLeave.leaveType === "ANNUAL"
                ? "年假"
                : currentLeave.leaveType === "SICK"
                  ? "病假"
                  : "事假"
            }})
          </p>
          <p><strong>请假事由：</strong>{{ currentLeave.reason }}</p>
        </div>

        <el-form :model="auditForm" label-width="90px">
          <el-form-item label="审批结果">
            <el-radio-group v-model="auditForm.action">
              <el-radio label="APPROVED">通过</el-radio>
              <el-radio label="REJECTED">驳回</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="审批意见">
            <el-input
              v-model="auditForm.auditRemark"
              type="textarea"
              :rows="3"
              placeholder="请输入审批批注意见"
            />
          </el-form-item>
        </el-form>
      </div>
    </BaseDialog>

    <!-- 微调年假额度弹窗 -->
    <el-dialog v-model="adjustDialogVisible" title="微调员工年假额度" width="500px">
      <el-form label-width="110px">
        <el-form-item label="员工信息">
          <el-input :model-value="`${currentAdjustRow?.empName} (${currentAdjustRow?.empNo})`" disabled />
        </el-form-item>
        <el-form-item label="核算年份">
          <el-input :model-value="`${currentAdjustRow?.year} 年度`" disabled />
        </el-form-item>
        <el-form-item label="已使用年假">
          <el-tag type="info">{{ currentAdjustRow?.usedDays }} 天</el-tag>
        </el-form-item>
        <el-form-item label="总年假天数">
          <el-input-number
            v-model="adjustForm.totalDays"
            :min="0"
            :step="0.5"
            :precision="1"
            style="width: 150px"
          />
          <span style="margin-left: 8px; color: #64748b">天</span>
        </el-form-item>
        <el-form-item label="调整后剩余">
          <span style="font-weight: 700; color: #10b981; font-size: 15px">
            {{ previewRemainDays }} 天
          </span>
        </el-form-item>
        <el-form-item label="调整原因备注">
          <el-input
            v-model="adjustForm.remark"
            type="textarea"
            :rows="2"
            placeholder="例如: 员工工龄增加折算 +2 天，或年度结转"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adjustDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="adjustLoading" @click="handleConfirmAdjust">
          确认调整
        </el-button>
      </template>
    </el-dialog>

    <!-- 批量全员开户初始化年假对话框 -->
    <el-dialog v-model="initYearDialogVisible" title="批量为在职员工开辟年度年假账户" width="480px">
      <el-alert
        type="info"
        :closable="false"
        title="系统将检索全公司所有正常在职员工，若在所选年份尚未开立年假账户，则自动按基准天数批量完成开户。"
        style="margin-bottom: 16px"
      />
      <el-form label-width="110px">
        <el-form-item label="核算年份">
          <el-input-number v-model="initYearForm.year" :min="2020" :max="2099" style="width: 150px" />
        </el-form-item>
        <el-form-item label="默认基准天数">
          <el-input-number
            v-model="initYearForm.defaultDays"
            :min="1"
            :step="0.5"
            :precision="1"
            style="width: 150px"
          />
          <span style="margin-left: 8px; color: #64748b">天 / 人</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="initYearDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="initYearLoading" @click="handleConfirmInitYear">
          确认批量开户
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, h } from "vue";
import { Plus, Calendar } from "@element-plus/icons-vue";
import { ElMessage, FormInstance, ElTag } from "element-plus";
import BaseTable, { TableColumn, ActionColumnConfig } from "@/components/BaseTable.vue";
import BaseSearch from "@/components/BaseSearch.vue";
import BaseDialog from "@/components/BaseDialog.vue";
import { usePagination } from "@/hooks/usePagination";
import { formatDateTime } from "@/utils/date";
import {
  getLeaveListApi,
  getLeaveDetailApi,
  applyLeaveApi,
  auditLeaveApi,
  getAnnualBalanceApi,
  getAnnualLeaveListApi,
  adjustAnnualLeaveApi,
  initAnnualLeaveForYearApi,
} from "@/api/leave";
import { getEmployeeListApi } from "@/api/employee";
import { getDeptTreeApi } from "@/api/dept";

const activeTab = ref("leaves");

// ------------------- 请假记录列表状态 -------------------
const loading = ref(false);
const tableData = ref<any[]>([]);
const employeeOptions = ref<any[]>([]);

const searchForm = reactive({
  keyword: "",
  leaveType: undefined,
  status: undefined,
});

const { pagination, handlePageChange, handleSizeChange, resetPage } =
  usePagination(() => fetchData());

const columns: TableColumn[] = [
  { prop: "leaveNo", label: "请假单号", slot: "leaveNoSlot", minWidth: 160 },
  { prop: "empName", label: "申请人", width: 110 },
  {
    prop: "leaveType",
    label: "请假类型",
    width: 100,
    render: ({ row }) =>
      h(
        ElTag,
        {
          type:
            row.leaveType === "ANNUAL"
              ? "success"
              : row.leaveType === "SICK"
                ? "warning"
                : "info",
        },
        () =>
          row.leaveType === "ANNUAL"
            ? "年假"
            : row.leaveType === "SICK"
              ? "病假"
              : "事假",
      ),
  },
  { prop: "days", label: "天数", width: 90 },
  {
    prop: "timeRange",
    label: "请假时间范围",
    minWidth: 260,
    render: ({ row }) =>
      h(
        "div",
        { style: "font-size: 12px" },
        `${formatDateTime(row.startTime)} 至 ${formatDateTime(row.endTime)}`,
      ),
  },
  { prop: "reason", label: "事由", minWidth: 150 },
  {
    prop: "status",
    label: "审批状态",
    width: 110,
    render: ({ row }) =>
      h(
        ElTag,
        {
          type:
            row.status === "APPROVED"
              ? "success"
              : row.status === "REJECTED"
                ? "danger"
                : "warning",
        },
        () =>
          row.status === "APPROVED"
            ? "已通过"
            : row.status === "REJECTED"
              ? "已驳回"
              : "待审批",
      ),
  },
  { prop: "auditRemark", label: "审批批注", minWidth: 140 },
];

const actionColumn: ActionColumnConfig = {
  label: "操作",
  width: 120,
  fixed: "right",
  buttons: (row) => [
    {
      label: "审批",
      type: "primary",
      perm: ["hr:leave:audit"],
      show: row.status === "PENDING",
      onClick: () => openAudit(row),
    },
  ],
};

const applyDialogVisible = ref(false);
const submitLoading = ref(false);
const applyFormRef = ref<FormInstance>();
const annualInfo = ref<any>(null);

const applyForm = reactive({
  empId: undefined as number | undefined,
  leaveType: "ANNUAL",
  timeRange: [] as string[],
  days: 1.0,
  reason: "",
});

const applyRules = {
  empId: [{ required: true, message: "请选择申请员工", trigger: "change" }],
  timeRange: [{ required: true, message: "请选择起止时间", trigger: "change" }],
  days: [{ required: true, message: "请输入请假天数", trigger: "blur" }],
  reason: [{ required: true, message: "请输入请假事由", trigger: "blur" }],
};

const auditDialogVisible = ref(false);
const auditLoading = ref(false);
const detailLoading = ref(false);
const currentLeave = ref<any>(null);
const auditForm = reactive({
  action: "APPROVED" as "APPROVED" | "REJECTED",
  auditRemark: "",
});

// ------------------- 年假额度台账状态 -------------------
const annualLoading = ref(false);
const annualTableData = ref<any[]>([]);
const deptOptions = ref<any[]>([]);
const annualYearStr = ref(String(new Date().getFullYear()));

const annualSearch = reactive({
  year: new Date().getFullYear(),
  deptId: undefined as number | undefined,
  keyword: "",
});

const {
  pagination: annualPagination,
  handlePageChange: handleAnnualPageChange,
  handleSizeChange: handleAnnualSizeChange,
  resetPage: resetAnnualPage,
} = usePagination(() => fetchAnnualData());

const annualColumns: TableColumn[] = [
  { prop: "empNo", label: "员工工号", width: 110 },
  { prop: "empName", label: "员工姓名", minWidth: 120 },
  { prop: "deptName", label: "所属部门", minWidth: 130 },
  { prop: "post", label: "岗位职务", minWidth: 120 },
  { prop: "year", label: "年度", width: 85, formatter: (val) => `${val}年` },
  {
    prop: "totalDays",
    label: "总年假额度",
    width: 110,
    formatter: (val) => `${Number(val || 0).toFixed(1)} 天`,
  },
  {
    prop: "usedDays",
    label: "已休年假",
    width: 100,
    formatter: (val) => `${Number(val || 0).toFixed(1)} 天`,
  },
  {
    prop: "remainDays",
    label: "剩余可用",
    width: 110,
    render: ({ row }) =>
      h(
        "span",
        { style: "font-weight: 700; color: #10b981; font-size: 14px" },
        `${Number(row.remainDays || 0).toFixed(1)} 天`,
      ),
  },
  { prop: "remark", label: "备注/调整说明", minWidth: 160 },
  {
    prop: "updatedAt",
    label: "最后变动时间",
    width: 175,
    formatter: (val) => formatDateTime(val) || "-",
  },
];

const annualActionColumn: ActionColumnConfig = {
  label: "操作",
  width: 110,
  fixed: "right",
  buttons: (row) => [
    {
      label: "微调额度",
      type: "primary",
      perm: ["hr:leave:audit"],
      onClick: () => openAdjustDialog(row),
    },
  ],
};

// 微调年假额度状态
const adjustDialogVisible = ref(false);
const adjustLoading = ref(false);
const currentAdjustRow = ref<any>(null);
const adjustForm = reactive({
  id: 0,
  totalDays: 5.0,
  remark: "",
});

const previewRemainDays = computed(() => {
  if (!currentAdjustRow.value) return 0;
  const used = Number(currentAdjustRow.value.usedDays || 0);
  return Number(Math.max(0, adjustForm.totalDays - used).toFixed(1));
});

// 批量开户初始化年假状态
const initYearDialogVisible = ref(false);
const initYearLoading = ref(false);
const initYearForm = reactive({
  year: new Date().getFullYear(),
  defaultDays: 5.0,
});

// ------------------- 数据获取与逻辑处理 -------------------
const fetchData = async () => {
  loading.value = true;
  try {
    const params = {
      ...searchForm,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
    const res: any = await getLeaveListApi(params);
    tableData.value = res.list || [];
    pagination.total = res.total || 0;
  } finally {
    loading.value = false;
  }
};

const fetchAnnualData = async () => {
  annualLoading.value = true;
  try {
    const params = {
      year: annualSearch.year,
      deptId: annualSearch.deptId,
      keyword: annualSearch.keyword,
      page: annualPagination.page,
      pageSize: annualPagination.pageSize,
    };
    const res: any = await getAnnualLeaveListApi(params);
    annualTableData.value = res.list || [];
    annualPagination.total = res.total || 0;
  } finally {
    annualLoading.value = false;
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

const loadDepts = async () => {
  try {
    const res: any = await getDeptTreeApi();
    deptOptions.value = flattenTree(res || []);
  } catch {
    deptOptions.value = [];
  }
};

const fetchEmployees = async () => {
  const res: any = await getEmployeeListApi({
    page: 1,
    pageSize: 100,
    status: 1,
  });
  employeeOptions.value = res.list || [];
};

const handleTabChange = (tab: string | number) => {
  if (tab === "leaves") {
    fetchData();
  } else if (tab === "annual") {
    loadDepts();
    fetchAnnualData();
  }
};

const handleSearch = () => {
  resetPage();
  fetchData();
};

const handleReset = () => {
  searchForm.keyword = "";
  searchForm.leaveType = undefined;
  searchForm.status = undefined;
  resetPage();
  fetchData();
};

const handleAnnualSearch = () => {
  resetAnnualPage();
  fetchAnnualData();
};

const handleAnnualReset = () => {
  annualSearch.deptId = undefined;
  annualSearch.keyword = "";
  annualSearch.year = new Date().getFullYear();
  annualYearStr.value = String(annualSearch.year);
  resetAnnualPage();
  fetchAnnualData();
};

const handleAnnualYearChange = (val: string) => {
  annualSearch.year = val ? parseInt(val, 10) : new Date().getFullYear();
  handleAnnualSearch();
};

const handleApply = async () => {
  applyForm.empId = undefined;
  applyForm.leaveType = "ANNUAL";
  applyForm.timeRange = [];
  applyForm.days = 1.0;
  applyForm.reason = "";
  annualInfo.value = null;
  applyDialogVisible.value = true;

  if (employeeOptions.value.length === 0) {
    await fetchEmployees();
  }
};

const handleEmpChange = async () => {
  if (applyForm.leaveType === "ANNUAL" && applyForm.empId) {
    checkAnnualBalance();
  }
};

const checkAnnualBalance = async () => {
  if (applyForm.leaveType === "ANNUAL" && applyForm.empId) {
    try {
      const res: any = await getAnnualBalanceApi(applyForm.empId);
      annualInfo.value = res;
    } catch {
      annualInfo.value = null;
    }
  } else {
    annualInfo.value = null;
  }
};

const calcDays = () => {
  if (applyForm.timeRange && applyForm.timeRange.length === 2) {
    const start = new Date(applyForm.timeRange[0]).getTime();
    const end = new Date(applyForm.timeRange[1]).getTime();
    const diff = (end - start) / (1000 * 60 * 60 * 24);
    applyForm.days = Math.max(0.5, parseFloat(diff.toFixed(1)));
  }
};

const submitApply = async () => {
  if (!applyFormRef.value) return;
  await applyFormRef.value.validate(async (valid) => {
    if (!valid) return;
    submitLoading.value = true;
    try {
      await applyLeaveApi({
        empId: applyForm.empId,
        leaveType: applyForm.leaveType,
        startTime: applyForm.timeRange[0],
        endTime: applyForm.timeRange[1],
        days: applyForm.days,
        reason: applyForm.reason,
      });
      ElMessage.success("请假单提交成功，若为年假已原子化预扣减年假额度");
      applyDialogVisible.value = false;
      fetchData();
      if (activeTab.value === "annual") {
        fetchAnnualData();
      }
    } finally {
      submitLoading.value = false;
    }
  });
};

const openAudit = async (row: any) => {
  currentLeave.value = null;
  auditForm.action = "APPROVED";
  auditForm.auditRemark = "";
  auditDialogVisible.value = true;
  detailLoading.value = true;

  try {
    const res: any = await getLeaveDetailApi(row.id);
    currentLeave.value = res;
  } catch (error: any) {
    ElMessage.error(error?.message || "获取请假单详情失败");
    auditDialogVisible.value = false;
  } finally {
    detailLoading.value = false;
  }
};

const submitAudit = async () => {
  if (!currentLeave.value) return;
  auditLoading.value = true;
  try {
    await auditLeaveApi({
      id: currentLeave.value.id,
      action: auditForm.action,
      auditRemark: auditForm.auditRemark,
    });
    ElMessage.success("审批处理完成");
    auditDialogVisible.value = false;
    fetchData();
    if (activeTab.value === "annual") {
      fetchAnnualData();
    }
  } finally {
    auditLoading.value = false;
  }
};

// ------------------- 年假微调与开户处理 -------------------
const openAdjustDialog = (row: any) => {
  currentAdjustRow.value = row;
  adjustForm.id = row.id;
  adjustForm.totalDays = Number(row.totalDays);
  adjustForm.remark = row.remark || "";
  adjustDialogVisible.value = true;
};

const handleConfirmAdjust = async () => {
  if (!currentAdjustRow.value) return;
  adjustLoading.value = true;
  try {
    await adjustAnnualLeaveApi({
      id: adjustForm.id,
      totalDays: adjustForm.totalDays,
      remark: adjustForm.remark,
    });
    ElMessage.success(`员工【${currentAdjustRow.value.empName}】年假额度已成功调整`);
    adjustDialogVisible.value = false;
    fetchAnnualData();
  } finally {
    adjustLoading.value = false;
  }
};

const openInitAnnualDialog = () => {
  initYearForm.year = annualSearch.year;
  initYearForm.defaultDays = 5.0;
  initYearDialogVisible.value = true;
};

const handleConfirmInitYear = async () => {
  initYearLoading.value = true;
  try {
    const res: any = await initAnnualLeaveForYearApi({
      year: initYearForm.year,
      defaultDays: initYearForm.defaultDays,
    });
    ElMessage.success(`开户完成：本次为 ${res.createdCount} 位新员工初始化了 ${initYearForm.year} 年假账户`);
    initYearDialogVisible.value = false;
    fetchAnnualData();
  } finally {
    initYearLoading.value = false;
  }
};

onMounted(() => {
  fetchData();
});
</script>

<style scoped>
.leave-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.leave-tabs {
  background-color: #fff;
  border-radius: 8px;
  padding: 12px 16px 20px 16px;
}
.annual-toolbar-tip {
  font-size: 13px;
  color: #64748b;
  margin-left: 12px;
}
.annual-toolbar-tip code {
  background-color: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
  color: #0f172a;
}
</style>
