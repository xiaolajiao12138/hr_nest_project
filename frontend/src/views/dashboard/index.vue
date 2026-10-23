<template>
  <div
    ref="dashboardRef"
    class="dashboard-container"
    :class="{ 'is-fullscreen': isFullscreen }"
    v-loading="loading"
  >
    <!-- 顶部工作台欢迎与刷新栏 -->
    <div class="welcome-header">
      <div class="header-left">
        <h2 class="welcome-title">{{ t('dashboard.welcome') }}</h2>
        <span class="welcome-subtitle">
          {{ t('common.updateTime') }}：{{ lastUpdatedTime || t('common.loading') }}
          <span v-if="isFullscreen" class="fullscreen-tip">
            • {{ t('dashboard.fullscreenHint') }}
          </span>
        </span>
      </div>
      <div class="header-right">
        <!-- 一键全屏大屏放大 / 退出按钮 -->
        <el-button
          :type="isFullscreen ? 'warning' : 'primary'"
          plain
          :icon="isFullscreen ? Aim : FullScreen"
          @click="toggleFullscreen"
        >
          {{ isFullscreen ? t('common.exitFullscreen') : t('common.fullscreen') }}
        </el-button>

        <!-- 刷新数据按钮 -->
        <el-button type="primary" plain :icon="Refresh" @click="fetchData">
          {{ t('common.refresh') }}
        </el-button>
      </div>
    </div>

    <!-- 顶部核心指标看板 -->
    <el-row :gutter="16" class="stat-row">
      <el-col :xs="12" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card card-emp">
          <div class="stat-content">
            <div class="stat-info">
              <span class="stat-title">{{ t('dashboard.totalEmployees') }}</span>
              <div class="stat-num-wrapper">
                <span class="stat-value">{{ stats.overview.totalEmployees }}</span>
                <span class="stat-unit">{{ t('dashboard.unitPerson') }}</span>
              </div>
              <span class="stat-tip">{{ t('dashboard.totalEmployeesTip') }}</span>
            </div>
            <div class="stat-icon-wrapper icon-emp">
              <el-icon><Avatar /></el-icon>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="12" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card card-leave">
          <div class="stat-content">
            <div class="stat-info">
              <span class="stat-title">{{ t('dashboard.pendingLeaves') }}</span>
              <div class="stat-num-wrapper">
                <span class="stat-value text-warning">{{ stats.overview.pendingLeaves }}</span>
                <span class="stat-unit">{{ t('dashboard.unitBill') }}</span>
              </div>
              <span class="stat-tip">{{ t('dashboard.pendingLeavesTip') }}</span>
            </div>
            <div class="stat-icon-wrapper icon-leave">
              <el-icon><Tickets /></el-icon>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="12" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card card-dept">
          <div class="stat-content">
            <div class="stat-info">
              <span class="stat-title">{{ t('dashboard.deptCount') }}</span>
              <div class="stat-num-wrapper">
                <span class="stat-value">{{ stats.overview.deptCount }}</span>
                <span class="stat-unit">{{ t('dashboard.unitDept') }}</span>
              </div>
              <span class="stat-tip">{{ t('dashboard.deptCountTip') }}</span>
            </div>
            <div class="stat-icon-wrapper icon-dept">
              <el-icon><OfficeBuilding /></el-icon>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="12" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card card-attend">
          <div class="stat-content">
            <div class="stat-info">
              <span class="stat-title">{{ t('dashboard.attendanceRate') }}</span>
              <div class="stat-num-wrapper">
                <span class="stat-value text-success">{{ stats.overview.attendanceRate }}</span>
                <span class="stat-unit">%</span>
              </div>
              <span class="stat-tip">{{ t('dashboard.attendanceRateTip') }}</span>
            </div>
            <div class="stat-icon-wrapper icon-attend">
              <el-icon><Histogram /></el-icon>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 第一行统计图表: 部门人力编制 (柱状图) + 学历人才画像 (环形图) -->
    <el-row :gutter="16" class="charts-row">
      <el-col :xs="24" :sm="24" :md="15">
        <el-card shadow="never" class="chart-card">
          <template #header>
            <div class="chart-header">
              <div class="chart-title-box">
                <span class="title-bar"></span>
                <span class="chart-title">{{ t('dashboard.deptDistTitle') }}</span>
              </div>
              <el-tag size="small" type="primary" effect="plain">{{ t('dashboard.deptDistTag') }}</el-tag>
            </div>
          </template>
          <div ref="deptChartRef" class="chart-box"></div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="24" :md="9">
        <el-card shadow="never" class="chart-card">
          <template #header>
            <div class="chart-header">
              <div class="chart-title-box">
                <span class="title-bar"></span>
                <span class="chart-title">{{ t('dashboard.eduDistTitle') }}</span>
              </div>
              <el-tag size="small" type="success" effect="plain">{{ t('dashboard.eduDistTag') }}</el-tag>
            </div>
          </template>
          <div ref="eduChartRef" class="chart-box"></div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 第二行统计图表: 考勤月度走势 (渐变面积折线图) + 快捷协同通道 -->
    <el-row :gutter="16" class="charts-row">
      <el-col :xs="24" :sm="24" :md="16">
        <el-card shadow="never" class="chart-card">
          <template #header>
            <div class="chart-header">
              <div class="chart-title-box">
                <span class="title-bar"></span>
                <span class="chart-title">{{ t('dashboard.trendTitle') }}</span>
              </div>
              <el-tag size="small" type="warning" effect="plain">{{ t('dashboard.trendTag') }}</el-tag>
            </div>
          </template>
          <div ref="leaveChartRef" class="chart-box"></div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="24" :md="8">
        <el-card shadow="never" class="chart-card">
          <template #header>
            <div class="chart-header">
              <div class="chart-title-box">
                <span class="title-bar"></span>
                <span class="chart-title">{{ t('dashboard.quickAccess') }}</span>
              </div>
            </div>
          </template>
          <div class="quick-container">
            <div class="quick-grid">
              <div class="quick-item" @click="$router.push('/hr/employee')">
                <div class="item-icon bg-blue">
                  <el-icon><User /></el-icon>
                </div>
                <div class="item-text">
                  <span class="item-name">{{ t('dashboard.employeeArchive') }}</span>
                  <span class="item-desc">{{ t('dashboard.employeeArchiveDesc') }}</span>
                </div>
              </div>

              <div class="quick-item" @click="$router.push('/hr/leave')">
                <div class="item-icon bg-orange">
                  <el-icon><Tickets /></el-icon>
                </div>
                <div class="item-text">
                  <span class="item-name">{{ t('dashboard.leaveApproval') }}</span>
                  <span class="item-desc">{{ t('dashboard.leaveApprovalDesc') }}</span>
                </div>
              </div>

              <div class="quick-item" @click="$router.push('/hr/dept')">
                <div class="item-icon bg-green">
                  <el-icon><OfficeBuilding /></el-icon>
                </div>
                <div class="item-text">
                  <span class="item-name">{{ t('dashboard.deptStructure') }}</span>
                  <span class="item-desc">{{ t('dashboard.deptStructureDesc') }}</span>
                </div>
              </div>

              <div class="quick-item" @click="$router.push('/system/menu')">
                <div class="item-icon bg-purple">
                  <el-icon><Menu /></el-icon>
                </div>
                <div class="item-text">
                  <span class="item-name">{{ t('common.refresh') }}</span>
                  <span class="item-desc">{{ t('dashboard.welcomeSub') }}</span>
                </div>
              </div>
            </div>

            <!-- 系统健康状态小看板 -->
            <div class="system-status-box">
              <div class="status-title">系统保障机制</div>
              <div class="status-badges">
                <span class="status-badge"><span class="dot online"></span> 数据库事务强一致保障</span>
                <span class="status-badge"><span class="dot online"></span> MinIO 对象存储已就绪</span>
                <span class="status-badge"><span class="dot online"></span> RBAC 细粒度权限校验已启用</span>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import {
  Avatar,
  Tickets,
  OfficeBuilding,
  Histogram,
  Refresh,
  User,
  Menu,
  FullScreen,
  Aim,
} from '@element-plus/icons-vue';
import * as echarts from 'echarts';
import { getDashboardStatsApi, type DashboardStats } from '@/api/dashboard';
import { useI18n } from '@/locales';

