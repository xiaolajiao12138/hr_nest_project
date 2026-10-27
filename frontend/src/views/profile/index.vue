<template>
  <div class="profile-page-container">
    <el-row :gutter="20">
      <!-- 左侧：个人概览卡片 -->
      <el-col :xs="24" :sm="24" :md="8" :lg="7" :xl="6">
        <el-card class="user-profile-card" shadow="hover">
          <div class="card-banner"></div>

          <!-- 头像展示与互动区 -->
          <div class="avatar-wrapper">
            <div class="avatar-box" @click="openAvatarDialog">
              <el-avatar
                :key="profileData.avatar || 'main-avatar'"
                :size="100"
                :src="profileData.avatar || defaultAvatar"
                class="main-avatar"
              >
                <el-icon :size="50"><UserFilled /></el-icon>
              </el-avatar>
              <div class="avatar-mask">
                <el-icon><Camera /></el-icon>
                <span>更换头像</span>
              </div>
            </div>
            <div class="user-title-wrap">
              <h3 class="user-real-name">{{ profileData.realName || '未设置姓名' }}</h3>
              <p class="user-username">@{{ profileData.username }}</p>
            </div>
          </div>

          <!-- 部门与角色徽章 -->
          <div class="tags-row">
            <el-tag
              v-if="profileData.dept?.deptName"
              type="info"
              effect="plain"
              round
              class="dept-tag"
            >
              <el-icon><OfficeBuilding /></el-icon>
              <span>{{ profileData.dept.deptName }}</span>
            </el-tag>
            <el-tag
              v-for="role in profileData.roles"
              :key="role.id"
              :type="getRoleTagType(role.roleKey)"
              effect="light"
              round
              class="role-tag"
            >
              {{ role.roleName }}
            </el-tag>
          </div>

          <el-divider class="card-divider" />

          <!-- 个人基础属性信息列表 -->
          <div class="info-meta-list">
            <div class="info-item">
              <div class="item-label">
                <el-icon><User /></el-icon>
                <span>用户编号</span>
              </div>
              <div class="item-value">#{{ profileData.id }}</div>
            </div>

            <div class="info-item">
              <div class="item-label">
                <el-icon><Phone /></el-icon>
                <span>联系手机</span>
              </div>
              <div class="item-value">
                {{ profileData.phone || '未绑定手机号' }}
              </div>
            </div>

            <div class="info-item">
              <div class="item-label">
                <el-icon><Message /></el-icon>
                <span>安全邮箱</span>
              </div>
              <div class="item-value">
                {{ profileData.email || '未设置邮箱' }}
              </div>
            </div>

            <div class="info-item">
              <div class="item-label">
                <el-icon><CircleCheck /></el-icon>
                <span>账号状态</span>
              </div>
              <div class="item-value">
                <el-badge is-dot :type="profileData.status === 1 ? 'success' : 'danger'" class="status-badge" />
                <span>{{ profileData.status === 1 ? '正常履职' : '已停用' }}</span>
              </div>
            </div>

            <div class="info-item">
              <div class="item-label">
                <el-icon><Timer /></el-icon>
                <span>创建时间</span>
              </div>
              <div class="item-value">
                {{ formatDate(profileData.createdAt) }}
              </div>
            </div>
          </div>

          <el-divider class="card-divider" />

          <!-- 安全健康度评分 -->
          <div class="security-score-box">
            <div class="score-header">
              <span class="score-title">账户安全评级</span>
              <span class="score-badge" :class="securityLevelClass">{{ securityLevelText }}</span>
            </div>
            <el-progress
              :percentage="securityPercentage"
              :color="securityColor"
              :stroke-width="8"
              :show-text="false"
              class="score-bar"
            />
            <p class="score-tip">{{ securityTip }}</p>
          </div>
        </el-card>
      </el-col>

      <!-- 右侧：多标签操作与设置 -->
      <el-col :xs="24" :sm="24" :md="16" :lg="17" :xl="18">
        <el-card class="operate-card" shadow="hover">
          <el-tabs v-model="activeTab" class="profile-tabs">
            <!-- 标签 1: 基本资料修改 -->
            <el-tab-pane label="基本资料" name="basic">
              <div class="tab-pane-content">
                <div class="pane-alert-tip">
                  <el-icon><InfoFilled /></el-icon>
                  <span>请填写真实、有效的个人办公信息，该信息将用于公司内部业务协同与日常通知。</span>
                </div>

                <el-form
                  ref="profileFormRef"
                  :model="profileForm"
                  :rules="profileRules"
                  label-width="100px"
                  label-position="right"
                  class="profile-form"
                  status-icon
                >
                  <el-form-item label="登录账号">
                    <el-input
                      :value="profileData.username"
                      disabled
                      placeholder="登录账号"
                    >
                      <template #prefix>
                        <el-icon><Lock /></el-icon>
                      </template>
                      <template #append>
                        <el-tooltip content="企业账号为唯一登录凭证，不支持自行修改，如需变更请联系系统管理员" placement="top">
                          <el-icon><QuestionFilled /></el-icon>
                        </el-tooltip>
                      </template>
                    </el-input>
                  </el-form-item>

                  <el-form-item label="真实姓名" prop="realName">
                    <el-input
                      v-model="profileForm.realName"
                      placeholder="请输入真实姓名"
                      maxlength="20"
                      show-word-limit
                      clearable
                    >
                      <template #prefix>
                        <el-icon><User /></el-icon>
                      </template>
                    </el-input>
                  </el-form-item>

                  <el-form-item label="联系手机" prop="phone">
                    <el-input
                      v-model="profileForm.phone"
                      placeholder="请输入 11 位手机号码"
                      maxlength="11"
                      clearable
                    >
                      <template #prefix>
                        <el-icon><Iphone /></el-icon>
                      </template>
                    </el-input>
                  </el-form-item>

                  <el-form-item label="安全邮箱" prop="email">
                    <el-input
                      v-model="profileForm.email"
                      placeholder="请输入电子邮箱地址"
                      maxlength="50"
                      clearable
                    >
                      <template #prefix>
                        <el-icon><Message /></el-icon>
                      </template>
                    </el-input>
                  </el-form-item>

                  <el-form-item label="所属部门">
                    <el-input
                      :value="profileData.dept?.deptName || '未分配部门'"
                      disabled
                    >
                      <template #prefix>
                        <el-icon><OfficeBuilding /></el-icon>
                      </template>
                    </el-input>
                  </el-form-item>

                  <el-form-item label="所属角色">
                    <div class="roles-display-box">
                      <el-tag
                        v-for="role in profileData.roles"
                        :key="role.id"
                        :type="getRoleTagType(role.roleKey)"
                        class="mr-2"
                      >
                        {{ role.roleName }}
                      </el-tag>
                      <span v-if="!profileData.roles?.length" class="text-gray-400">暂无角色</span>
                    </div>
                  </el-form-item>

                  <el-form-item>
                    <el-button
                      type="primary"
                      :loading="savingProfile"
                      @click="handleSaveProfile"
                    >
                      <el-icon class="mr-1"><Check /></el-icon>
                      保存更改
                    </el-button>
                    <el-button @click="resetProfileForm">
                      <el-icon class="mr-1"><Refresh /></el-icon>
                      重置
                    </el-button>
                  </el-form-item>
                </el-form>
              </div>
            </el-tab-pane>

            <!-- 标签 2: 安全设置（修改密码） -->
            <el-tab-pane label="安全设置" name="security">
              <div class="tab-pane-content">
                <div class="pane-alert-tip warning-tip">
                  <el-icon><WarningFilled /></el-icon>
                  <span>为了保障企业信息安全，建议定期更换密码。新密码长度建议在 6-30 个字符，包含字母与数字。</span>
                </div>

                <el-form
                  ref="pwdFormRef"
                  :model="pwdForm"
                  :rules="pwdRules"
                  label-width="100px"
                  label-position="right"
                  class="profile-form"
                  status-icon
                >
                  <el-form-item label="原旧密码" prop="oldPassword">
                    <el-input
                      v-model="pwdForm.oldPassword"
                      type="password"
                      placeholder="请输入当前正在使用的旧密码"
                      show-password
                      clearable
                      autocomplete="off"
                    >
                      <template #prefix>
                        <el-icon><Key /></el-icon>
                      </template>
                    </el-input>
                  </el-form-item>

                  <el-form-item label="全新密码" prop="newPassword">
                    <el-input
                      v-model="pwdForm.newPassword"
                      type="password"
                      placeholder="请输入 6-30 位全新登录密码"
                      show-password
                      clearable
                      autocomplete="off"
                      @input="handleNewPasswordInput"
                    >
                      <template #prefix>
                        <el-icon><Lock /></el-icon>
                      </template>
                    </el-input>

                    <!-- 密码强度实时指示条 -->
                    <div v-if="pwdForm.newPassword" class="pwd-strength-bar">
                      <div class="strength-labels">
                        <span>密码强度:</span>
                        <span :class="pwdStrengthClass">{{ pwdStrengthText }}</span>
                      </div>
                      <div class="strength-cells">
                        <div class="strength-cell" :class="{ active: pwdStrengthScore >= 1, weak: pwdStrengthScore === 1 }"></div>
                        <div class="strength-cell" :class="{ active: pwdStrengthScore >= 2, medium: pwdStrengthScore === 2 }"></div>
                        <div class="strength-cell" :class="{ active: pwdStrengthScore >= 3, strong: pwdStrengthScore >= 3 }"></div>
                      </div>
                    </div>
                  </el-form-item>

                  <el-form-item label="确认新密码" prop="confirmPassword">
                    <el-input
                      v-model="pwdForm.confirmPassword"
                      type="password"
                      placeholder="请再次输入全新密码"
                      show-password
                      clearable
                      autocomplete="off"
                    >
                      <template #prefix>
                        <el-icon><CircleCheck /></el-icon>
                      </template>
                    </el-input>
                  </el-form-item>

                  <el-form-item>
                    <el-button
                      type="danger"
                      :loading="savingPwd"
                      @click="handleSavePassword"
                    >
                      <el-icon class="mr-1"><Check /></el-icon>
                      提交修改密码
                    </el-button>
                    <el-button @click="resetPwdForm">
                      <el-icon class="mr-1"><Refresh /></el-icon>
                      清空输入
                    </el-button>
                  </el-form-item>
                </el-form>
              </div>
            </el-tab-pane>

            <!-- 标签 3: 操作日志审计 -->
            <el-tab-pane label="操作日志" name="logs">
              <div class="tab-pane-content">
                <div class="pane-header-actions">
                  <span class="pane-subtitle">近期系统操作痕迹（仅展示个人账号发起的操作记录）</span>
                  <el-button size="small" :loading="loadingLogs" @click="fetchUserLogs">
                    <el-icon class="mr-1"><Refresh /></el-icon>
                    刷新日志
                  </el-button>
                </div>

                <el-table
                  v-loading="loadingLogs"
                  :data="logList"
                  border
                  stripe
                  class="log-table"
                  empty-text="暂无近期操作日志"
                >
                  <el-table-column prop="title" label="系统模块" min-width="120" show-overflow-tooltip />
                  <el-table-column prop="businessType" label="操作类型" width="100" align="center">
                    <template #default="{ row }">
                      <el-tag size="small" :type="getLogTagType(row.businessType)">
                        {{ row.businessType || 'OTHER' }}
                      </el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column prop="requestMethod" label="请求方式" width="90" align="center">
                    <template #default="{ row }">
                      <span class="font-mono text-xs">{{ row.requestMethod }}</span>
                    </template>
                  </el-table-column>
                  <el-table-column prop="operIp" label="操作主机 IP" min-width="130" />
                  <el-table-column prop="status" label="状态" width="85" align="center">
                    <template #default="{ row }">
                      <el-tag size="small" :type="row.status === 1 ? 'success' : 'danger'">
                        {{ row.status === 1 ? '成功' : '失败' }}
                      </el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column prop="costTime" label="耗时" width="90" align="center">
                    <template #default="{ row }">
                      <span>{{ row.costTime ? `${row.costTime}ms` : '-' }}</span>
                    </template>
                  </el-table-column>
                  <el-table-column prop="operTime" label="操作时间" min-width="170">
                    <template #default="{ row }">
                      {{ formatDateTime(row.operTime) }}
                    </template>
                  </el-table-column>
                </el-table>

                <!-- 分页 -->
                <div class="pagination-box">
                  <el-pagination
                    v-model:current-page="logPage"
                    v-model:page-size="logPageSize"
                    :total="logTotal"
                    :page-sizes="[10, 20, 50]"
                    layout="total, prev, pager, next"
                    size="small"
                    @current-change="fetchUserLogs"
                    @size-change="fetchUserLogs"
                  />
                </div>
              </div>
            </el-tab-pane>
          </el-tabs>
        </el-card>
      </el-col>
    </el-row>

    <!-- 头像更换弹窗 -->
    <el-dialog
      v-model="avatarDialogVisible"
      title="更换个人头像"
      width="560px"
      append-to-body
      destroy-on-close
      class="avatar-dialog"
    >
      <div class="avatar-dialog-body">
        <el-tabs v-model="avatarTab">
          <!-- 上传本地文件 -->
          <el-tab-pane label="本地图片上传" name="upload">
            <div class="avatar-upload-area">
              <el-upload
                class="avatar-uploader"
                drag
                action=""
                :auto-upload="false"
                :show-file-list="false"
                :on-change="handleAvatarFileChange"
                accept="image/jpeg,image/png,image/webp,image/gif"
              >
                <div v-if="previewAvatarUrl" class="preview-uploaded-box">
                  <img :src="previewAvatarUrl" class="preview-uploaded-img" alt="头像预览" />
                  <p class="re-upload-text">点击或拖拽重新选择</p>
                </div>
                <div v-else class="upload-placeholder">
                  <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
                  <div class="el-upload__text">
                    将图片拖到此处，或 <em>点击选择本地图片</em>
                  </div>
                </div>
                <template #tip>
                  <div class="el-upload__tip">
                    支持 JPG/PNG/WEBP/GIF 格式图片，文件大小建议在 2MB 以内
                  </div>
                </template>
              </el-upload>
            </div>
          </el-tab-pane>

          <!-- 推荐系统预设商务头像 -->
          <el-tab-pane label="企业预设商务头像" name="preset">
            <div class="preset-avatar-grid">
              <div
                v-for="(url, idx) in presetAvatars"
                :key="idx"
                class="preset-item"
                :class="{ selected: selectedPresetUrl === url }"
                @click="selectedPresetUrl = url"
              >
                <el-avatar :size="72" :src="url" />
                <div v-if="selectedPresetUrl === url" class="selected-badge">
                  <el-icon><Check /></el-icon>
                </div>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="avatarDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="uploadingAvatar" @click="handleConfirmAvatar">
            确认更换
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/stores/user';
import {
  getUserProfileApi,
  updateUserProfileApi,
  updateUserPasswordApi,
  getUserProfileLogsApi,
  uploadAvatarApi,
  type UserProfile,
} from '@/api/profile';
import {
  User,
  UserFilled,
  Phone,
  Iphone,
  Message,
  OfficeBuilding,
  CircleCheck,
  Timer,
  Lock,
  Key,
  Check,
  Refresh,
  Camera,
  QuestionFilled,
  InfoFilled,
  WarningFilled,
  UploadFilled,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules, type UploadFile } from 'element-plus';

