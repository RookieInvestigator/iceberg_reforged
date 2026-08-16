// Cloudflare Pages 构建收尾：把 iceberg-vue/dist 复制到仓库根 dist/
// CF Pages 的构建命令与输出目录仍指向仓库根（npm run build → dist/），
// 仓库根迁移后前端位于 iceberg-vue/，需要此 shim 保持根输出兼容。
import { cpSync, rmSync } from 'node:fs'

rmSync('dist', { recursive: true, force: true })
cpSync('iceberg-vue/dist', 'dist', { recursive: true })
