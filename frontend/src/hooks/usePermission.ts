import { useUserStore } from '@/stores/user';
import { Directive, DirectiveBinding, computed } from 'vue';

/**
 * 权限判断组合式函数
 */
export function usePermission() {
  const userStore = useUserStore();

  /**
   * 权威判断当前登录用户是否具备目标权限
   *
   * @param permission 权限字符或字符数组，如 'hr:employee:add' 或 ['hr:employee:add', 'hr:employee:edit']
   * @returns 是否具备权限
   */
  const hasPermission = (permission: string | string[]): boolean => {
    // 1. 超级管理员角色拥有全局通配特权
    if (userStore.roles && userStore.roles.includes('admin')) {
      return true;
    }

    const perms = userStore.permissions || [];
    // 2. 具备全局 '*' 权限标识放行
    if (perms.includes('*')) {
      return true;
    }

    // 3. 数组按“或 (OR)”关系比对，满足其一即放行
    if (Array.isArray(permission)) {
      return permission.some((p) => perms.includes(p));
    }
    return perms.includes(permission);
  };

  /**
   * 响应式权限判断计算属性（可在 template 中直接作为函数调用并自动追踪 userStore 变更）
   */
  const hasPerm = computed(() => {
    return (permission: string | string[]) => hasPermission(permission);
  });

  return {
    hasPermission,
    hasPerm,
  };
}

/**
 * 检查并动态设置 DOM 节点权限显隐状态
 */
function applyPermission(el: any, binding: DirectiveBinding) {
  const { value } = binding;
  const { hasPermission } = usePermission();

  if (value) {
    const has = hasPermission(value);
    if (!has) {
      if (el._prevDisplay === undefined) {
        el._prevDisplay = el.style.display || '';
      }
      el.style.display = 'none';
    } else {
      if (el._prevDisplay !== undefined) {
        el.style.display = el._prevDisplay;
      }
    }
  }
}

/**
 * 企业级按钮细粒度权限自定义指令 v-hasPerm="['hr:employee:add']"
 * 支持 mounted 初始计算与 updated 动态热更新，权限调整后无感自适应显隐
 */
export const vHasPerm: Directive = {
  mounted(el: HTMLElement, binding: DirectiveBinding) {
    applyPermission(el, binding);
  },
  updated(el: HTMLElement, binding: DirectiveBinding) {
    applyPermission(el, binding);
  },
};
