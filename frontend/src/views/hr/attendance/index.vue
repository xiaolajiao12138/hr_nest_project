<template>
  <div class="attendance-container">
    <!-- 顶部在线打卡与核心出勤 KPI 看板 -->
    <el-row :gutter="16" class="top-row">
      <!-- 个人快捷打卡卡片 -->
      <el-col :xs="24" :sm="24" :md="8">
        <el-card shadow="hover" class="clock-card">
          <div class="clock-header">
            <span class="clock-title">{{ t('attendance.quickClock') }}</span>
            <span class="clock-date">{{ todayInfo?.today || currentDateStr }}</span>
          </div>
          <div class="clock-time">{{ liveTimeStr }}</div>
          <div class="clock-user">
            <span>{{ todayInfo?.employee?.name || '当前员工' }}</span>
            <span class="split">|</span>
            <span>工号: {{ todayInfo?.employee?.empNo || '-' }}</span>
            <span class="split">|</span>
            <span>{{ todayInfo?.employee?.deptName || '部门' }}</span>
          </div>

          <div class="clock-actions">
            <el-button
              type="primary"
              size="large"
              round
              class="clock-btn check-in"
              :loading="clockLoading"
              @click="handleClock('CHECK_IN')"
            >
              {{ t('attendance.checkIn') }}
              <span v-if="todayRecord?.checkInTime" class="clock-sub">
                已打卡 ({{ formatTime(todayRecord.checkInTime) }})
              </span>
            </el-button>

            <el-button
              type="success"
              size="large"
              round
              class="clock-btn check-out"
              :loading="clockLoading"
              @click="handleClock('CHECK_OUT')"
            >
              {{ t('attendance.checkOut') }}
              <span v-if="todayRecord?.checkOutTime" class="clock-sub">
                已打卡 ({{ formatTime(todayRecord.checkOutTime) }})
              </span>
            </el-button>
          </div>
        </el-card>
      </el-col>

      <!-- 全员月度考勤统计指标 -->
      <el-col :xs="24" :sm="24" :md="16">
        <el-row :gutter="12" class="kpi-cards">
          <el-col :xs="12" :sm="6">
            <el-card shadow="hover" class="kpi-card kpi-rate">
              <div class="kpi-title">{{ t('attendance.totalRate') }}</div>
              <div class="kpi-val">{{ kpiData.attendanceRate }} <span class="unit">%</span></div>
              <div class="kpi-desc">当期综合出勤合规率</div>
            </el-card>
          </el-col>

          <el-col :xs="12" :sm="6">
            <el-card shadow="hover" class="kpi-card kpi-normal">
              <div class="kpi-title">{{ t('attendance.normalCount') }}</div>
              <div class="kpi-val normal">{{ kpiData.normalCount }} <span class="unit">人天</span></div>
              <div class="kpi-desc">标准准时打卡出勤</div>
            </el-card>
          </el-col>

          <el-col :xs="12" :sm="6">
            <el-card shadow="hover" class="kpi-card kpi-warning">
              <div class="kpi-title">迟到 / 早退</div>
              <div class="kpi-val warning">
                {{ kpiData.lateCount }} / {{ kpiData.earlyCount }}
                <span class="unit">次</span>
              </div>
              <div class="kpi-desc">超出弹性容差范围</div>
            </el-card>
          </el-col>

          <el-col :xs="12" :sm="6">
            <el-card shadow="hover" class="kpi-card kpi-danger">
              <div class="kpi-title">{{ t('attendance.absentCount') }}</div>
              <div class="kpi-val danger">{{ kpiData.absentCount }} <span class="unit">人天</span></div>
              <div class="kpi-desc">缺勤、旷工与未打卡</div>
            </el-card>
          </el-col>
        </el-row>
      </el-col>
    </el-row>

    <!-- 主工作区 Tabs -->
    <el-card shadow="never" class="main-tabs-card">
      <el-tabs v-model="activeTab" @tab-change="handleTabChange">
        <!-- Tab 1: 考勤明细监控 -->
        <el-tab-pane :label="t('attendance.tabRecords')" name="records">
          <BaseSearch :model="searchForm" @search="handleSearch" @reset="handleReset">
            <el-form-item label="考勤月份" prop="yearMonth">
              <el-date-picker
                v-model="searchForm.yearMonth"
                type="month"
                value-format="YYYY-MM"
                placeholder="选择月份"
                clearable
                style="width: 140px"
              />
            </el-form-item>

            <el-form-item label="具体日期" prop="date">
              <el-date-picker
                v-model="searchForm.date"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="选择日期"
                clearable
                style="width: 140px"
              />
            </el-form-item>

            <el-form-item label="所属部门" prop="deptId">
              <el-tree-select
                v-model="searchForm.deptId"
                :data="deptTree"
                :props="{ label: 'deptName', value: 'id', children: 'children' }"
                check-strictly
                placeholder="全部部门"
                clearable
                style="width: 160px"
              />
            </el-form-item>

            <el-form-item label="综合状态" prop="status">
              <el-select
                v-model="searchForm.status"
                placeholder="全部状态"
                clearable
                style="width: 120px"
              >
                <el-option label="正常出勤" :value="1" />
                <el-option label="迟到" :value="2" />
                <el-option label="早退" :value="3" />
                <el-option label="旷工/严重缺卡" :value="4" />
                <el-option label="请假中" :value="5" />
                <el-option label="休息" :value="6" />
              </el-select>
            </el-form-item>

            <el-form-item label="员工检索" prop="keyword">
              <el-input
                v-model="searchForm.keyword"
                placeholder="工号 / 员工姓名"
                clearable
                style="width: 160px"
                @keyup.enter="handleSearch"
              />
            </el-form-item>
          </BaseSearch>

          <BaseTable
            :loading="recordLoading"
            :data="recordList"
            :columns="recordColumns"
            :pagination="recordPagination"
            row-key="id"
            @page-change="handleRecordPageChange"
            @size-change="handleRecordSizeChange"
          >
            <!-- 工具栏 -->
            <template #toolbar>
              <el-button :icon="Refresh" @click="fetchRecordList">刷新数据</el-button>
            </template>

            <!-- 员工档案插槽 -->
            <template #employeeSlot="{ row }">
              <div class="emp-cell">
                <div class="emp-name">{{ row.employee?.name || '-' }}</div>
                <div class="emp-sub">工号: {{ row.employee?.empNo || '-' }}</div>
              </div>
            </template>

            <!-- 上班打卡插槽 -->
            <template #checkInSlot="{ row }">
              <div class="check-time-box">
                <span class="time">{{ formatTime(row.checkInTime) }}</span>
                <el-tag
                  v-if="row.checkInStatus === 1"
                  size="small"
                  type="success"
                  effect="light"
                >
                  正常
                </el-tag>
                <el-tag
                  v-else-if="row.checkInStatus === 2"
                  size="small"
                  type="warning"
                  effect="light"
                >
                  迟到
                </el-tag>
                <el-tag v-else size="small" type="info" effect="plain">缺卡</el-tag>
              </div>
            </template>

            <!-- 下班打卡插槽 -->
            <template #checkOutSlot="{ row }">
              <div class="check-time-box">
                <span class="time">{{ formatTime(row.checkOutTime) }}</span>
                <el-tag
                  v-if="row.checkOutStatus === 1"
                  size="small"
                  type="success"
                  effect="light"
                >
                  正常
                </el-tag>
                <el-tag
                  v-else-if="row.checkOutStatus === 2"
                  size="small"
                  type="warning"
                  effect="light"
                >
                  早退
                </el-tag>
                <el-tag v-else size="small" type="info" effect="plain">缺卡</el-tag>
              </div>
            </template>

            <!-- 全天综合状态插槽 -->
            <template #statusSlot="{ row }">
              <el-tag v-if="row.status === 1" type="success" effect="plain">正常出勤</el-tag>
              <el-tag v-else-if="row.status === 2" type="warning" effect="plain">迟到</el-tag>
              <el-tag v-else-if="row.status === 3" type="warning" effect="plain">早退</el-tag>
              <el-tag v-else-if="row.status === 4" type="danger" effect="plain">旷工缺卡</el-tag>
              <el-tag v-else-if="row.status === 5" type="info" effect="plain">请假中</el-tag>
              <el-tag v-else-if="row.status === 6" type="info" effect="light">排休</el-tag>
            </template>

            <!-- 操作列插槽 -->
            <template #action="{ row }">
              <el-button
                v-hasPerm="['hr:attendance:repair']"
                link
                type="primary"
                :icon="Edit"
                @click="openRepairDialog(row)"
              >
                补卡修正
              </el-button>
            </template>
          </BaseTable>
        </el-tab-pane>

        <!-- Tab 2: 月度排班日历 -->
        <el-tab-pane :label="t('attendance.tabSchedule')" name="schedule">
          <div class="schedule-toolbar">
            <div class="filter-group">
              <el-date-picker
                v-model="scheduleMonth"
                type="month"
                value-format="YYYY-MM"
                placeholder="排班月份"
                style="width: 150px"
                @change="fetchScheduleData"
              />
              <el-tree-select
                v-model="scheduleDeptId"
                :data="deptTree"
                :props="{ label: 'deptName', value: 'id', children: 'children' }"
                check-strictly
                placeholder="全部部门"
                clearable
                style="width: 170px"
                @change="fetchScheduleData"
              />
              <el-button type="primary" plain :icon="Refresh" @click="fetchScheduleData">
                刷新排班
              </el-button>
            </div>

            <el-button
              v-hasPerm="['hr:attendance:schedule']"
              type="primary"
              :icon="Calendar"
              @click="openBatchScheduleDialog"
            >
              {{ t('attendance.batchSchedule') }}
            </el-button>
          </div>

          <!-- 排班日历矩阵宽表 -->
          <div v-loading="scheduleLoading" class="schedule-matrix-box">
            <el-table :data="scheduleList" border stripe max-height="600" style="width: 100%">
              <el-table-column fixed prop="empNo" label="工号" width="100" align="center" />
              <el-table-column fixed prop="name" label="姓名" width="110" align="center" />
              <el-table-column fixed prop="deptName" label="部门" width="120" align="center" />

              <el-table-column
                v-for="day in scheduleDays"
                :key="day"
                :label="`${day}日`"
                width="68"
                align="center"
              >
                <template #default="{ row }">
                  <span
                    class="shift-tag"
                    :class="{
                      rest: row.scheduleDates?.[formatDayKey(day)]?.isRest,
                      work: !row.scheduleDates?.[formatDayKey(day)]?.isRest,
                    }"
                  >
                    {{ row.scheduleDates?.[formatDayKey(day)]?.shiftName || '班' }}
                  </span>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>

        <!-- Tab 3: 班次规则配置 -->
        <el-tab-pane :label="t('attendance.tabShifts')" name="shifts">
          <div class="shift-toolbar">
            <el-button
              v-hasPerm="['hr:attendance:shift']"
              type="primary"
              :icon="Plus"
              @click="openShiftDialog()"
            >
              新增班次规则
            </el-button>
            <el-button :icon="Refresh" @click="fetchShiftList">刷新班次</el-button>
          </div>

          <el-table v-loading="shiftLoading" :data="shiftList" border stripe style="width: 100%">
            <el-table-column prop="name" label="班次名称" min-width="160" />
            <el-table-column label="工作时段" width="160" align="center">
              <template #default="{ row }">
                <el-tag size="small" type="primary" effect="light">
                  {{ row.startTime }} - {{ row.endTime }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="lateTolerance" label="迟到容差(分)" width="120" align="center" />
            <el-table-column prop="earlyTolerance" label="早退容差(分)" width="120" align="center" />
            <el-table-column prop="workHours" label="计薪工时" width="100" align="center" />
            <el-table-column label="是否默认" width="100" align="center">
              <template #default="{ row }">
                <el-tag v-if="row.isDefault" type="success" effect="plain">默认班次</el-tag>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column prop="remark" label="说明" min-width="160" />
            <el-table-column label="操作" width="140" align="center" fixed="right">
              <template #default="{ row }">
                <el-button
                  v-hasPerm="['hr:attendance:shift']"
                  link
                  type="primary"
                  :icon="Edit"
                  @click="openShiftDialog(row)"
                >
                  编辑
                </el-button>
                <el-button
                  v-if="!row.isDefault"
                  v-hasPerm="['hr:attendance:shift']"
                  link
                  type="danger"
                  :icon="Delete"
                  @click="handleDeleteShift(row)"
                >
                  删除
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 批量智能排班弹窗 -->
    <BaseDialog
      v-model="batchScheduleDialogVisible"
      title="批量全员/部门智能排班配置"
      width="560px"
      :confirm-loading="batchScheduleSubmitting"
      @confirm="submitBatchSchedule"
    >
      <el-form ref="batchScheduleFormRef" :model="batchScheduleForm" label-width="110px">
        <el-form-item label="排班员工" required>
          <el-select
            v-model="batchScheduleForm.empIds"
            multiple
            filterable
            collapse-tags
            placeholder="请选择员工 (支持多选)"
            style="width: 100%"
          >
            <el-option
              v-for="emp in employeeOptions"
              :key="emp.id"
              :label="`${emp.name} (${emp.empNo} - ${emp.dept?.deptName || '未分配'})`"
              :value="emp.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="日期范围" required>
          <el-date-picker
            v-model="batchScheduleRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>

        <el-form-item label="执行班次" required>
          <el-select
            v-model="batchScheduleForm.shiftId"
            placeholder="请选择匹配班次"
            style="width: 100%"
          >
            <el-option
              v-for="s in shiftList"
              :key="s.id"
              :label="`${s.name} (${s.startTime}-${s.endTime})`"
              :value="s.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="周末处理">
          <el-switch
            v-model="batchScheduleForm.includeWeekends"
            active-text="包含周六日正常出勤 (默认周末自动排休)"
          />
        </el-form-item>
      </el-form>
    </BaseDialog>

    <!-- 班次配置编辑弹窗 -->
    <BaseDialog
      v-model="shiftDialogVisible"
      :title="shiftEditingId ? '编辑班次规则' : '新增班次规则'"
      width="500px"
      :confirm-loading="shiftSubmitting"
      @confirm="submitShift"
    >
      <div v-loading="shiftDetailLoading">
        <el-form :model="shiftForm" label-width="110px">
          <el-form-item label="班次名称" required>
            <el-input v-model="shiftForm.name" placeholder="例如: 标准早九晚六工时制" />
          </el-form-item>

          <el-form-item label="上班标准时间" required>
            <el-time-picker
              v-model="shiftForm.startTime"
              format="HH:mm"
              value-format="HH:mm"
              placeholder="09:00"
              style="width: 100%"
            />
          </el-form-item>

          <el-form-item label="下班标准时间" required>
            <el-time-picker
              v-model="shiftForm.endTime"
              format="HH:mm"
              value-format="HH:mm"
              placeholder="18:00"
              style="width: 100%"
            />
          </el-form-item>

          <el-form-item label="迟到容差(分)">
            <el-input-number v-model="shiftForm.lateTolerance" :min="0" :max="60" style="width: 100%" />
          </el-form-item>

          <el-form-item label="早退容差(分)">
            <el-input-number v-model="shiftForm.earlyTolerance" :min="0" :max="60" style="width: 100%" />
          </el-form-item>

          <el-form-item label="计薪工时(小时)">
            <el-input-number v-model="shiftForm.workHours" :min="1" :max="24" :step="0.5" style="width: 100%" />
          </el-form-item>

          <el-form-item label="设为默认班次">
            <el-switch v-model="shiftForm.isDefault" active-text="新员工与未排班日期默认生效" />
          </el-form-item>

          <el-form-item label="规则说明">
            <el-input v-model="shiftForm.remark" type="textarea" :rows="2" placeholder="填写适用部门或说明" />
          </el-form-item>
        </el-form>
      </div>
    </BaseDialog>

    <!-- 补卡修正弹窗 -->
    <BaseDialog
      v-model="repairDialogVisible"
      title="人工补卡与考勤状态修正"
      width="480px"
      :confirm-loading="repairSubmitting"
      @confirm="submitRepair"
    >
      <div v-loading="repairDetailLoading">
        <el-form :model="repairForm" label-width="110px">
          <el-form-item label="上班打卡时间">
            <el-date-picker
              v-model="repairForm.checkInTime"
              type="datetime"
              value-format="YYYY-MM-DD HH:mm:ss"
              placeholder="选择上班实际时间"
              style="width: 100%"
            />
          </el-form-item>

          <el-form-item label="下班打卡时间">
            <el-date-picker
              v-model="repairForm.checkOutTime"
              type="datetime"
              value-format="YYYY-MM-DD HH:mm:ss"
              placeholder="选择下班实际时间"
              style="width: 100%"
            />
          </el-form-item>

          <el-form-item label="综合判定">
            <el-select v-model="repairForm.status" style="width: 100%">
              <el-option label="正常出勤" :value="1" />
              <el-option label="迟到" :value="2" />
              <el-option label="早退" :value="3" />
              <el-option label="旷工/缺勤" :value="4" />
              <el-option label="请假中" :value="5" />
            </el-select>
          </el-form-item>

          <el-form-item label="补卡修正事由">
            <el-input
              v-model="repairForm.remark"
              type="textarea"
              :rows="2"
              placeholder="填写主管审批说明或补卡事由"
            />
          </el-form-item>
        </el-form>
      </div>
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Refresh,
  Calendar,
  Plus,
  Edit,
  Delete,
} from '@element-plus/icons-vue';
import { useI18n } from '@/locales';
import BaseSearch from '@/components/BaseSearch.vue';
import BaseTable, { type TableColumn } from '@/components/BaseTable.vue';
import BaseDialog from '@/components/BaseDialog.vue';
import { getDeptTreeApi } from '@/api/dept';
import { getEmployeeListApi } from '@/api/employee';
import {
  getShiftListApi,
  getShiftDetailApi,
  createShiftApi,
  updateShiftApi,
  deleteShiftApi,
  getMonthScheduleApi,
  batchSetScheduleApi,
  clockInApi,
  getTodayStatusApi,
  getAttendanceRecordListApi,
  getAttendanceRecordDetailApi,
  repairAttendanceRecordApi,
  AttendanceShift,
  AttendanceRecordItem,
  AttendanceKPI,
} from '@/api/attendance';
import {
  formatDateTime,
  formatTimeHM,
  formatDateYMD,
  formatYearMonth,
} from '@/utils/date';