const router = useRouter();
const userStore = useUserStore();

// 默认高保真职场头像（本地高可用矢量，零外网依赖）
const defaultAvatar = '/avatars/avatar-1.svg';

// 预设企业职场头像库 (6款各具特色的企业级矢量商务形象，支持离线/内网与高可用)
const presetAvatars = [
  '/avatars/avatar-1.svg',
  '/avatars/avatar-2.svg',
  '/avatars/avatar-3.svg',
  '/avatars/avatar-4.svg',
  '/avatars/avatar-5.svg',
  '/avatars/avatar-6.svg',
];

// 当前标签页
const activeTab = ref('basic');

// 个人资料数据模型
const profileData = ref<UserProfile>({
  id: 0,
  username: '',
  realName: '',
  phone: '',
  email: '',
  avatar: '',
  status: 1,
  createdAt: '',
  dept: null,
  roles: [],
});

// 表单引用
const profileFormRef = ref<FormInstance>();
const pwdFormRef = ref<FormInstance>();

// 编辑基本资料表单
const profileForm = reactive({
  realName: '',
  phone: '',
  email: '',
});

// 保存中状态
const savingProfile = ref(false);

// 校验规则
const profileRules = reactive<FormRules>({
  realName: [
    { required: true, message: '真实姓名不能为空', trigger: 'blur' },
    { min: 2, max: 20, message: '姓名长度在 2 到 20 个字符之间', trigger: 'blur' },
  ],
  phone: [
    { required: true, message: '手机号码不能为空', trigger: 'blur' },
    {
      pattern: /^1[3-9]\d{9}$/,
      message: '请输入正确的11位大陆手机号码',
      trigger: 'blur',
    },
  ],
  email: [
    { required: true, message: '电子邮箱不能为空', trigger: 'blur' },
    {
      type: 'email',
      message: '请输入规范的电子邮箱格式（如 user@example.com）',
      trigger: 'blur',
    },
  ],
});

