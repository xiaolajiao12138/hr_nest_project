import { useUserStore } from '@/stores/user';
import { Directive, DirectiveBinding } from 'vue';

export function usePermission() {
  const userStore = useUserStore();

  const hasPermission = (permission: string | string[]): boolean => {
    // 超级管理员放行
    if (userStore.roles.includes('admin')) {
      return true;
    }

    const perms = userStore.permissions || [];
    if (perms.includes('*')) {
      return true;
    }

    if (Array.isArray(permission)) {
      return permission.some((p) => perms.includes(p));
    }
    return perms.includes(permission);
  };

  return {
    hasPermission,
  };
}

// 按钮权限指令 v-hasPerm="['hr:employee:add']"
export const vHasPerm: Directive = {
  mounted(el: HTMLElement, binding: DirectiveBinding) {
    const { value } = binding;
    const { hasPermission } = usePermission();

    if (value) {
      const hasPerm = hasPermission(value);
      if (!hasPerm) {
        el.parentNode && el.parentNode.removeChild(el);
      }
    }
  },
};