const { t } = useI18n();

/** 当前激活的 Tab 页签 */
const activeTab = ref('records');

/** 实时时钟 */
const liveTimeStr = ref('');
const currentDateStr = ref('');
let timer: any = null;

function updateLiveTime() {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  liveTimeStr.value = `${h}:${m}:${s}`;
  currentDateStr.value = formatDateYMD(d);
}

function getCurrentYearMonth() {
  return formatYearMonth();
}

function formatTime(val?: string | Date) {
  return formatTimeHM(val);
}

function formatDayKey(day: number) {
  return String(day).padStart(2, '0');
}

// 部门树与员工列表
const deptTree = ref<any[]>([]);
const employeeOptions = ref<any[]>([]);

// 打卡相关
const clockLoading = ref(false);
const todayInfo = ref<any>(null);
const todayRecord = ref<any>(null);

async function loadTodayStatus() {
  try {
    const res: any = await getTodayStatusApi();
    todayInfo.value = res;
    todayRecord.value = res?.record;
  } catch (error) {
    // 忽略未关联员工
  }
}

async function handleClock(actionType: 'CHECK_IN' | 'CHECK_OUT') {
  clockLoading.value = true;
  try {
    await clockInApi({ type: actionType });
    ElMessage.success(t('attendance.clockSuccess'));
    loadTodayStatus();
    fetchRecordList();
  } catch (error: any) {
    ElMessage.error(error?.message || '打卡异常');
  } finally {
    clockLoading.value = false;
  }
}

