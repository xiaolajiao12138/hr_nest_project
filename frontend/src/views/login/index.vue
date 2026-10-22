<template>
  <div class="login-wrapper">
    <div class="login-box">
      <div class="login-header">
        <el-icon :size="32" color="#409eff"><OfficeBuilding /></el-icon>
        <h2>企业级HR人事后台管理系统</h2>
        <p class="sub-title">Enterprise HR Personnel Management System</p>
      </div>

      <el-form
        ref="formRef"
        :model="loginForm"
        :rules="loginRules"
        size="large"
        class="login-form"
      >
        <el-form-item prop="username">
          <el-input
            v-model="loginForm.username"
            placeholder="请输入管理员账号"
            :prefix-icon="User"
            clearable
          />
        </el-form-item>

        <el-form-item prop="password">
          <el-input
            v-model="loginForm.password"
            type="password"
            placeholder="请输入登录密码"
            :prefix-icon="Lock"
            show-password
          />
        </el-form-item>

        <el-form-item prop="code">
          <div class="captcha-row">
            <el-input
              v-model="loginForm.code"
              placeholder="请输入4位数字验证码"
              maxlength="4"
              :prefix-icon="Key"
              style="flex: 1"
              @keyup.enter="handleLogin"
            />
            <div
              class="captcha-img"
              title="点击刷新验证码"
              @click="refreshCaptcha"
              v-html="captchaImg"
            />
          </div>
        </el-form-item>

        <el-button
          type="primary"
          :loading="loading"
          class="login-btn"
          @click="handleLogin"
        >
          登 录
        </el-button>
      </el-form>

      <div class="demo-accounts">
        <el-alert
          type="info"
          :closable="false"
          title="系统初始演示账号："
          description="超级管理员: admin / 123456  |  人事主管: hr_user / 123456"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { User, Lock, Key, OfficeBuilding } from '@element-plus/icons-vue';
import { ElMessage, FormInstance, FormRules } from 'element-plus';
import { getCaptchaApi } from '@/api/auth';
import { useUserStore } from '@/stores/user';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

const formRef = ref<FormInstance>();
const loading = ref(false);
const captchaImg = ref('');

const loginForm = reactive({
  username: 'admin',
  password: '',
  code: '',
  uuid: '',
});

const loginRules: FormRules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  code: [{ required: true, message: '请输入验证码', trigger: 'blur' }],
};

// 刷新图形验证码
const refreshCaptcha = async () => {
  try {
    const res: any = await getCaptchaApi();
    loginForm.uuid = res.uuid;
    // 接口返回 data:image/svg+xml;utf8,... 解码出 svg html
    captchaImg.value = decodeURIComponent(res.img.replace('data:image/svg+xml;utf8,', ''));
  } catch (e) {
    ElMessage.error('获取验证码失败，请检查后端运行状态');
  }
};

const handleLogin = async () => {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    loading.value = true;
    try {
      await userStore.login(loginForm);
      ElMessage.success('登录成功，正在加载系统权限与动态路由...');
      const redirect = (route.query.redirect as string) || '/';
      router.push(redirect);
    } catch (e: any) {
      refreshCaptcha();
    } finally {
      loading.value = false;
    }
  });
};

onMounted(() => {
  refreshCaptcha();
});
</script>

<style scoped>
.login-wrapper {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #2b3648 0%, #1f2735 100%);
}
.login-box {
  width: 440px;
  background: #ffffff;
  border-radius: 12px;
  padding: 40px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
}
.login-header {
  text-align: center;
  margin-bottom: 30px;
}
.login-header h2 {
  font-size: 20px;
  color: #303133;
  margin: 10px 0 6px 0;
}
.sub-title {
  font-size: 12px;
  color: #909399;
  margin: 0;
}
.login-form {
  margin-top: 10px;
}
.captcha-row {
  display: flex;
  gap: 12px;
  width: 100%;
}
.captcha-img {
  width: 120px;
  height: 40px;
  cursor: pointer;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.login-btn {
  width: 100%;
  margin-top: 10px;
  font-size: 16px;
  letter-spacing: 2px;
}
.demo-accounts {
  margin-top: 24px;
}
</style>
