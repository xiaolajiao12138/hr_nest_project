<template>
  <el-drawer
    v-model="visible"
    :title="t('salary.payslip')"
    size="560px"
    destroy-on-close
    class="payslip-drawer"
  >
    <div v-loading="loading" class="drawer-content">
      <!-- 顶部月份选择与安全防偷窥控制工具条 -->
      <div class="drawer-toolbar">
        <div class="month-select-box">
          <span class="label">选择月份:</span>
          <el-select
            v-model="currentSalaryId"
            placeholder="请选择发薪月份"
            style="width: 160px"
            @change="handleMonthChange"
          >
            <el-option
              v-for="item in payslipList"
              :key="item.id"
              :label="item.yearMonth"
              :value="item.id"
            >
              <div class="month-option">
                <span>{{ item.yearMonth }}</span>
                <el-tag
                  :type="item.status === 3 ? 'success' : item.status === 2 ? 'warning' : 'info'"
                  size="small"
                  effect="light"
                >
                  {{ item.status === 3 ? '已发' : item.status === 2 ? '核准' : '草稿' }}
                </el-tag>
              </div>
            </el-option>
          </el-select>
        </div>

        <div class="privacy-toggle-box">
          <el-tooltip :content="hideAmount ? '点击显现金额' : '防偷窥遮罩模式'" placement="top">
            <el-button
              circle
              :type="hideAmount ? 'warning' : 'default'"
              :icon="hideAmount ? Hide : View"
              @click="hideAmount = !hideAmount"
            />
          </el-tooltip>
        </div>
      </div>

      <!-- 无工资条记录空状态 -->
      <el-empty
        v-if="!loading && payslipList.length === 0"
        :description="t('salary.noPayslip')"
      />

      <!-- 设密且尚未解密验证的防偷窥锁定状态 -->
      <div
        v-else-if="currentMeta?.hasPassword && !isVerified"
        class="password-lock-card"
      >
        <div class="lock-icon-box">
          <el-icon class="lock-icon"><Lock /></el-icon>
        </div>
        <h3 class="lock-title">工资条已受到密码保护</h3>
        <p class="lock-desc">{{ t('salary.setPassHint') }}</p>

        <div class="lock-input-group">
          <el-input
            v-model="verifyPassword"
            type="password"
            show-password
            placeholder="请输入工资条安全密码"
            style="width: 260px"
            @keyup.enter="handleVerify"
          />
          <el-button
            type="primary"
            :loading="verifying"
            @click="handleVerify"
          >
            解密查阅
          </el-button>
        </div>
      </div>

      <!-- 工资条明细内容卡片 -->
      <div v-else-if="payslipDetail" class="payslip-card">
        <!-- 核心实发总额看板 -->
        <div class="net-salary-banner">
          <div class="banner-sub">
            <span>{{ payslipDetail.yearMonth }} 实发到手金额</span>
            <el-tag
              :type="payslipDetail.status === 3 ? 'success' : 'warning'"
              round
              size="small"
            >
              {{ payslipDetail.status === 3 ? '已发放' : '已核准' }}
            </el-tag>
          </div>
          <div class="banner-amount">
            <span class="currency">¥</span>
            <span class="num">{{ maskNumber(payslipDetail.netSalary) }}</span>
          </div>
          <div class="banner-emp">
            <span>{{ payslipDetail.employee?.name }}</span>
            <span class="split">|</span>
            <span>工号: {{ payslipDetail.employee?.employeeNo }}</span>
            <span class="split">|</span>
            <span>{{ payslipDetail.employee?.department?.name || '公司' }}</span>
          </div>
        </div>

        <!-- 收入明细卡片 -->
        <div class="detail-section">
          <div class="section-title">
            <span class="title-text">一、应发薪酬收入项</span>
            <span class="section-sum gross">
              小计: ¥ {{ maskNumber(payslipDetail.grossSalary) }}
            </span>
          </div>
          <div class="item-grid">
            <div class="grid-item">
              <span class="item-label">基本底薪</span>
              <span class="item-val">¥ {{ maskNumber(payslipDetail.baseSalary) }}</span>
            </div>
            <div class="grid-item">
              <span class="item-label">岗位津贴</span>
              <span class="item-val">¥ {{ maskNumber(payslipDetail.postSalary) }}</span>
            </div>
            <div class="grid-item">
              <span class="item-label">绩效奖金</span>
              <span class="item-val">¥ {{ maskNumber(payslipDetail.performanceSalary) }}</span>
            </div>
            <div class="grid-item">
              <span class="item-label">加班补助</span>
              <span class="item-val">¥ {{ maskNumber(payslipDetail.overtimeSalary) }}</span>
            </div>
            <div class="grid-item">
              <span class="item-label">各项津贴</span>
              <span class="item-val">¥ {{ maskNumber(payslipDetail.allowance) }}</span>
            </div>
          </div>
        </div>

        <!-- 扣减明细卡片 -->
        <div class="detail-section">
          <div class="section-title">
            <span class="title-text">二、法定五险一金与扣减项</span>
            <span class="section-sum deduction">
              扣除小计: - ¥ {{ maskNumber(payslipDetail.totalDeduction) }}
            </span>
          </div>
          <div class="item-grid">
            <div class="grid-item">
              <span class="item-label">缺勤请假扣除</span>
              <span class="item-val deduction">
                - ¥ {{ maskNumber(payslipDetail.leaveDeduction) }}
              </span>
            </div>
            <div class="grid-item">
              <span class="item-label">个人社保(五险)</span>
              <span class="item-val deduction">
                - ¥ {{ maskNumber(payslipDetail.socialSecurity) }}
              </span>
            </div>
            <div class="grid-item">
              <span class="item-label">住房公积金</span>
              <span class="item-val deduction">
                - ¥ {{ maskNumber(payslipDetail.housingFund) }}
              </span>
            </div>
            <div class="grid-item">
              <span class="item-label">预扣个税</span>
              <span class="item-val deduction">
                - ¥ {{ maskNumber(payslipDetail.tax) }}
              </span>
            </div>
          </div>
        </div>

        <!-- 备注与寄语 -->
        <div v-if="payslipDetail.remarks" class="remarks-box">
          <span class="rem-title">核算说明:</span>
          <span class="rem-content">{{ payslipDetail.remarks }}</span>
        </div>

        <!-- 底部保密提醒 -->
        <div class="security-footer">
          <el-icon><InfoFilled /></el-icon>
          <span>{{ t('salary.sensitiveTip') }}</span>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ElMessage } from 'element-plus';