// ==================== Tab 1: 考勤明细监控 ====================
const recordLoading = ref(false);
const recordList = ref<AttendanceRecordItem[]>([]);
const kpiData = reactive<AttendanceKPI>({
  totalCount: 0,
  normalCount: 0,
  lateCount: 0,
  earlyCount: 0,
  absentCount: 0,
  totalWorkHours: 0,
  attendanceRate: 100,
});

const searchForm = reactive({
  yearMonth: getCurrentYearMonth(),
  date: '',
  deptId: undefined as number | undefined,
  status: undefined as number | undefined,
  keyword: '',
});

const recordPagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0,
});

const recordColumns: TableColumn[] = [
  { label: '日期', prop: 'date', width: 110, align: 'center' },
  { label: '员工档案', slot: 'employeeSlot', minWidth: 150, align: 'left' },
  {
    label: '所属部门',
    prop: 'deptName',
    width: 130,
    formatter: (_: any, row: AttendanceRecordItem) => row.employee?.dept?.deptName || '-',
  },
  {
    label: '班次名称',
    prop: 'shiftName',
    width: 140,
    formatter: (_: any, row: AttendanceRecordItem) => row.shift?.name || '默认标准班',
  },
  { label: '上班打卡', slot: 'checkInSlot', width: 140, align: 'center' },
  { label: '下班打卡', slot: 'checkOutSlot', width: 140, align: 'center' },
  { label: '出勤工时', prop: 'workHours', width: 100, align: 'center' },
  { label: '综合状态', slot: 'statusSlot', width: 110, align: 'center' },
  { label: '备注说明', prop: 'remark', minWidth: 140, align: 'left' },
];