// 修改密码表单
const pwdForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
});
const savingPwd = ref(false);

// 密码一致性校验器
const validateConfirmPwd = (_rule: any, value: string, callback: any) => {
  if (!value) {
    callback(new Error('请再次输入新密码'));
  } else if (value !== pwdForm.newPassword) {
    callback(new Error('两次输入的新密码不一致，请仔细核对'));
  } else {
    callback();
  }
};

const validateNewPwd = (_rule: any, value: string, callback: any) => {
  if (!value) {
    callback(new Error('新密码不能为空'));
  } else if (value.length < 6 || value.length > 30) {
    callback(new Error('密码长度需在 6 到 30 个字符之间'));
  } else if (pwdForm.oldPassword && value === pwdForm.oldPassword) {
    callback(new Error('新密码不能与原旧密码相同'));
  } else {
    if (pwdForm.confirmPassword) {
      pwdFormRef.value?.validateField('confirmPassword');
    }
    callback();
  }
};

const pwdRules = reactive<FormRules>({
  oldPassword: [
    { required: true, message: '请输入当前旧密码', trigger: 'blur' },
  ],
  newPassword: [
    { required: true, validator: validateNewPwd, trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, validator: validateConfirmPwd, trigger: 'blur' },
  ],
});

// 密码强度检测
const pwdStrengthScore = ref(0);
const handleNewPasswordInput = () => {
  const pwd = pwdForm.newPassword;
  if (!pwd) {
    pwdStrengthScore.value = 0;
    return;
  }
  let score = 0;
  if (pwd.length >= 6) score++;
  if (/[a-zA-Z]/.test(pwd) && /\d/.test(pwd)) score++;
  if (/[^a-zA-Z0-9]/.test(pwd) || pwd.length >= 10) score++;
  pwdStrengthScore.value = score;
};