import {
  Lock,
  View,
  Hide,
  InfoFilled,
} from '@element-plus/icons-vue';
import { useI18n } from '@/locales';
import {
  getMyPayslipsApi,
  verifyPayslipApi,
  SalaryRecord,
} from '@/api/salary';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
}>();

const { t } = useI18n();

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

const loading = ref(false);
const verifying = ref(false);
const hideAmount = ref(false);

const payslipList = ref<
  Array<{
    id: number;
    yearMonth: string;
    status: number;
    hasPassword: boolean;
    netSalary: number;
    createdAt: string;
  }>
>([]);

const currentSalaryId = ref<number | undefined>(undefined);
const verifyPassword = ref('');
const isVerified = ref(false);
const payslipDetail = ref<SalaryRecord | null>(null);

const currentMeta = computed(() => {
  return payslipList.value.find((p) => p.id === currentSalaryId.value);
});

/**
 * 格式化或脱敏金额
 */
function maskNumber(val?: number | string): string {
  if (hideAmount.value) {
    return '****';
  }
  const n = Number(val || 0);
  return n.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * 加载个人工资条历史列表
 */
async function loadPayslips() {
  loading.value = true;
  try {
    const list: any = await getMyPayslipsApi();
    payslipList.value = list || [];

    if (payslipList.value.length > 0) {
      currentSalaryId.value = payslipList.value[0].id;
      handleMonthChange(currentSalaryId.value);
    } else {
      currentSalaryId.value = undefined;
      payslipDetail.value = null;
    }
  } catch (error) {
    console.error('加载工资条列表失败:', error);
  } finally {
    loading.value = false;
  }
}

/**
 * 切换查看月份
 */
async function handleMonthChange(salaryId?: number) {
  if (!salaryId) return;
  verifyPassword.value = '';
  isVerified.value = false;
  payslipDetail.value = null;

  const target = payslipList.value.find((p) => p.id === salaryId);
  if (!target) return;

  // 若该条无密码，直接免密验证并加载详情
  if (!target.hasPassword) {
    await fetchDetail(salaryId);
  }
}

/**
 * 密码验证
 */
async function handleVerify() {
  if (!currentSalaryId.value) return;
  if (!verifyPassword.value.trim()) {
    ElMessage.warning('请输入工资条安全密码');
    return;
  }
  verifying.value = true;
  try {
    await fetchDetail(currentSalaryId.value, verifyPassword.value.trim());
    isVerified.value = true;
    ElMessage.success(t('salary.verifySuccess'));
  } catch (error: any) {
    ElMessage.error(error?.message || t('salary.verifyFailed'));
  } finally {
    verifying.value = false;
  }
}

/**
 * 拉取工资条解密详情
 */
async function fetchDetail(salaryId: number, password?: string) {
  loading.value = true;
  try {
    const detail: any = await verifyPayslipApi({ salaryId, password });
    payslipDetail.value = detail;
    isVerified.value = true;
  } finally {
    loading.value = false;
  }
}

// 监听弹窗打开自动拉取最新工资条
watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      loadPayslips();
    }
  }
);
</script>

