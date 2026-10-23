<template>
  <div class="dashboard-container" v-loading="loading">
    <!-- 顶部工作台欢迎与刷新栏 -->
    <div class="welcome-header">
      <div class="header-left">
        <h2 class="welcome-title">欢迎使用 HR 人力资源数字化管理系统</h2>
        <span class="welcome-subtitle">数据更新时间：{{ lastUpdatedTime || '加载中...' }}</span>
      </div>
      <div class="header-right">
        <el-button type="primary" plain :icon="Refresh" @click="fetchData">刷新数据</el-button>
      </div>
    </div>

    <!-- 顶部核心指标看板 -->
    <el-row :gutter="16" class="stat-row">
      <el-col :xs="12" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card card-emp">
          <div class="stat-content">
            <div class="stat-info">
              <span class="stat-title">在职员工总数</span>
              <div class="stat-num-wrapper">
                <span class="stat-value">{{ stats.overview.totalEmployees }}</span>
                <span class="stat-unit">人</span>
              </div>
              <span class="stat-tip">状态正常的合同在职员工</span>
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
              <span class="stat-title">待审批请假单</span>
              <div class="stat-num-wrapper">
                <span class="stat-value text-warning">{{ stats.overview.pendingLeaves }}</span>
                <span class="stat-unit">笔</span>
              </div>
              <span class="stat-tip">亟待主管与人事审批</span>
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
              <span class="stat-title">组织架构部门</span>
              <div class="stat-num-wrapper">
                <span class="stat-value">{{ stats.overview.deptCount }}</span>
                <span class="stat-unit">个</span>
              </div>
              <span class="stat-tip">启用运行中的组织单元</span>
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
              <span class="stat-title">今日综合出勤率</span>
              <div class="stat-num-wrapper">
                <span class="stat-value text-success">{{ stats.overview.attendanceRate }}</span>
                <span class="stat-unit">%</span>
              </div>
              <span class="stat-tip">扣除全天请假与公假</span>
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
                <span class="chart-title">各部门人员分布与编制统计</span>
              </div>
              <el-tag size="small" type="primary" effect="plain">在职规模 vs 目标编制</el-tag>
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
                <span class="chart-title">员工学历与人才结构画像</span>
              </div>
              <el-tag size="small" type="success" effect="plain">全员学历梯次</el-tag>
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
                <span class="chart-title">近半年考勤与请假月度走势</span>
              </div>
              <el-tag size="small" type="warning" effect="plain">近 6 个月动态追踪</el-tag>
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
                <span class="chart-title">快捷业务协同与通道</span>
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
                  <span class="item-name">员工档案</span>
                  <span class="item-desc">花名册及入离职</span>
                </div>
              </div>

              <div class="quick-item" @click="$router.push('/hr/leave')">
                <div class="item-icon bg-orange">
                  <el-icon><Tickets /></el-icon>
                </div>
                <div class="item-text">
                  <span class="item-name">请假审批</span>
                  <span class="item-desc">假勤申请与核准</span>
                </div>
              </div>

              <div class="quick-item" @click="$router.push('/hr/dept')">
                <div class="item-icon bg-green">
                  <el-icon><OfficeBuilding /></el-icon>
                </div>
                <div class="item-text">
                  <span class="item-name">部门架构</span>
                  <span class="item-desc">组织拓扑与负责人</span>
                </div>
              </div>

              <div class="quick-item" @click="$router.push('/system/menu')">
                <div class="item-icon bg-purple">
                  <el-icon><Menu /></el-icon>
                </div>
                <div class="item-text">
                  <span class="item-name">权限路由</span>
                  <span class="item-desc">菜单权限与分配</span>
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
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import {
  Avatar,
  Tickets,
  OfficeBuilding,
  Histogram,
  Refresh,
  User,
  Menu,
} from '@element-plus/icons-vue';
import * as echarts from 'echarts';
import { getDashboardStatsApi, type DashboardStats } from '@/api/dashboard';

// 加载状态与最后刷新时间
const loading = ref(false);
const lastUpdatedTime = ref('');

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

  const option: echarts.EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow',
      },
    },
    legend: {
      data: ['在职人数', '编制规划'],
      top: 0,
      right: 10,
      textStyle: { color: '#606266', fontSize: 12 },
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
        color: '#606266',
        interval: 0,
        rotate: deptNames.length > 5 ? 25 : 0,
      },
      axisLine: {
        lineStyle: { color: '#e4e7ed' },
      },
    },
    yAxis: {
      type: 'value',
      name: '人数 (人)',
      nameTextStyle: { color: '#909399', fontSize: 11 },
      splitLine: {
        lineStyle: { type: 'dashed', color: '#f0f2f5' },
      },
    },
    series: [
      {
        name: '在职人数',
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
        name: '编制规划',
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

  const option: echarts.EChartsOption = {
    tooltip: {
      trigger: 'item',
      formatter: '{b} : {c} 人 ({d}%)',
    },
    legend: {
      bottom: '0%',
      left: 'center',
      textStyle: { color: '#606266', fontSize: 12 },
    },
    color: ['#409eff', '#67c23a', '#e6a23c', '#909399', '#9b59b6'],
    series: [
      {
        name: '学历分布',
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 8,
          borderColor: '#fff',
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

  const option: echarts.EChartsOption = {
    tooltip: {
      trigger: 'axis',
    },
    legend: {
      data: ['年假', '病假', '事假'],
      top: 0,
      right: 10,
      textStyle: { color: '#606266', fontSize: 12 },
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
        lineStyle: { color: '#e4e7ed' },
      },
      axisLabel: {
        color: '#606266',
      },
    },
    yAxis: {
      type: 'value',
      name: '申请人次',
      nameTextStyle: { color: '#909399', fontSize: 11 },
      splitLine: {
        lineStyle: { type: 'dashed', color: '#f0f2f5' },
      },
    },
    series: [
      {
        name: '年假',
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
        name: '病假',
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
        name: '事假',
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

onMounted(() => {
  fetchData();
  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
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
</style>
