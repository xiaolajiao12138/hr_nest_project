import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      host: '0.0.0.0',
      open: false,
      proxy: {
        '/api': {
          target: env.VITE_API_BASE_URL || 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: mode !== 'production',
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('echarts')) {
                return 'echarts-vendor';
              }
              if (id.includes('element-plus')) {
                return 'element-plus-vendor';
              }
              if (id.includes('@element-plus/icons-vue')) {
                return 'element-icons-vendor';
              }
              if (
                id.includes('vue') ||
                id.includes('pinia') ||
                id.includes('vue-router') ||
                id.includes('axios')
              ) {
                return 'vue-core-vendor';
              }
              return 'common-vendor';
            }
          },
        },
      },
    },
  };
});
