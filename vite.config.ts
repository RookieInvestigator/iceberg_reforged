import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import compression from 'vite-plugin-compression'

export default defineConfig({
  plugins: [vue(), tailwindcss(), compression()],
  base: '/iceberg_reforged/',
  resolve: {
    alias: { '@': '/src' },
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
  build: {
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        manualChunks: {
          vue: ['vue', 'vue-router'],
          fuse: ['fuse.js'],
        },
      },
    },
  },
})
