<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? '编辑绩效考评方案' : '新建绩效考评方案'"
    width="680px"
    top="7vh"
    destroy-on-close
    append-to-body
  >
    <el-scrollbar max-height="65vh" class="dialog-scroll">
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="110px"
        style="padding-right: 12px"
      >
        <el-form-item label="方案名称" prop="title">
          <el-input v-model="form.title" placeholder="例如: 2026年Q2综合效能与业务绩效考评" />
        </el-form-item>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="周期类型" prop="cycleType">
              <el-select v-model="form.cycleType" style="width: 100%">
                <el-option label="季度考核 (Quarterly)" value="QUARTERLY" />
                <el-option label="月度考核 (Monthly)" value="MONTHLY" />
                <el-option label="年度考评 (Annual)" value="ANNUAL" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="方案状态" prop="status">
              <el-select v-model="form.status" style="width: 100%">
                <el-option label="进行中 (IN_PROGRESS)" value="IN_PROGRESS" />
                <el-option label="草稿 (DRAFT)" value="DRAFT" />
                <el-option label="已完成归档 (COMPLETED)" value="COMPLETED" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="开始日期" prop="startDate">
              <el-date-picker
                v-model="form.startDate"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="考核起始日期"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="截止日期" prop="endDate">
              <el-date-picker
                v-model="form.endDate"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="考核截止日期"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">
          <span style="font-size: 13px; font-weight: 600; color: #475569">
            考评双向权重配比 (合计必须为 100%)
          </span>
        </el-divider>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="自评权重 (%)" prop="weightSelf">
              <el-input-number
                v-model="form.weightSelf"
                :min="0"
                :max="100"
                style="width: 100%"
                @change="handleWeightSelfChange"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="主管权重 (%)" prop="weightManager">
              <el-input-number
                v-model="form.weightManager"
                :min="0"
                :max="100"
                style="width: 100%"
                @change="handleWeightManagerChange"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">
          <div style="display: flex; align-items: center; justify-content: space-between; width: 100%">
            <span style="font-size: 13px; font-weight: 600; color: #475569">
              KPI / OKR 核心指标库配置
            </span>
            <el-button size="small" type="primary" plain :icon="Plus" @click="addMetric">
              添加考评指标
            </el-button>
          </div>
        </el-divider>

        <div v-for="(metric, idx) in form.metricsList" :key="idx" class="metric-card">
          <div class="metric-card-header">
            <span class="idx-badge">指标 {{ idx + 1 }}</span>
            <el-button
              type="danger"
              link
              size="small"
              :disabled="form.metricsList.length <= 1"
              @click="removeMetric(idx)"
            >
              移除
            </el-button>
          </div>
          <el-row :gutter="12">
            <el-col :span="8">
              <el-input v-model="metric.name" placeholder="指标名称，如 核心系统按时交付率" />
            </el-col>
            <el-col :span="6">
              <el-select v-model="metric.type" placeholder="指标类型">
                <el-option label="KPI (关键指标)" value="KPI" />
                <el-option label="OKR (关键结果)" value="OKR" />
              </el-select>
            </el-col>
            <el-col :span="10">
              <el-input-number
                v-model="metric.weight"
                :min="1"
                :max="100"
                placeholder="权重%"
                style="width: 100%"
              >
                <template #suffix>% 权重</template>
              </el-input-number>
            </el-col>
          </el-row>
          <el-input
            v-model="metric.target"
            placeholder="量化目标及交付标准，如: 交付按时率>=98%，线上故障逃逸率为0"
            style="margin-top: 8px"
          />
        </div>

        <el-form-item label="备注说明" prop="remark" style="margin-top: 16px">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="2"
            placeholder="方案详细说明或评审注意事项（选填）"
          />
        </el-form-item>
      </el-form>
    </el-scrollbar>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="visible = false">取 消</el-button>
        <el-button type="primary" :loading="loading" @click="handleConfirm">
          提 交 保 存
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage, type FormInstance } from 'element-plus';
import { createPlanApi, updatePlanApi, PerformancePlanItem } from '@/api/performance';

const emit = defineEmits(['success']);

const visible = ref(false);
const loading = ref(false);
const isEdit = ref(false);
const editId = ref<number | null>(null);
const formRef = ref<FormInstance>();