const pwdStrengthText = computed(() => {
  switch (pwdStrengthScore.value) {
    case 1:
      return '弱（建议增加字母和数字组合）';
    case 2:
      return '中等（符合安全标准）';
    case 3:
      return '强（高度安全）';
    default:
      return '未输入';
  }
});

const pwdStrengthClass = computed(() => {
  switch (pwdStrengthScore.value) {
    case 1:
      return 'text-danger';
    case 2:
      return 'text-warning';
    case 3:
      return 'text-success';
    default:
      return '';
  }
});

// 账户安全度评分计算
const securityPercentage = computed(() => {
  let score = 40; // 基础账号存在
  if (profileData.value.phone) score += 30;
  if (profileData.value.email) score += 30;
  return Math.min(score, 100);
});

const securityLevelText = computed(() => {
  if (securityPercentage.value === 100) return '极高';
  if (securityPercentage.value >= 70) return '良好';
  return '中等';
});

const securityLevelClass = computed(() => {
  if (securityPercentage.value === 100) return 'badge-high';
  if (securityPercentage.value >= 70) return 'badge-medium';
  return 'badge-low';
});

const securityColor = computed(() => {
  if (securityPercentage.value === 100) return '#67C23A';
  if (securityPercentage.value >= 70) return '#409EFF';
  return '#E6A23C';
});