async function fetchRecordList() {
  recordLoading.value = true;
  try {
    const res: any = await getAttendanceRecordListApi({
      page: recordPagination.page,
      pageSize: recordPagination.pageSize,
      yearMonth: searchForm.yearMonth || undefined,
      date: searchForm.date || undefined,
      deptId: searchForm.deptId,
      status: searchForm.status,
      keyword: searchForm.keyword.trim() || undefined,
    });

    recordList.value = res.list || [];
    recordPagination.total = res.total || 0;

    if (res.kpi) {
      Object.assign(kpiData, res.kpi);
    }
  } catch (error) {
    console.error('加载考勤明细失败:', error);
  } finally {
    recordLoading.value = false;
  }
}

function handleSearch() {
  recordPagination.page = 1;
  fetchRecordList();
}

function handleReset() {
  searchForm.yearMonth = getCurrentYearMonth();
  searchForm.date = '';
  searchForm.deptId = undefined;
  searchForm.status = undefined;
  searchForm.keyword = '';
  recordPagination.page = 1;
  fetchRecordList();
}

function handleRecordPageChange(page: number) {
  recordPagination.page = page;
  fetchRecordList();
}

function handleRecordSizeChange(size: number) {
  recordPagination.pageSize = size;
  recordPagination.page = 1;
  fetchRecordList();
}