<style scoped lang="scss">
.payslip-drawer {
  .drawer-content {
    min-height: 300px;
  }

  .drawer-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--el-border-color-lighter);
    margin-bottom: 20px;

    .month-select-box {
      display: flex;
      align-items: center;
      gap: 10px;

      .label {
        font-size: 14px;
        color: var(--el-text-color-regular);
      }

      .month-option {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
      }
    }
  }

  .password-lock-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 60px 20px;
    text-align: center;

    .lock-icon-box {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: var(--el-color-primary-light-9);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 20px;

      .lock-icon {
        font-size: 36px;
        color: var(--el-color-primary);
      }
    }

    .lock-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--el-text-color-primary);
      margin: 0 0 8px 0;
    }

    .lock-desc {
      font-size: 13px;
      color: var(--el-text-color-secondary);
      max-width: 380px;
      margin: 0 0 24px 0;
      line-height: 1.6;
    }

    .lock-input-group {
      display: flex;
      gap: 10px;
    }
  }

  .payslip-card {
    .net-salary-banner {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      border-radius: 12px;
      padding: 24px;
      color: #fff;
      box-shadow: 0 8px 20px rgba(16, 185, 129, 0.2);
      margin-bottom: 24px;

      .banner-sub {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 14px;
        opacity: 0.9;
        margin-bottom: 12px;
      }

      .banner-amount {
        font-size: 38px;
        font-weight: 700;
        font-family: 'Helvetica Neue', Arial, sans-serif;
        line-height: 1;
        margin-bottom: 16px;

        .currency {
          font-size: 24px;
          margin-right: 4px;
        }
      }

      .banner-emp {
        font-size: 13px;
        opacity: 0.85;

        .split {
          margin: 0 8px;
          opacity: 0.5;
        }
      }
    }

    .detail-section {
      background: var(--el-fill-color-blank);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 16px;

      .section-title {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-bottom: 12px;
        border-bottom: 1px dashed var(--el-border-color-lighter);
        margin-bottom: 12px;

        .title-text {
          font-size: 14px;
          font-weight: 600;
          color: var(--el-text-color-primary);
        }

        .section-sum {
          font-size: 14px;
          font-weight: 700;

          &.gross {
            color: var(--el-color-primary);
          }
          &.deduction {
            color: var(--el-color-danger);
          }
        }
      }

      .item-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;

        .grid-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 13px;

          .item-label {
            color: var(--el-text-color-regular);
          }

          .item-val {
            font-weight: 500;
            color: var(--el-text-color-primary);

            &.deduction {
              color: var(--el-color-danger);
            }
          }
        }
      }
    }

    .remarks-box {
      background: var(--el-fill-color-light);
      border-radius: 6px;
      padding: 10px 14px;
      font-size: 13px;
      color: var(--el-text-color-secondary);
      margin-bottom: 16px;
      display: flex;
      gap: 8px;

      .rem-title {
        font-weight: 600;
      }
    }

    .security-footer {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-size: 12px;
      color: var(--el-text-color-placeholder);
      padding: 12px 0 4px 0;
    }
  }
}
</style>