const securityTip = computed(() => {
  if (securityPercentage.value === 100) {
    return '已同时绑定安全手机与电子邮箱，账户防护级别极高。';
  }
  return '建议完善手机号码与电子邮箱，提升账号安全与重要通知接收能力。';
});

// 操作日志
const logList = ref<any[]>([]);
const logTotal = ref(0);
const logPage = ref(1);
const logPageSize = ref(10);
const loadingLogs = ref(false);

// 头像更换弹窗相关
const avatarDialogVisible = ref(false);
const avatarTab = ref('upload');
const previewAvatarUrl = ref('');
const selectedAvatarFile = ref<File | null>(null);
const selectedPresetUrl = ref('');
const uploadingAvatar = ref(false);

const openAvatarDialog = () => {
  if (previewAvatarUrl.value && previewAvatarUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(previewAvatarUrl.value);
  }
  previewAvatarUrl.value = '';
  selectedAvatarFile.value = null;
  selectedPresetUrl.value = profileData.value.avatar || presetAvatars[0];
  avatarDialogVisible.value = true;
};

const handleAvatarFileChange = (uploadFile: UploadFile) => {
  if (!uploadFile.raw) return;
  const isImage = uploadFile.raw.type.startsWith('image/');
  const isLt2M = uploadFile.raw.size / 1024 / 1024 < 2;

  if (!isImage) {
    ElMessage.error('上传头像图片只能是图片格式!');
    return;
  }
  if (!isLt2M) {
    ElMessage.error('上传头像图片大小不能超过 2MB!');
    return;
  }

  if (previewAvatarUrl.value && previewAvatarUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(previewAvatarUrl.value);
  }
  selectedAvatarFile.value = uploadFile.raw;
  previewAvatarUrl.value = URL.createObjectURL(uploadFile.raw);
};