// 补卡弹窗
const repairDialogVisible = ref(false);
const repairSubmitting = ref(false);
const repairDetailLoading = ref(false);
const repairForm = reactive({
  recordId: 0,
  checkInTime: '',
  checkOutTime: '',
  status: 1,
  remark: '',
});

async function openRepairDialog(row: AttendanceRecordItem) {
  repairForm.recordId = row.id;
  repairForm.checkInTime = '';
  repairForm.checkOutTime = '';
  repairForm.status = row.status || 1;
  repairForm.remark = '';
  repairDialogVisible.value = true;
  repairDetailLoading.value = true;

  try {
    const res: any = await getAttendanceRecordDetailApi(row.id);
    repairForm.recordId = res.id;
    repairForm.checkInTime = formatDateTime(res.checkInTime) || '';
    repairForm.checkOutTime = formatDateTime(res.checkOutTime) || '';
    repairForm.status = res.status || 1;
    repairForm.remark = res.remark || '';
  } catch (error: any) {
    ElMessage.error(error?.message || '获取考勤详情失败');
    repairDialogVisible.value = false;
  } finally {
    repairDetailLoading.value = false;
  }
}

async function submitRepair() {
  if (!repairForm.recordId) return;
  repairSubmitting.value = true;
  try {
    await repairAttendanceRecordApi(repairForm);
    ElMessage.success('考勤修正成功');
    repairDialogVisible.value = false;
    fetchRecordList();
  } catch (error: any) {
    ElMessage.error(error?.message || '修正失败');
  } finally {
    repairSubmitting.value = false;
  }
}