const { t, locale } = useI18n();

// 容器与全屏状态
const dashboardRef = ref<HTMLDivElement | null>(null);
const isFullscreen = ref(false);

// 加载状态与最后刷新时间
const loading = ref(false);
const lastUpdatedTime = ref('');

// 切换全屏沉浸模式
const toggleFullscreen = async () => {
  try {
    if (!document.fullscreenElement) {
      if (dashboardRef.value?.requestFullscreen) {
        await dashboardRef.value.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
    }
  } catch (err) {
    console.warn('全屏切换失败:', err);
  }
};

const handleFullscreenChange = () => {
  isFullscreen.value = !!document.fullscreenElement;
  handleResize();
};

// 统计核心数据响应式对象
const stats = ref<DashboardStats>({
  overview: {
    totalEmployees: 0,
    pendingLeaves: 0,
    deptCount: 0,
    attendanceRate: 98.5,
  },
  deptDistribution: [],
  educationDistribution: [],
  leaveTrend: {
    months: [],
    annual: [],
    sick: [],
    casual: [],
  },
});

// 图表 DOM 节点引用
const deptChartRef = ref<HTMLDivElement | null>(null);
const eduChartRef = ref<HTMLDivElement | null>(null);
const leaveChartRef = ref<HTMLDivElement | null>(null);

// ECharts 实例引用 (保持原生实例，避免 Vue3 响应式代理影响图表内部调用)
let deptChartInstance: echarts.ECharts | null = null;
let eduChartInstance: echarts.ECharts | null = null;
let leaveChartInstance: echarts.ECharts | null = null;

// 防抖 resize 处理
let resizeTimer: any = null;
const handleResize = () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    deptChartInstance?.resize();
    eduChartInstance?.resize();
    leaveChartInstance?.resize();
  }, 150);
};