// 确认更换头像
const handleConfirmAvatar = async () => {
  let newAvatarUrl = '';
  if (avatarTab.value === 'upload') {
    if (!selectedAvatarFile.value) {
      ElMessage.warning('请先选择要上传的本地头像图片');
      return;
    }
    try {
      uploadingAvatar.value = true;
      const res: any = await uploadAvatarApi(selectedAvatarFile.value);
      newAvatarUrl = res.fileUrl || res.filePath;
    } catch (err: any) {
      ElMessage.error(err.message || '头像上传失败');
      uploadingAvatar.value = false;
      return;
    }
  } else {
    // 预设头像
    if (!selectedPresetUrl.value) {
      ElMessage.warning('请选择一个预设头像');
      return;
    }
    newAvatarUrl = selectedPresetUrl.value;
  }

  try {
    uploadingAvatar.value = true;
    await updateUserProfileApi({ avatar: newAvatarUrl });

    // 1. 本地响应式状态即时更新
    profileData.value.avatar = newAvatarUrl;

    // 2. 同步全局 User Store 状态与本地存储
    userStore.updateUserProfile({ avatar: newAvatarUrl });

    // 3. 权威刷新全局用户信息、个人中心档案以及操作审计日志
    await userStore.getInfo();
    await fetchProfileData();
    await fetchUserLogs();

    ElMessage.success('头像更换成功！');

    // 4. 清理预览资源并关闭弹窗
    if (previewAvatarUrl.value && previewAvatarUrl.value.startsWith('blob:')) {
      URL.revokeObjectURL(previewAvatarUrl.value);
    }
    previewAvatarUrl.value = '';
    selectedAvatarFile.value = null;
    avatarDialogVisible.value = false;
  } catch (err: any) {
    ElMessage.error(err.message || '更换头像失败');
  } finally {
    uploadingAvatar.value = false;
  }
};

// 获取个人中心数据
const fetchProfileData = async () => {
  try {
    const res: any = await getUserProfileApi();
    profileData.value = res;
    profileForm.realName = res.realName || '';
    profileForm.phone = res.phone || '';
    profileForm.email = res.email || '';
  } catch (err: any) {
    ElMessage.error(err.message || '获取个人资料失败');
  }
};

