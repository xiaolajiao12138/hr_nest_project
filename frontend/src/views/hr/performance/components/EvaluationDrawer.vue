<template>
  <el-drawer
    v-model="visible"
    :title="`绩效评审打分 · 【${record?.empName}】(${record?.empNo})`"
    size="620px"
    destroy-on-close
    append-to-body
  >
    <el-scrollbar max-height="82vh" class="drawer-scroll">
      <div v-if="record" class="eval-container">
        <!-- 员工概况信息栏 -->
        <div class="emp-profile-card">
          <div class="profile-main">
            <el-avatar :size="48" style="background-color: #3b82f6; font-size: 18px">
              {{ record.empName?.slice(-2) }}
            </el-avatar>
            <div class="profile-info">
              <div class="name-row">
                <span class="emp-name">{{ record.empName }}</span>
                <el-tag size="small" type="info">{{ record.empNo }}</el-tag>
                <el-tag size="small" effect="plain">{{ record.deptName || '综合部门' }}</el-tag>
              </div>
              <div class="post-row">
                <span>岗位: {{ record.post || '核心骨干' }}</span>
                <span class="divider">|</span>
                <span>考评方案: {{ plan?.title || '综合考评' }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 方案权重与考核指标库透析 -->
        <div class="metrics-preview-box">
          <div class="metrics-header">
            <span class="title">考核指标库与权重配比</span>
            <span class="ratio-tag">
              自评 {{ plan?.weightSelf ?? 30 }}% : 主管 {{ plan?.weightManager ?? 70 }}%
            </span>
          </div>
          <div v-if="metricsList.length > 0" class="metrics-list">
            <div v-for="(m, idx) in metricsList" :key="idx" class="metric-item">
              <div class="m-top">
                <span class="m-name">{{ m.name }}</span>
                <el-tag size="small" :type="m.type === 'KPI' ? 'primary' : 'success'">
                  {{ m.type }} {{ m.weight }}%
                </el-tag>
              </div>
              <div class="m-target">验收目标: {{ m.target }}</div>
            </div>
          </div>
        </div>

        <!-- 评分表单 -->
        <el-form ref="formRef" :model="form" label-position="top" class="eval-form">
          <!-- 1. 员工自评模块 -->
          <div class="section-box self-box">
            <div class="section-title">
              <el-icon><User /></el-icon>
              <span>员工自我评价 (权重 {{ plan?.weightSelf ?? 30 }}%)</span>
              <el-tag
                size="small"
                :type="record.selfScore !== null ? 'success' : 'info'"
                style="margin-left: auto"
              >
                {{ record.selfScore !== null ? '已提交自评' : '待自评' }}
              </el-tag>
            </div>

            <el-form-item label="自评分数 (0 - 100 分)">
              <div class="score-input-row">
                <el-slider
                  v-model="form.selfScore"
                  :min="0"
                  :max="100"
                  style="flex: 1; margin-right: 16px"
                  @input="recalculateFinalScore"
                />
                <el-input-number
                  v-model="form.selfScore"
                  :min="0"
                  :max="100"
                  :precision="1"
                  style="width: 120px"
                  @change="recalculateFinalScore"
                />
              </div>
            </el-form-item>

            <el-form-item label="业绩述职与自评总结">
              <el-input
                v-model="form.selfComment"
                type="textarea"
                :rows="3"
                placeholder="总结本周期 KPI/OKR 完成进展、关键成果与自我反思"
              />
            </el-form-item>
          </div>

          <!-- 2. 主管考评模块 -->
          <div class="section-box manager-box">
            <div class="section-title">
              <el-icon><Check /></el-icon>
              <span>主管评审与评语 (权重 {{ plan?.weightManager ?? 70 }}%)</span>
              <el-tag
                size="small"
                :type="record.managerScore !== null ? 'success' : 'warning'"
                style="margin-left: auto"
              >
                {{ record.managerScore !== null ? '主管已评审' : '待主管评审' }}
              </el-tag>
            </div>

            <el-form-item label="主管考评分数 (0 - 100 分)">
              <div class="score-input-row">
                <el-slider
                  v-model="form.managerScore"
                  :min="0"
                  :max="100"
                  style="flex: 1; margin-right: 16px"
                  @input="recalculateFinalScore"
                />
                <el-input-number
                  v-model="form.managerScore"
                  :min="0"
                  :max="100"
                  :precision="1"
                  style="width: 120px"
                  @change="recalculateFinalScore"
                />
              </div>
            </el-form-item>

            <el-form-item label="主管综合评语与成长指导建议">
              <el-input
                v-model="form.managerComment"
                type="textarea"
                :rows="3"
                placeholder="针对本周期表现给出客观评价、亮点表扬及后续能力提升建议"
              />
            </el-form-item>
          </div>

          <!-- 3. 加权最终综合得分与等级系数推导 -->
          <div class="section-box final-result-box">
            <div class="section-title">
              <el-icon><Trophy /></el-icon>
              <span>综合考评结果 (加权联动结算)</span>
            </div>

            <div class="result-display-grid">
              <div class="result-card">
                <div class="res-label">综合得分</div>
                <div class="res-val score-text">{{ form.finalScore }} 分</div>
              </div>
              <div class="result-card">
                <div class="res-label">绩效评定等级</div>
                <div class="res-val">
                  <el-tag size="large" :type="getRatingTagType(form.rating)" effect="dark">
                    {{ form.rating }} 级
                  </el-tag>
                </div>
              </div>
              <div class="result-card">
                <div class="res-label">发薪绩效系数</div>
                <div class="res-val coef-text">{{ form.coefficient }} 倍</div>
              </div>
            </div>

            <div class="custom-rating-override">
              <span class="override-tip">等级微调覆盖:</span>
              <el-radio-group v-model="form.rating" size="small" @change="handleRatingOverride">
                <el-radio-button label="S">S (1.5x)</el-radio-button>
                <el-radio-button label="A">A (1.2x)</el-radio-button>
                <el-radio-button label="B">B (1.0x)</el-radio-button>
                <el-radio-button label="C">C (0.8x)</el-radio-button>
                <el-radio-button label="D">D (0.0x)</el-radio-button>
              </el-radio-group>
            </div>
          </div>
        </el-form>
      </div>
    </el-scrollbar>

    <template #footer>
      <div class="drawer-footer">
        <el-button @click="visible = false">取 消</el-button>
        <el-button type="info" plain :loading="submitting" @click="saveSelfEvaluationOnly">
          仅保存员工自评
        </el-button>
        <el-button type="primary" :loading="submitting" @click="confirmCompleteEvaluation">
          确认评定并完成考评
        </el-button>
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { User, Check, Trophy } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import {
  evaluatePerformanceApi,
  PerformanceRecordItem,
  PerformancePlanItem,
} from '@/api/performance';

const emit = defineEmits(['success']);

const visible = ref(false);
const submitting = ref(false);
const record = ref<PerformanceRecordItem | null>(null);
const plan = ref<PerformancePlanItem | null>(null);

const form = reactive({
  selfScore: 90,
  selfComment: '',
  managerScore: 90,
  managerComment: '',
  finalScore: 90,
  rating: 'A',
  coefficient: 1.2,
});

const metricsList = computed(() => {
  if (!plan.value?.metrics) return [];
  try {
    return JSON.parse(plan.value.metrics);
  } catch {
    return [];
  }
});

const recalculateFinalScore = () => {
  const wSelf = (plan.value?.weightSelf ?? 30) / 100;
  const wManager = (plan.value?.weightManager ?? 70) / 100;
  const score = Math.round((form.selfScore * wSelf + form.managerScore * wManager) * 10) / 10;
  form.finalScore = score;

  if (score >= 95) {
    form.rating = 'S';
    form.coefficient = 1.5;
  } else if (score >= 85) {
    form.rating = 'A';
    form.coefficient = 1.2;
  } else if (score >= 70) {
    form.rating = 'B';
    form.coefficient = 1.0;
  } else if (score >= 60) {
    form.rating = 'C';
    form.coefficient = 0.8;
  } else {
    form.rating = 'D';
    form.coefficient = 0.0;
  }
};

const handleRatingOverride = (val: string) => {
  switch (val) {
    case 'S':
      form.coefficient = 1.5;
      break;
    case 'A':
      form.coefficient = 1.2;
      break;
    case 'B':
      form.coefficient = 1.0;
      break;
    case 'C':
      form.coefficient = 0.8;
      break;
    case 'D':
      form.coefficient = 0.0;
      break;
  }
};

const getRatingTagType = (r: string) => {
  switch (r) {
    case 'S':
      return 'danger';
    case 'A':
      return 'success';
    case 'B':
      return 'primary';
    case 'C':
      return 'warning';
    case 'D':
      return 'info';
    default:
      return 'primary';
  }
};

const open = (row: PerformanceRecordItem, currentPlan?: PerformancePlanItem) => {
  record.value = row;
  plan.value = currentPlan || null;

  form.selfScore = row.selfScore !== null ? Number(row.selfScore) : 85;
  form.selfComment = row.selfComment || '';
  form.managerScore = row.managerScore !== null ? Number(row.managerScore) : 88;
  form.managerComment = row.managerComment || '';

  if (row.finalScore !== null) {
    form.finalScore = Number(row.finalScore);
    form.rating = row.rating || 'A';
    form.coefficient = Number(row.coefficient) || 1.2;
  } else {
    recalculateFinalScore();
  }

  visible.value = true;
};

// 仅保存自评
const saveSelfEvaluationOnly = async () => {
  if (!record.value) return;
  submitting.value = true;
  try {
    await evaluatePerformanceApi({
      recordId: record.value.id,
      evalType: 'self',
      selfScore: form.selfScore,
      selfComment: form.selfComment,
    });
    ElMessage.success('员工自评已成功暂存');
    visible.value = false;
    emit('success');
  } finally {
    submitting.value = false;
  }
};

// 确认并全流程完成评定
const confirmCompleteEvaluation = async () => {
  if (!record.value) return;
  submitting.value = true;
  try {
    await evaluatePerformanceApi({
      recordId: record.value.id,
      evalType: 'both',
      selfScore: form.selfScore,
      selfComment: form.selfComment,
      managerScore: form.managerScore,
      managerComment: form.managerComment,
      customFinalScore: form.finalScore,
      customRating: form.rating,
    });
    ElMessage.success(`【${record.value.empName}】绩效考评已完成，评定等级为 ${form.rating} 级`);
    visible.value = false;
    emit('success');
  } finally {
    submitting.value = false;
  }
};

defineExpose({ open });
</script>

<style scoped>
.drawer-scroll {
  padding-right: 8px;
}
.eval-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.emp-profile-card {
  background: linear-gradient(135deg, #f0fdf4 0%, #eff6ff 100%);
  border: 1px solid #dbeafe;
  border-radius: 8px;
  padding: 14px 18px;
}
.profile-main {
  display: flex;
  align-items: center;
  gap: 14px;
}
.name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.emp-name {
  font-size: 16px;
  font-weight: 700;
  color: #1e293b;
}
.post-row {
  font-size: 13px;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 8px;
}
.divider {
  color: #cbd5e1;
}

.metrics-preview-box {
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px 16px;
}
.metrics-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 8px;
}
.ratio-tag {
  font-size: 12px;
  color: #3b82f6;
  background-color: #eff6ff;
  padding: 2px 8px;
  border-radius: 4px;
}
.metrics-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.metric-item {
  background: #fff;
  border: 1px dashed #cbd5e1;
  border-radius: 6px;
  padding: 8px 10px;
}
.m-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.m-name {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
}
.m-target {
  font-size: 12px;
  color: #64748b;
  margin-top: 4px;
}

.section-box {
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  padding: 14px 16px;
  margin-bottom: 12px;
}
.self-box {
  background-color: #fdfefe;
}
.manager-box {
  background-color: #fafbfd;
}
.final-result-box {
  background: #f8fafc;
  border-color: #cbd5e1;
}
.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  margin-bottom: 12px;
}
.score-input-row {
  display: flex;
  align-items: center;
  width: 100%;
}
.result-display-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 14px;
}
.result-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 10px;
  text-align: center;
}
.res-label {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 4px;
}
.res-val {
  font-size: 18px;
  font-weight: 700;
}
.score-text {
  color: #3b82f6;
}
.coef-text {
  color: #10b981;
}
.custom-rating-override {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 6px;
  border-top: 1px dashed #e2e8f0;
}
.override-tip {
  font-size: 12px;
  color: #64748b;
}
.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