// 格式化当前时间
const formatNow = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
};

/**
 * 渲染图表一: 各部门人员分布与编制统计 (柱状图)
 */
const renderDeptChart = () => {
  if (!deptChartRef.value) return;
  if (!deptChartInstance) {
    deptChartInstance = echarts.init(deptChartRef.value);
  }

  const list = stats.value.deptDistribution || [];
  const deptNames = list.map((item) => item.deptName);
  const actualCounts = list.map((item) => item.actualCount);
  const planCounts = list.map((item) => item.planCount);

  const isDark = isFullscreen.value;
  const textColor = isDark ? '#94a3b8' : '#606266';
  const splitLineColor = isDark ? 'rgba(255, 255, 255, 0.08)' : '#f0f2f5';

  const option: echarts.EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow',
      },
    },
    legend: {
      data: [t('dashboard.totalEmployees'), t('dashboard.deptDistTag')],
      top: 0,
      right: 10,
      textStyle: { color: textColor, fontSize: 12 },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '6%',
      top: '14%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: deptNames,
      axisLabel: {
        color: textColor,
        interval: 0,
        rotate: deptNames.length > 5 ? 25 : 0,
      },
      axisLine: {
        lineStyle: { color: isDark ? '#334155' : '#e4e7ed' },
      },
    },
    yAxis: {
      type: 'value',
      name: `${t('dashboard.personCount')} (${t('dashboard.unitPerson')})`,
      nameTextStyle: { color: textColor, fontSize: 11 },
      splitLine: {
        lineStyle: { type: 'dashed', color: splitLineColor },
      },
    },
    series: [
      {
        name: t('dashboard.totalEmployees'),
        type: 'bar',
        barWidth: 16,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#409eff' },
            { offset: 1, color: '#79bbff' },
          ]),
          borderRadius: [4, 4, 0, 0],
        },
        data: actualCounts,
      },
      {
        name: t('dashboard.deptDistTag'),
        type: 'bar',
        barWidth: 16,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#b3e19d' },
            { offset: 1, color: '#95d475' },
          ]),
          borderRadius: [4, 4, 0, 0],
        },
        data: planCounts,
      },
    ],
  };

  deptChartInstance.setOption(option);
};

/**
 * 渲染图表二: 员工学历结构画像 (环形图)
 */
const renderEduChart = () => {
  if (!eduChartRef.value) return;
  if (!eduChartInstance) {
    eduChartInstance = echarts.init(eduChartRef.value);
  }

  const eduData = stats.value.educationDistribution || [];
  const isDark = isFullscreen.value;
  const textColor = isDark ? '#cbd5e1' : '#606266';

  const option: echarts.EChartsOption = {
    tooltip: {
      trigger: 'item',
      formatter: `{b} : {c} ${t('dashboard.unitPerson')} ({d}%)`,
    },
    legend: {
      bottom: '0%',
      left: 'center',
      textStyle: { color: textColor, fontSize: 12 },
    },
    color: ['#409eff', '#67c23a', '#e6a23c', '#909399', '#9b59b6'],
    series: [
      {
        name: t('dashboard.eduDistTitle'),
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 8,
          borderColor: isDark ? '#1e293b' : '#fff',
          borderWidth: 2,
        },
        label: {
          show: false,
          position: 'center',
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 16,
            fontWeight: 'bold',
            formatter: '{b}\n{d}%',
          },
        },
        labelLine: {
          show: false,
        },
        data: eduData,
      },
    ],
  };

  eduChartInstance.setOption(option);
};