// 保存个人资料
const handleSaveProfile = async () => {
  if (!profileFormRef.value) return;
  await profileFormRef.value.validate(async (valid) => {
    if (!valid) return;
    try {
      savingProfile.value = true;
      await updateUserProfileApi({
        realName: profileForm.realName.trim(),
        phone: profileForm.phone.trim(),
        email: profileForm.email.trim(),
      });

      profileData.value.realName = profileForm.realName.trim();
      profileData.value.phone = profileForm.phone.trim();
      profileData.value.email = profileForm.email.trim();

      // 实时同步更新全局 User Store 与顶部 Header
      userStore.updateUserProfile({
        realName: profileForm.realName.trim(),
        phone: profileForm.phone.trim(),
        email: profileForm.email.trim(),
      });

      ElMessage.success('个人基本资料修改成功');
    } catch (err: any) {
      ElMessage.error(err.message || '更新个人资料失败');
    } finally {
      savingProfile.value = false;
    }
  });
};

// 重置表单
const resetProfileForm = () => {
  profileForm.realName = profileData.value.realName || '';
  profileForm.phone = profileData.value.phone || '';
  profileForm.email = profileData.value.email || '';
  profileFormRef.value?.clearValidate();
};

// 提交修改密码
const handleSavePassword = async () => {
  if (!pwdFormRef.value) return;
  await pwdFormRef.value.validate(async (valid) => {
    if (!valid) return;
    try {
      savingPwd.value = true;
      await updateUserPasswordApi({
        oldPassword: pwdForm.oldPassword,
        newPassword: pwdForm.newPassword,
      });

      ElMessageBox.alert(
        '登录密码修改成功！为了保障企业数据安全，请使用新密码重新登录系统。',
        '安全提示',
        {
          confirmButtonText: '确定并重新登录',
          type: 'success',
          showClose: false,
          callback: () => {
            userStore.logout();
            router.push('/login');
          },
        },
      );
    } catch (err: any) {
      ElMessage.error(err.message || '修改密码失败，请核对原密码');
    } finally {
      savingPwd.value = false;
    }
  });
};

const resetPwdForm = () => {
  pwdForm.oldPassword = '';
  pwdForm.newPassword = '';
  pwdForm.confirmPassword = '';
  pwdStrengthScore.value = 0;
  pwdFormRef.value?.clearValidate();
};

// 获取操作日志
const fetchUserLogs = async () => {
  try {
    loadingLogs.value = true;
    const res: any = await getUserProfileLogsApi({
      page: logPage.value,
      pageSize: logPageSize.value,
    });
    logList.value = res.list || [];
    logTotal.value = res.total || 0;
  } catch (err: any) {
    ElMessage.error(err.message || '获取操作日志失败');
  } finally {
    loadingLogs.value = false;
  }
};

// 格式化日期辅助
const formatDate = (dateStr?: string) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatDateTime = (dateStr?: string) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// 角色 Tag 样式
const getRoleTagType = (roleKey?: string) => {
  if (roleKey === 'admin') return 'danger';
  if (roleKey?.includes('manager')) return 'warning';
  if (roleKey?.includes('hr')) return 'success';
  return 'primary';
};

// 日志业务类型 Tag
const getLogTagType = (type?: string) => {
  switch (type) {
    case 'INSERT':
      return 'success';
    case 'UPDATE':
      return 'warning';
    case 'DELETE':
      return 'danger';
    case 'LOGIN':
      return 'info';
    default:
      return '';
  }
};

onMounted(() => {
  fetchProfileData();
  fetchUserLogs();
});
</script>

<style scoped>
.profile-page-container {
  padding: 20px;
  min-height: calc(100vh - 84px);
  background-color: #f5f7fa;
}

/* 左侧概览卡片 */
.user-profile-card {
  border-radius: 8px;
  overflow: hidden;
  border: none;
  background: #ffffff;
  position: relative;
}

.user-profile-card :deep(.el-card__body) {
  padding: 0 20px 24px 20px;
}

.card-banner {
  height: 90px;
  margin: 0 -20px;
  background: linear-gradient(135deg, #1890ff 0%, #36cfc9 100%);
  border-radius: 8px 8px 0 0;
}

.avatar-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: -50px;
}

.avatar-box {
  position: relative;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  cursor: pointer;
  border: 4px solid #ffffff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  overflow: hidden;
}

.main-avatar {
  background-color: #e6f7ff;
  color: #1890ff;
  width: 100%;
  height: 100%;
}

