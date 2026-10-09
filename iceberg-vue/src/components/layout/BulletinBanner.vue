<script setup lang="ts">
// BulletinBanner：全站顶部的公告条（2026-10）。
//
// 为什么加：公告此前只藏在页脚「公告板」按钮后面，用户不主动点就完全不知道有公告 ——
// 等于没有公告系统。现在最新一条公告在进站时即可见（不因「已读」而隐藏，只有用户
// 手动关闭才让位，判定见 lib/bulletins.ts 的 shouldShowBanner）。
//
// 视觉：**逐条照抄 V2FilterBar 的吸顶小丸**，不新造样式 ——
//   外壳    = `.stuck .v2nav`（--v2-surface / --white-10 边 / --v2-r-lg / --v2-shadow-sm / --v2-blur）
//   标签    = `.v2nav-tool` 排版 + `.v2bar-dot` 圆点
//   日期    = `.v2nav-count`（tiny / 500 / white-30 / tabular-nums / .06em）
//   文字按钮 = `.v2nav-tool`（xs / 500 / white-45，hover white-90 + white-06，active scale(.94)）
//   标题    = `.v2nav-sugtitle` 排版（sm / white-70）
// 定位：跟随文档流（不 fixed、不 sticky），随页面滚走；z-index 5 高于液态背景，
// 低于页面内容（#iceberg-content 的 z-10）。
//
// 组件本身无状态：显示与否、关闭后记什么，全部由 AppShell 持有并传入 / 回传。
import { X } from '@lucide/vue'
import { useI18n } from '../../lib/useI18n'
import type { Bulletin } from '../../lib/bulletins'

defineProps<{ bulletin: Bulletin }>()
const emit = defineEmits<{ open: []; dismiss: [] }>()

const { t } = useI18n()
</script>

<template>
  <div class="bulletin-wrap">
    <div class="bulletin-banner" role="region" :aria-label="t('bulletinTitle')">
      <span class="bb-label"><span class="bb-dot" aria-hidden="true"></span>{{ t('bulletinLatest') }}</span>
      <button type="button" class="bb-open" @click="emit('open')">
        <span class="bb-date">{{ bulletin.date }}</span>
        <span class="bb-title">{{ bulletin.title }}</span>
      </button>
      <button type="button" class="bb-tool" @click="emit('open')">{{ t('viewAll') }}</button>
      <button type="button" class="bb-tool bb-tool-icon" :aria-label="t('close')" @click="emit('dismiss')">
        <X :size="14" :stroke-width="2" />
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 定位壳：只负责居中与离顶距离（跟随文档流，不固定也不吸顶）。
   z-index 5 必需：液态背景 .liquid-bg 是 fixed + z-index 0，页面根在 DOM 中位于本组件之后，
   不加层级会被整片盖住；5 高于背景、低于页面内容。 */
.bulletin-wrap {
  position: relative;
  z-index: 5;
  display: flex;
  justify-content: center;
  padding: calc(env(safe-area-inset-top, 0px) + 10px) 10px 0;
}

/* 外壳 —— 照抄 `.stuck .v2nav` */
.bulletin-banner {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  max-width: 52rem;
  min-height: 3rem;
  padding: 0.5rem 0.75rem;
  background: var(--v2-surface);
  border: 1px solid var(--white-10);
  border-radius: var(--v2-r-lg);
  box-shadow: var(--v2-shadow-sm);
  backdrop-filter: var(--v2-blur);
  -webkit-backdrop-filter: var(--v2-blur);
}

/* 标签 —— `.v2bar-h` 的字距 + `.v2bar-dot` 的圆点 */
.bb-label {
  flex: none;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: var(--font-tiny);
  font-weight: 500;
  letter-spacing: 0.12em;
  color: var(--white-45);
}
.bb-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-accent);
  flex: none;
}

/* 主体（日期 + 标题）—— 行本身是按钮，视觉沿用列表行 */
.bb-open {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  padding: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

/* 日期 —— 照抄 `.v2nav-count` */
.bb-date {
  flex: none;
  font-size: var(--font-tiny);
  font-weight: 500;
  color: var(--white-30);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.06em;
}

/* 标题 —— 照抄 `.v2nav-sugtitle` 的排版与单行省略 */
.bb-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-sm);
  color: var(--white-70);
  transition: color 0.2s;
}
.bb-open:hover .bb-title { color: var(--white-90); }

/* 文字按钮 —— 照抄 `.v2nav-tool` */
.bb-tool {
  flex: none;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.375rem 0.75rem;
  border-radius: 0.5rem;
  font-size: var(--font-xs);
  font-weight: 500;
  color: var(--white-45);
  transition: color 0.2s, background-color 0.2s, transform 0.12s ease;
  white-space: nowrap;
}
.bb-tool:hover { color: var(--white-90); background: var(--white-06); }
.bb-tool:active { transform: scale(0.94); }
.bb-tool-icon { padding: 0.375rem 0.5rem; }

/* 窄屏：日期让位，只留标题与两个按钮 */
@media (max-width: 640px) {
  .bulletin-wrap { padding: calc(env(safe-area-inset-top, 0px) + 8px) 8px 0; }
  .bulletin-banner { gap: 0.5rem; min-height: 2.75rem; padding: 0.4rem 0.6rem; }
  .bb-date { display: none; }
}
</style>