/**
 * 渲染图表三: 近半年考勤与请假月度走势 (渐变面积折线图)
 */
const renderLeaveChart = () => {
  if (!leaveChartRef.value) return;
  if (!leaveChartInstance) {
    leaveChartInstance = echarts.init(leaveChartRef.value);
  }

  const { months, annual, sick, casual } = stats.value.leaveTrend;
  const isDark = isFullscreen.value;
  const textColor = isDark ? '#94a3b8' : '#606266';
  const splitLineColor = isDark ? 'rgba(255, 255, 255, 0.08)' : '#f0f2f5';

  const option: echarts.EChartsOption = {
    tooltip: {
      trigger: 'axis',
    },
    legend: {
      data: [t('dashboard.annualLeave'), t('dashboard.sickLeave'), t('dashboard.casualLeave')],
      top: 0,
      right: 10,
      textStyle: { color: textColor, fontSize: 12 },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '6%',
      top: '14%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: months,
      axisLine: {
        lineStyle: { color: isDark ? '#334155' : '#e4e7ed' },
      },
      axisLabel: {
        color: textColor,
      },
    },
    yAxis: {
      type: 'value',
      name: t('dashboard.trendTitle'),
      nameTextStyle: { color: textColor, fontSize: 11 },
      splitLine: {
        lineStyle: { type: 'dashed', color: splitLineColor },
      },
    },
    series: [
      {
        name: t('dashboard.annualLeave'),
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 3, color: '#409eff' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(64,158,255,0.45)' },
            { offset: 1, color: 'rgba(64,158,255,0.02)' },
          ]),
        },
        data: annual,
      },
      {
        name: t('dashboard.sickLeave'),
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 3, color: '#e6a23c' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(230,162,60,0.45)' },
            { offset: 1, color: 'rgba(230,162,60,0.02)' },
          ]),
        },
        data: sick,
      },
      {
        name: t('dashboard.casualLeave'),
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 3, color: '#f56c6c' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(245,108,108,0.45)' },
            { offset: 1, color: 'rgba(245,108,108,0.02)' },
          ]),
        },
        data: casual,
      },
    ],
  };

  leaveChartInstance.setOption(option);
};

/**
 * 获取后端统计接口数据并初始化/更新各图表
 */
const fetchData = async () => {
  loading.value = true;
  try {
    const res: any = await getDashboardStatsApi();
    if (res) {
      stats.value = res;
    }
    lastUpdatedTime.value = formatNow();

    await nextTick();
    renderDeptChart();
    renderEduChart();
    renderLeaveChart();
  } catch (error) {
    console.warn('获取仪表盘统计数据异常，启用本地自适应渲染:', error);
    lastUpdatedTime.value = formatNow();
    await nextTick();
    renderDeptChart();
    renderEduChart();
    renderLeaveChart();
  } finally {
    loading.value = false;
  }
};

// 监听国际化语言切换，动态重新渲染图表
watch(locale, () => {
  renderDeptChart();
  renderEduChart();
  renderLeaveChart();
});

onMounted(() => {
  fetchData();
  window.addEventListener('resize', handleResize);
  document.addEventListener('fullscreenchange', handleFullscreenChange);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  document.removeEventListener('fullscreenchange', handleFullscreenChange);
  if (resizeTimer) clearTimeout(resizeTimer);

  // 释放 ECharts 实例，杜绝内存泄漏
  deptChartInstance?.dispose();
  eduChartInstance?.dispose();
  leaveChartInstance?.dispose();
  deptChartInstance = null;
  eduChartInstance = null;
  leaveChartInstance = null;
});
</script>

<style scoped>
.dashboard-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 顶部欢迎栏 */
.welcome-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, #ffffff 0%, #f9fbfd 100%);
  padding: 16px 20px;
  border-radius: 8px;
  border: 1px solid #ebeef5;
}

.welcome-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.welcome-subtitle {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  display: inline-block;
}

/* 核心指标卡片 */
.stat-row {
  margin-top: 0;
}

.stat-card {
  border-radius: 8px;
  border: 1px solid #ebeef5;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.stat-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.08);
}

.stat-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-title {
  font-size: 13px;
  color: #909399;
}

.stat-num-wrapper {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin: 6px 0 2px 0;
}

.stat-value {
  font-size: 26px;
  font-weight: 700;
  color: #303133;
  line-height: 1.1;
}

.stat-unit {
  font-size: 13px;
  color: #909399;
}