// ==================== Tab 2: 月度排班日历 ====================
const scheduleLoading = ref(false);
const scheduleMonth = ref(getCurrentYearMonth());
const scheduleDeptId = ref<number | undefined>(undefined);
const scheduleDays = ref<number[]>([]);
const scheduleList = ref<any[]>([]);

async function fetchScheduleData() {
  scheduleLoading.value = true;
  try {
    const res: any = await getMonthScheduleApi({
      yearMonth: scheduleMonth.value,
      deptId: scheduleDeptId.value,
    });

    const daysCount = res.days || 31;
    scheduleDays.value = Array.from({ length: daysCount }, (_, i) => i + 1);
    scheduleList.value = res.list || [];
  } catch (error) {
    console.error('加载排班日历失败:', error);
  } finally {
    scheduleLoading.value = false;
  }
}

// 批量智能排班弹窗
const batchScheduleDialogVisible = ref(false);
const batchScheduleSubmitting = ref(false);
const batchScheduleRange = ref<string[]>([]);
const batchScheduleForm = reactive({
  empIds: [] as number[],
  shiftId: undefined as number | undefined,
  includeWeekends: false,
});

function openBatchScheduleDialog() {
  batchScheduleForm.empIds = [];
  batchScheduleForm.shiftId = shiftList.value[0]?.id;
  batchScheduleForm.includeWeekends = false;

  const ym = scheduleMonth.value || getCurrentYearMonth();
  batchScheduleRange.value = [`${ym}-01`, `${ym}-28`];
  batchScheduleDialogVisible.value = true;
}

