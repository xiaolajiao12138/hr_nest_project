<template>
  <div class="leave-page">
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

      <!-- 请假类型插槽 -->
      <template #typeSlot="{ row }">
        <el-tag
          :type="
            row.leaveType === 'ANNUAL'
              ? 'success'
              : row.leaveType === 'SICK'
                ? 'warning'
                : 'info'
          "
        >
          {{
            row.leaveType === "ANNUAL"
              ? "年假"
              : row.leaveType === "SICK"
                ? "病假"
                : "事假"
          }}
        </el-tag>
      </template>

      <!-- 时间范围插槽 -->
      <template #timeSlot="{ row }">
        <div style="font-size: 12px">
          {{ formatDateTime(row.startTime) }} 至
          {{ formatDateTime(row.endTime) }}
        </div>
      </template>

      <!-- 审批状态插槽 -->
      <template #statusSlot="{ row }">
        <el-tag
          :type="
            row.status === 'APPROVED'
              ? 'success'
              : row.status === 'REJECTED'
                ? 'danger'
                : 'warning'
          "
        >
          {{
            row.status === "APPROVED"
              ? "已通过"
              : row.status === "REJECTED"
                ? "已驳回"
                : "待审批"
          }}
        </el-tag>
      </template>

      <!-- 操作列插槽 -->
      <template #action="{ row }">
        <el-button
          v-if="row.status === 'PENDING'"
          v-hasPerm="['hr:leave:audit']"
          type="primary"
          link
          @click="openAudit(row)"
        >
          审批
        </el-button>
        <span v-else style="color: #909399; font-size: 12px">已归档</span>
      </template>
    </BaseTable>

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
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import { Plus } from "@element-plus/icons-vue";
import { ElMessage, FormInstance } from "element-plus";
import BaseTable, { TableColumn } from "@/components/BaseTable.vue";
import BaseSearch from "@/components/BaseSearch.vue";
import BaseDialog from "@/components/BaseDialog.vue";
import { usePagination } from "@/hooks/usePagination";
import {
  getLeaveListApi,
  applyLeaveApi,
  auditLeaveApi,
  getAnnualBalanceApi,
} from "@/api/leave";
import { getEmployeeListApi } from "@/api/employee";

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
  { prop: "leaveNo", label: "请假单号", slot: "leaveNoSlot", width: 170 },
  { prop: "empName", label: "申请人", width: 110 },
  { prop: "leaveType", label: "请假类型", slot: "typeSlot", width: 100 },
  { prop: "days", label: "天数", width: 90 },
  { prop: "timeRange", label: "请假时间范围", slot: "timeSlot", minWidth: 260 },
  { prop: "reason", label: "事由", minWidth: 150 },
  { prop: "status", label: "审批状态", slot: "statusSlot", width: 110 },
  { prop: "auditRemark", label: "审批批注", width: 140 },
];

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
const currentLeave = ref<any>(null);
const auditForm = reactive({
  action: "APPROVED" as "APPROVED" | "REJECTED",
  auditRemark: "",
});

const fetchData = async () => {
  console.log(pagination);
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

const fetchEmployees = async () => {
  const res: any = await getEmployeeListApi({
    page: 1,
    pageSize: 200,
    status: 1,
  });
  employeeOptions.value = res.list || [];
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

const handleApply = () => {
  applyForm.empId = undefined;
  applyForm.leaveType = "ANNUAL";
  applyForm.timeRange = [];
  applyForm.days = 1.0;
  applyForm.reason = "";
  annualInfo.value = null;
  applyDialogVisible.value = true;
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
    } catch (e) {
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
    } finally {
      submitLoading.value = false;
    }
  });
};

const openAudit = (row: any) => {
  currentLeave.value = row;
  auditForm.action = "APPROVED";
  auditForm.auditRemark = "";
  auditDialogVisible.value = true;
};

const submitAudit = async () => {
  if (!currentLeave.value) return;
  auditLoading.value = true;
  try {
    await auditLeaveApi(currentLeave.value.id, auditForm);
    ElMessage.success("审批处理完成");
    auditDialogVisible.value = false;
    fetchData();
  } finally {
    auditLoading.value = false;
  }
};

const formatDateTime = (val: string) => {
  if (!val) return "";
  return new Date(val).toLocaleString("zh-CN", { hour12: false });
};

onMounted(() => {
  fetchData();
  fetchEmployees();
});
</script>

<style scoped></style>