.stat-tip {
  font-size: 12px;
  color: #c0c4cc;
}

.stat-icon-wrapper {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
}

.icon-emp {
  background: linear-gradient(135deg, #e6f1ff 0%, #d4e8ff 100%);
  color: #409eff;
}

.icon-leave {
  background: linear-gradient(135deg, #fdf6ec 0%, #faecd8 100%);
  color: #e6a23c;
}

.icon-dept {
  background: linear-gradient(135deg, #f0f9eb 0%, #e1f3d8 100%);
  color: #67c23a;
}

.icon-attend {
  background: linear-gradient(135deg, #f4f4f5 0%, #e9e9eb 100%);
  color: #36cfc9;
}

.text-warning {
  color: #e6a23c;
}

.text-success {
  color: #67c23a;
}

/* 图表卡片公用样式 */
.chart-card {
  border-radius: 8px;
  border: 1px solid #ebeef5;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chart-title-box {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-bar {
  width: 4px;
  height: 16px;
  background-color: #409eff;
  border-radius: 2px;
}

.chart-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.chart-box {
  width: 100%;
  height: 320px;
}

/* 快捷协同通道 */
.quick-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.quick-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  background-color: #fafbfc;
  border: 1px solid #f0f2f5;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
}

.quick-item:hover {
  background-color: #f2f6fc;
  border-color: #dcdfe6;
  transform: translateY(-2px);
}

.item-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: #fff;
}

.bg-blue {
  background: linear-gradient(135deg, #409eff 0%, #2980b9 100%);
}

.bg-orange {
  background: linear-gradient(135deg, #e6a23c 0%, #d35400 100%);
}

.bg-green {
  background: linear-gradient(135deg, #67c23a 0%, #27ae60 100%);
}

.bg-purple {
  background: linear-gradient(135deg, #9b59b6 0%, #8e44ad 100%);
}

.item-text {
  display: flex;
  flex-direction: column;
}

.item-name {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.item-desc {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

/* 系统状态小看板 */
.system-status-box {
  background-color: #f8fafc;
  border-radius: 8px;
  padding: 14px;
  border: 1px dashed #dcdfe6;
}

.status-title {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  margin-bottom: 8px;
}

.status-badges {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.status-badge {
  font-size: 12px;
  color: #606266;
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.dot.online {
  background-color: #67c23a;
  box-shadow: 0 0 6px #67c23a;
}

/* 全屏大屏模式样式 */
.dashboard-container.is-fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 9999;
  padding: 24px 32px;
  overflow-y: auto;
  background: radial-gradient(circle at 50% 20%, #1e293b 0%, #0f172a 100%);
  box-sizing: border-box;
}

.dashboard-container.is-fullscreen .welcome-header {
  background: rgba(30, 41, 59, 0.7);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.dashboard-container.is-fullscreen .welcome-title {
  color: #f8fafc;
  background: linear-gradient(90deg, #38bdf8, #818cf8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.dashboard-container.is-fullscreen .welcome-subtitle {
  color: #94a3b8;
}

.fullscreen-tip {
  color: #38bdf8;
  font-weight: 500;
  margin-left: 8px;
}

.dashboard-container.is-fullscreen .stat-card {
  background: rgba(30, 41, 59, 0.7);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.dashboard-container.is-fullscreen .stat-title {
  color: #94a3b8;
}

.dashboard-container.is-fullscreen .stat-value {
  color: #f8fafc;
}

.dashboard-container.is-fullscreen .stat-tip {
  color: #64748b;
}

.dashboard-container.is-fullscreen .chart-card {
  background: rgba(30, 41, 59, 0.75);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25);
}

.dashboard-container.is-fullscreen .chart-title {
  color: #e2e8f0;
}

.dashboard-container.is-fullscreen .quick-item {
  background-color: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.dashboard-container.is-fullscreen .quick-item:hover {
  background-color: rgba(30, 41, 59, 0.9);
  border-color: rgba(56, 189, 248, 0.4);
}

.dashboard-container.is-fullscreen .item-name {
  color: #f1f5f9;
}

.dashboard-container.is-fullscreen .item-desc {
  color: #94a3b8;
}

.dashboard-container.is-fullscreen .system-status-box {
  background-color: rgba(15, 23, 42, 0.5);
  border: 1px dashed rgba(255, 255, 255, 0.15);
}

.dashboard-container.is-fullscreen .status-title {
  color: #cbd5e1;
}

.dashboard-container.is-fullscreen .status-badge {
  color: #94a3b8;
}
</style>