.avatar-mask {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.55);
  color: #ffffff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.25s ease;
}

.avatar-box:hover .avatar-mask {
  opacity: 1;
}

.user-title-wrap {
  text-align: center;
  margin-top: 12px;
}

.user-real-name {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #1f2d3d;
}

.user-username {
  margin: 4px 0 0 0;
  font-size: 13px;
  color: #909399;
}

.tags-row {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.dept-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.card-divider {
  margin: 18px 0;
}

/* 基础信息列表 */
.info-meta-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.info-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
}

.item-label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #606266;
}

.item-label .el-icon {
  font-size: 16px;
  color: #909399;
}

.item-value {
  font-weight: 500;
  color: #303133;
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-badge {
  margin-right: 4px;
}

/* 安全健康度评分 */
.security-score-box {
  background-color: #f8fafd;
  padding: 14px 16px;
  border-radius: 8px;
  border: 1px solid #eef2f8;
}

.score-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.score-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.score-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 12px;
}

.badge-high {
  background-color: #f0f9eb;
  color: #67c23a;
}

.badge-medium {
  background-color: #ecf5ff;
  color: #409eff;
}

.badge-low {
  background-color: #fdf6ec;
  color: #e6a23c;
}

.score-bar {
  margin-bottom: 8px;
}

.score-tip {
  margin: 0;
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}

/* 右侧操作卡片 */
.operate-card {
  border-radius: 8px;
  border: none;
  background: #ffffff;
  min-height: 580px;
}

.profile-tabs :deep(.el-tabs__item) {
  font-size: 15px;
  font-weight: 500;
  height: 48px;
  line-height: 48px;
}

.tab-pane-content {
  padding: 12px 10px;
}

.pane-alert-tip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background-color: #edf6ff;
  border-radius: 6px;
  color: #1d72dd;
  font-size: 13px;
  margin-bottom: 24px;
  border: 1px solid #d4e8fe;
}

.warning-tip {
  background-color: #fef8ee;
  color: #e6a23c;
  border: 1px solid #faeccd;
}

.profile-form {
  max-width: 620px;
}

.roles-display-box {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* 密码强度条 */
.pwd-strength-bar {
  margin-top: 8px;
  width: 100%;
}

.strength-labels {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}

.text-danger {
  color: #f56c6c;
  font-weight: 600;
}

.text-warning {
  color: #e6a23c;
  font-weight: 600;
}

.text-success {
  color: #67c23a;
  font-weight: 600;
}

.strength-cells {
  display: flex;
  gap: 6px;
  height: 6px;
}

.strength-cell {
  flex: 1;
  background-color: #ebeef5;
  border-radius: 3px;
  transition: background-color 0.3s ease;
}

.strength-cell.active.weak {
  background-color: #f56c6c;
}

.strength-cell.active.medium {
  background-color: #e6a23c;
}

.strength-cell.active.strong {
  background-color: #67c23a;
}

/* 日志板块 */
.pane-header-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.pane-subtitle {
  font-size: 13px;
  color: #909399;
}

.log-table {
  width: 100%;
  margin-top: 10px;
}

.pagination-box {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

/* 头像更换弹窗 */
.avatar-dialog-body {
  padding: 10px 0;
}

.avatar-upload-area {
  display: flex;
  justify-content: center;
  padding: 20px 0;
}

.avatar-uploader :deep(.el-upload-dragger) {
  width: 360px;
  padding: 30px;
}

.preview-uploaded-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.preview-uploaded-img {
  width: 110px;
  height: 110px;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
}

.re-upload-text {
  margin: 0;
  font-size: 13px;
  color: #409eff;
}

.preset-avatar-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  justify-items: center;
  padding: 20px 10px;
}

.preset-item {
  position: relative;
  cursor: pointer;
  padding: 4px;
  border-radius: 50%;
  transition: transform 0.2s, box-shadow 0.2s;
}

.preset-item:hover {
  transform: scale(1.08);
}

.preset-item.selected {
  outline: 3px solid #409eff;
  outline-offset: 2px;
}

.selected-badge {
  position: absolute;
  right: 0;
  bottom: 0;
  background-color: #409eff;
  color: #ffffff;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}
</style>
