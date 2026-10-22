import { defineStore } from 'pinia';
import { RouteLocationNormalized } from 'vue-router';

export interface TagView {
  name?: string;
  path: string;
  title: string;
}

export const useTagsViewStore = defineStore('tagsView', {
  state: () => ({
    visitedViews: [] as TagView[],
  }),

  actions: {
    addView(view: RouteLocationNormalized) {
      if (!view.meta?.title || view.meta?.hidden) return;
      const exists = this.visitedViews.some((v) => v.path === view.path);
      if (!exists) {
        this.visitedViews.push({
          name: view.name as string,
          path: view.path,
          title: (view.meta.title as string) || '未命名',
        });
      }
    },

    delView(view: TagView) {
      const index = this.visitedViews.findIndex((v) => v.path === view.path);
      if (index > -1) {
        this.visitedViews.splice(index, 1);
      }
    },

    delOtherViews(view: TagView) {
      this.visitedViews = this.visitedViews.filter((v) => v.path === view.path);
    },

    delAllViews() {
      this.visitedViews = [];
    },
  },
});