interface MetricItem {
  key: string;
  name: string;
  type: string;
  weight: number;
  target: string;
}

const form = reactive({
  title: '',
  cycleType: 'QUARTERLY',
  startDate: '',
  endDate: '',
  weightSelf: 30,
  weightManager: 70,
  status: 'IN_PROGRESS',
  remark: '',
  metricsList: [] as MetricItem[],
});

const rules = {
  title: [{ required: true, message: '方案名称不能为空', trigger: 'blur' }],
  cycleType: [{ required: true, message: '请选择周期类型', trigger: 'change' }],
  startDate: [{ required: true, message: '请选择开始日期', trigger: 'change' }],
  endDate: [{ required: true, message: '请选择截止日期', trigger: 'change' }],
};

const handleWeightSelfChange = (val: number | undefined) => {
  if (val !== undefined && val >= 0 && val <= 100) {
    form.weightManager = 100 - val;
  }
};

const handleWeightManagerChange = (val: number | undefined) => {
  if (val !== undefined && val >= 0 && val <= 100) {
    form.weightSelf = 100 - val;
  }
};

const addMetric = () => {
  form.metricsList.push({
    key: `M${form.metricsList.length + 1}`,
    name: '',
    type: 'KPI',
    weight: 20,
    target: '',
  });
};

const removeMetric = (index: number) => {
  form.metricsList.splice(index, 1);
};

const open = (row?: PerformancePlanItem) => {
  if (row) {
    isEdit.value = true;
    editId.value = row.id;
    let list: MetricItem[] = [];
    try {
      if (row.metrics) {
        list = JSON.parse(row.metrics);
      }
    } catch {
      list = [];
    }
    if (list.length === 0) {
      list = [
        { key: 'M1', name: '核心交付', type: 'KPI', weight: 50, target: '重点任务交付率>=98%' },
        { key: 'M2', name: '团队协同', type: 'OKR', weight: 50, target: '高效协同支持与知识分享' },
      ];
    }
    Object.assign(form, {
      title: row.title,
      cycleType: row.cycleType,
      startDate: row.startDate,
      endDate: row.endDate,
      weightSelf: row.weightSelf,
      weightManager: row.weightManager,
      status: row.status,
      remark: row.remark || '',
      metricsList: list,
    });
  } else {
    isEdit.value = false;
    editId.value = null;
    Object.assign(form, {
      title: '',
      cycleType: 'QUARTERLY',
      startDate: '2026-04-01',
      endDate: '2026-06-30',
      weightSelf: 30,
      weightManager: 70,
      status: 'IN_PROGRESS',
      remark: '',
      metricsList: [
        { key: 'M1', name: '核心交付', type: 'KPI', weight: 40, target: '重点任务按时按质交付率>=98%' },
        { key: 'M2', name: '业务赋能', type: 'KPI', weight: 30, target: '客户与内部协同满意度>=95分' },
        { key: 'M3', name: '效能与创新', type: 'OKR', weight: 30, target: '技术沉淀、效率工具建设与最佳实践' },
      ],
    });
  }
  visible.value = true;
};

const handleConfirm = async () => {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    if (form.weightSelf + form.weightManager !== 100) {
      ElMessage.warning('自评权重与主管权重之和必须等于 100%');
      return;
    }

    loading.value = true;
    try {
      const payload = {
        title: form.title,
        cycleType: form.cycleType,
        startDate: form.startDate,
        endDate: form.endDate,
        weightSelf: form.weightSelf,
        weightManager: form.weightManager,
        status: form.status,
        remark: form.remark,
        metrics: JSON.stringify(form.metricsList),
      };

      if (isEdit.value && editId.value) {
        await updatePlanApi(editId.value, payload);
        ElMessage.success('考评方案已更新');
      } else {
        await createPlanApi(payload);
        ElMessage.success('考评方案创建成功');
      }
      visible.value = false;
      emit('success');
    } finally {
      loading.value = false;
    }
  });
};

defineExpose({ open });
</script>

<style scoped>
.dialog-scroll {
  padding-right: 6px;
}
.metric-card {
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 10px;
}
.metric-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.idx-badge {
  font-size: 12px;
  font-weight: 600;
  color: #3b82f6;
  background-color: #eff6ff;
  padding: 2px 8px;
  border-radius: 4px;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
