import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import compression from 'vite-plugin-compression'
import fs from 'node:fs'
import path from 'node:path'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    compression(),
    {
      name: 'spa-fallback',
      closeBundle() {
        const dist = path.resolve(__dirname, 'dist')
        fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, '404.html'))
      },
    },
    {
      name: 'appendix-save',
      configureServer(server) {
        // POST /__appendix-save  →  直接写 src/data/appendix/<file>
        server.middlewares.use('/__appendix-save', (req, res) => {
          if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
          let body = ''
          req.on('data', (chunk: Buffer) => { body += chunk.toString() })
          req.on('end', () => {
            try {
              const { file, content } = JSON.parse(body) as { file: string; content: string }
              const filePath = path.resolve(__dirname, 'src/data/appendix', path.basename(file))
              fs.writeFileSync(filePath, content, 'utf-8')
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: true }))
            } catch (e: any) {
              res.statusCode = 400
              res.end(JSON.stringify({ ok: false, error: e.message }))
            }
          })
        })
      },
    },
  ],
  base: process.env.CF_PAGES ? '/' : '/iceberg_reforged/',
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
