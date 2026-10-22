<template>
  <div class="dashboard-container">
    <!-- 统计卡片 -->
    <el-row :gutter="16">
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-info">
              <span class="stat-title">在职员工数</span>
              <span class="stat-value">128 人</span>
            </div>
            <el-icon class="stat-icon emp-icon"><Avatar /></el-icon>
          </div>
        </el-card>
      </el-col>

      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-info">
              <span class="stat-title">待审批请假</span>
              <span class="stat-value text-warning">3 笔</span>
            </div>
            <el-icon class="stat-icon leave-icon"><Tickets /></el-icon>
          </div>
        </el-card>
      </el-col>

      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-info">
              <span class="stat-title">组织部门数</span>
              <span class="stat-value">6 个</span>
            </div>
            <el-icon class="stat-icon dept-icon"><OfficeBuilding /></el-icon>
          </div>
        </el-card>
      </el-col>

      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-info">
              <span class="stat-title">今日出勤率</span>
              <span class="stat-value text-success">98.5%</span>
            </div>
            <el-icon class="stat-icon attend-icon"><Histogram /></el-icon>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 系统环境与架构特性卡片 -->
    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :span="16">
        <el-card header="系统核心特性与架构保障" shadow="never">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="动态路由架构">
              数据库 sys_menu 表驱动，前端不写死路由清单，角色权限动态加载
            </el-descriptions-item>
            <el-descriptions-item label="事务与强一致性">
              员工批量导入全量回滚、请假申请扣减年假强事务原子化
            </el-descriptions-item>
            <el-descriptions-item label="对象存储服务">
              MinIO 独立桶环境隔离 (local/test/prod)，支持预签名与流式预览
            </el-descriptions-item>
            <el-descriptions-item label="Excel 服务">
              基于 exceljs，逐行校验事务回滚，分页流式大数据导出杜绝 OOM
            </el-descriptions-item>
            <el-descriptions-item label="多环境隔离">
              Local (热重载/Docker) / Test (迁移脚本) / Prod (安全头/限流/脱敏)
            </el-descriptions-item>
            <el-descriptions-item label="公共代码复用">
              BaseService 通用 CRUD、BaseTable、BaseUpload、BaseImportExcel
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>

      <el-col :span="8">
        <el-card header="快捷业务入口" shadow="never">
          <div class="quick-links">
            <el-button type="primary" plain @click="$router.push('/hr/employee')">
              员工档案管理
            </el-button>
            <el-button type="warning" plain @click="$router.push('/hr/leave')">
              请假审批办理
            </el-button>
            <el-button type="success" plain @click="$router.push('/hr/dept')">
              部门架构设置
            </el-button>
            <el-button type="info" plain @click="$router.push('/system/menu')">
              动态路由维护
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { Avatar, Tickets, OfficeBuilding, Histogram } from '@element-plus/icons-vue';
</script>

<style scoped>
.dashboard-container {
  display: flex;
  flex-direction: column;
}
.stat-card {
  border-radius: 8px;
}
.stat-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.stat-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.stat-title {
  font-size: 13px;
  color: #909399;
}
.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: #303133;
}
.text-warning {
  color: #e6a23c;
}
.text-success {
  color: #67c23a;
}
.stat-icon {
  font-size: 42px;
  padding: 10px;
  border-radius: 8px;
}
.emp-icon {
  background-color: #ecf5ff;
  color: #409eff;
}
.leave-icon {
  background-color: #fdf6ec;
  color: #e6a23c;
}
.dept-icon {
  background-color: #f0f9eb;
  color: #67c23a;
}
.attend-icon {
  background-color: #f4f4f5;
  color: #909399;
}
.quick-links {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
</style>
