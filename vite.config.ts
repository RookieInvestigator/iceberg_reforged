import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import compression from 'vite-plugin-compression'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    compression(),
    {
      name: 'spa-fallback',
      closeBundle() {
        const fs = require('fs')
        const path = require('path')
        const dist = path.resolve(__dirname, 'dist')
        fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, '404.html'))
      },
    },
  ],
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