async function submitBatchSchedule() {
  if (!batchScheduleForm.empIds.length) {
    ElMessage.warning('请选择排班员工');
    return;
  }
  if (!batchScheduleRange.value || batchScheduleRange.value.length < 2) {
    ElMessage.warning('请选择排班起止日期');
    return;
  }

  batchScheduleSubmitting.value = true;
  try {
    const res: any = await batchSetScheduleApi({
      empIds: batchScheduleForm.empIds,
      startDate: batchScheduleRange.value[0],
      endDate: batchScheduleRange.value[1],
      shiftId: batchScheduleForm.shiftId,
      includeWeekends: batchScheduleForm.includeWeekends,
    });

    ElMessage.success(`排班成功，已生成 ${res.count || 0} 笔排班数据`);
    batchScheduleDialogVisible.value = false;
    fetchScheduleData();
  } catch (error: any) {
    ElMessage.error(error?.message || '排班失败');
  } finally {
    batchScheduleSubmitting.value = false;
  }
}

// ==================== Tab 3: 班次规则管理 ====================
const shiftLoading = ref(false);
const shiftList = ref<AttendanceShift[]>([]);
const shiftDialogVisible = ref(false);
const shiftSubmitting = ref(false);
const shiftDetailLoading = ref(false);
const shiftEditingId = ref<number | null>(null);

const shiftForm = reactive({
  name: '',
  startTime: '09:00',
  endTime: '18:00',
  lateTolerance: 10,
  earlyTolerance: 0,
  workHours: 8.0,
  isDefault: false,
  remark: '',
});

async function fetchShiftList() {
  shiftLoading.value = true;
  try {
    const res: any = await getShiftListApi();
    shiftList.value = res || [];
  } finally {
    shiftLoading.value = false;
  }
}

async function openShiftDialog(row?: AttendanceShift) {
  if (row) {
    shiftEditingId.value = row.id;
    shiftForm.name = '';
    shiftForm.startTime = '09:00';
    shiftForm.endTime = '18:00';
    shiftForm.lateTolerance = 10;
    shiftForm.earlyTolerance = 0;
    shiftForm.workHours = 8.0;
    shiftForm.isDefault = false;
    shiftForm.remark = '';
    shiftDialogVisible.value = true;
    shiftDetailLoading.value = true;

    try {
      const res: any = await getShiftDetailApi(row.id);
      shiftForm.name = res.name || '';
      shiftForm.startTime = res.startTime || '09:00';
      shiftForm.endTime = res.endTime || '18:00';
      shiftForm.lateTolerance = res.lateTolerance ?? 10;
      shiftForm.earlyTolerance = res.earlyTolerance ?? 0;
      shiftForm.workHours = Number(res.workHours || 8.0);
      shiftForm.isDefault = Boolean(res.isDefault);
      shiftForm.remark = res.remark || '';
    } catch (error: any) {
      ElMessage.error(error?.message || '获取班次详情失败');
      shiftDialogVisible.value = false;
    } finally {
      shiftDetailLoading.value = false;
    }
  } else {
    shiftEditingId.value = null;
    shiftForm.name = '';
    shiftForm.startTime = '09:00';
    shiftForm.endTime = '18:00';
    shiftForm.lateTolerance = 10;
    shiftForm.earlyTolerance = 0;
    shiftForm.workHours = 8.0;
    shiftForm.isDefault = false;
    shiftForm.remark = '';
    shiftDialogVisible.value = true;
  }
}

async function submitShift() {
  if (!shiftForm.name.trim()) {
    ElMessage.warning('请输入班次名称');
    return;
  }
  shiftSubmitting.value = true;
  try {
    if (shiftEditingId.value) {
      await updateShiftApi(shiftEditingId.value, shiftForm);
      ElMessage.success('班次更新成功');
    } else {
      await createShiftApi(shiftForm);
      ElMessage.success('班次创建成功');
    }
    shiftDialogVisible.value = false;
    fetchShiftList();
  } catch (error: any) {
    ElMessage.error(error?.message || '保存失败');
  } finally {
    shiftSubmitting.value = false;
  }
}

