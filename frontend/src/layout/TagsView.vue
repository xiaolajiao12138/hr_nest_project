<template>
  <div class="tags-view-container">
    <el-scrollbar class="tags-scrollbar">
      <div class="tags-wrapper">
        <router-link
          v-for="tag in visitedViews"
          :key="tag.path"
          :to="tag.path"
          class="tag-item"
          :class="{ active: isActive(tag) }"
        >
          <span>{{ tag.title }}</span>
          <el-icon
            v-if="!isAffix(tag)"
            class="close-icon"
            @click.prevent.stop="closeTag(tag)"
          >
            <Close />
          </el-icon>
        </router-link>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTagsViewStore, TagView } from '@/stores/tagsView';
import { Close } from '@element-plus/icons-vue';

const route = useRoute();
const router = useRouter();
const tagsViewStore = useTagsViewStore();

const visitedViews = computed(() => tagsViewStore.visitedViews);

const isActive = (tag: TagView) => {
  return tag.path === route.path;
};

const isAffix = (tag: TagView) => {
  return tag.path === '/dashboard';
};

const addTag = () => {
  if (route.name && route.meta?.title) {
    tagsViewStore.addView(route);
  }
};

const closeTag = (view: TagView) => {
  tagsViewStore.delView(view);
  if (isActive(view)) {
    toLastView();
  }
};

const toLastView = () => {
  const latestView = visitedViews.value.slice(-1)[0];
  if (latestView) {
    router.push(latestView.path);
  } else {
    router.push('/dashboard');
  }
};

watch(
  () => route.path,
  () => {
    addTag();
  },
);

onMounted(() => {
  // 默认固定工作台首页
  tagsViewStore.addView({
    path: '/dashboard',
    name: 'Dashboard',
    meta: { title: '工作台' },
  } as any);
  addTag();
});
</script>

<style scoped>
.tags-view-container {
  height: 34px;
  background-color: #fff;
  border-bottom: 1px solid #d8dce5;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05);
}
.tags-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 12px;
}
.tag-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  line-height: 26px;
  border: 1px solid #d8dce5;
  color: #495060;
  background: #fff;
  padding: 0 10px;
  font-size: 12px;
  border-radius: 3px;
  text-decoration: none;
  transition: all 0.2s;
}
.tag-item:hover {
  color: #409eff;
}
.tag-item.active {
  background-color: #409eff;
  color: #fff;
  border-color: #409eff;
}
.close-icon {
  font-size: 11px;
  border-radius: 50%;
  padding: 1px;
}
.close-icon:hover {
  background-color: rgba(0, 0, 0, 0.2);
}
</style>