async function handleDeleteShift(row: AttendanceShift) {
  try {
    await ElMessageBox.confirm(`确定要删除班次【${row.name}】吗？`, '删除提示', {
      type: 'warning',
    });
    await deleteShiftApi(row.id);
    ElMessage.success('班次已删除');
    fetchShiftList();
  } catch {
    // 取消
  }
}

function handleTabChange(tab: any) {
  if (tab === 'schedule') {
    fetchScheduleData();
  } else if (tab === 'shifts') {
    fetchShiftList();
  } else {
    fetchRecordList();
  }
}

onMounted(async () => {
  updateLiveTime();
  timer = setInterval(updateLiveTime, 1000);

  try {
    const dRes: any = await getDeptTreeApi();
    deptTree.value = dRes || [];

    const eRes: any = await getEmployeeListApi({ page: 1, pageSize: 100 });
    employeeOptions.value = eRes.list || [];
  } catch (e) {
    // 忽略
  }

  loadTodayStatus();
  fetchRecordList();
  fetchShiftList();
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
</script>

<style scoped lang="scss">
.attendance-container {
  padding: 16px;

  .top-row {
    margin-bottom: 16px;
  }

  .clock-card {
    border-radius: 8px;
    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
    color: #fff;
    min-height: 180px;

    .clock-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;

      .clock-title {
        font-size: 14px;
        opacity: 0.9;
        font-weight: 600;
      }

      .clock-date {
        font-size: 12px;
        opacity: 0.7;
      }
    }

    .clock-time {
      font-size: 32px;
      font-weight: 700;
      font-family: 'Helvetica Neue', Arial, sans-serif;
      letter-spacing: 1px;
      color: #38bdf8;
      margin-bottom: 8px;
    }

    .clock-user {
      font-size: 12px;
      opacity: 0.8;
      margin-bottom: 16px;

      .split {
        margin: 0 6px;
        opacity: 0.4;
      }
    }

    .clock-actions {
      display: flex;
      gap: 12px;

      .clock-btn {
        flex: 1;
        display: flex;
        flex-direction: column;
        height: 52px;
        font-size: 14px;
        font-weight: 600;

        .clock-sub {
          font-size: 11px;
          opacity: 0.85;
          margin-top: 2px;
          font-weight: normal;
        }
      }
    }
  }

  .kpi-cards {
    height: 100%;

    .kpi-card {
      border-radius: 8px;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;

      .kpi-title {
        font-size: 13px;
        color: var(--el-text-color-secondary);
        margin-bottom: 8px;
      }

      .kpi-val {
        font-size: 26px;
        font-weight: 700;
        font-family: 'Helvetica Neue', Arial, sans-serif;
        line-height: 1.2;
        margin-bottom: 6px;

        .unit {
          font-size: 13px;
          font-weight: normal;
          color: var(--el-text-color-secondary);
        }

        &.normal {
          color: var(--el-color-success);
        }
        &.warning {
          color: var(--el-color-warning);
        }
        &.danger {
          color: var(--el-color-danger);
        }
      }

      .kpi-desc {
        font-size: 12px;
        color: var(--el-text-color-placeholder);
      }

      &.kpi-rate {
        border-top: 3px solid var(--el-color-primary);
      }
      &.kpi-normal {
        border-top: 3px solid var(--el-color-success);
      }
      &.kpi-warning {
        border-top: 3px solid var(--el-color-warning);
      }
      &.kpi-danger {
        border-top: 3px solid var(--el-color-danger);
      }
    }
  }

  .main-tabs-card {
    border-radius: 8px;

    :deep(.el-tabs__header) {
      margin-bottom: 16px;
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

  .check-time-box {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;

    .time {
      font-family: monospace;
      font-weight: 600;
    }
  }

  .schedule-toolbar,
  .shift-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;

    .filter-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }
  }

  .schedule-matrix-box {
    .shift-tag {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;

      &.work {
        background-color: var(--el-color-primary-light-9);
        color: var(--el-color-primary);
      }

      &.rest {
        background-color: var(--el-fill-color-light);
        color: var(--el-text-color-placeholder);
      }
    }
  }
}
</style>
