<script setup lang="ts">
import { ref, computed } from 'vue'
// 直接引入冰山數據
import raw from '../data/iceberg.json'

interface IcebergItem {
  id: string
  title: string
  category: string
  tags?: string[]
  desc?: string
  link?: string
}

// -------------------------------------------------------------
// 數據處理引擎
// -------------------------------------------------------------
const tierOrder = raw.tierOrder || Object.keys(raw.tiers)
const tiers = computed(() => {
  return tierOrder.map((tierName, index) => {
    return {
      name: tierName,
      level: index + 1,
      // 前導零能增加機能感
      levelStr: (index + 1) < 10 ? `0${index + 1}` : `${index + 1}`,
      items: ((raw.tiers as any)[tierName] as IcebergItem[]).map(item => ({
        ...item,
        title: item.title.replace(/・/g, '/').replace(/「/g, '"').replace(/」/g, '"'),
        desc: item.desc?.replace(/・/g, '/').replace(/「/g, '"').replace(/」/g, '"')
      }))
    }
  })
})

const totalItems = computed(() => {
  return tiers.value.reduce((sum, tier) => sum + tier.items.length, 0)
})

const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八']
function toCN(n: number) { return CN[n] || String(n) }

// -------------------------------------------------------------
// 交互引擎：物理擴張式手風琴
// -------------------------------------------------------------
const activeItemId = ref<string | null>(null)
const alignRight = ref(false)

const toggleItem = (id: string, event: Event) => {
  if (activeItemId.value === id) {
    activeItemId.value = null
    return
  }
  activeItemId.value = id

  const target = event.currentTarget as HTMLElement
  if (target) {
    const rect = target.getBoundingClientRect()
    if (window.innerWidth - rect.left < 350) {
      alignRight.value = true
    } else {
      alignRight.value = false
    }
  }
}

// -------------------------------------------------------------
// 自適應數學引擎 (Adaptive Typography Engine)
// -------------------------------------------------------------
function getItemSpan(item: IcebergItem, index: number): Record<string,string> {
  const len = Math.max(1, item.title.length)
  
  // 1. 根據字數分配基礎的物理網格大小 (r: 行數, c: 列數)
  // 根据标题字数确定档位，每档有多个形状随机选择
  // 高/宽 ≤ 2，避免过度瘦高
  const shapes: [number, number][] =
    len > 14 ? [[4,6],[5,5],[3,7],[6,4],[5,6],[3,8]] :
    len > 11 ? [[4,5],[5,4],[3,6],[6,3],[5,5],[4,6]] :
    len > 9  ? [[3,5],[4,4],[3,6],[5,3],[4,5],[2,7]] :
    len > 7  ? [[3,4],[2,5],[3,5],[2,4],[4,3],[3,3],[2,6]] :
    len > 5  ? [[2,4],[3,3],[2,5],[1,4],[3,4],[2,3],[1,5]] :
    len > 3  ? [[1,3],[2,3],[2,2],[1,4],[3,2],[1,2]] :
               [[1,2],[1,3],[2,2],[2,3],[1,4]]
  const pick = shapes[index % shapes.length]
  const r = pick[0], c = pick[1]

  return {
    gridRowEnd: `span ${r}`,
    gridColumnEnd: `span ${c}`,
    '--r': r.toString(),
    '--c': c.toString(),
    '--len': len.toString()
  }
}
</script>

<template>
  <div class="brutalist-artbook-wrapper">
    
    <div class="raw-texture"></div>

    <header class="master-cover theme-dark">
      <div class="cover-meta font-sans">
        <span>ARCHIVE NO. 001</span>
        <span>{{ totalItems }} ENTRIES</span>
      </div>
      <h1 class="cover-title font-longcang">中文兔子洞冰山圖</h1>
      <div class="cover-rule"></div>
      <p class="cover-sub font-sans">CHINESE INTERNET RABBIT HOLES</p>
    </header>

    <main class="data-flow">
      <section
        v-for="(tier, index) in tiers"
        :key="tier.name"
        :id="'tier-' + index"
        class="tier-block"
        :class="index % 2 === 0 ? 'theme-light' : 'theme-dark'"
      >
        
        <div class="tier-hero">
          <h2 class="tier-hero-name font-longcang">层级{{ toCN(tier.level) }}</h2>
          <nav class="tier-nav font-sans">
            <a v-if="index > 0" :href="'#tier-' + (index - 1)" class="tier-nav-link">&uarr;</a>
            <a v-if="index < tiers.length - 1" :href="'#tier-' + (index + 1)" class="tier-nav-link">&darr;</a>
          </nav>
        </div>

        <div class="brutalist-matrix">
          
          <article
            v-for="(item, itemIndex) in tier.items"
            :key="item.id"
            class="matrix-item"
            :class="{ 'is-active': activeItemId === item.id }"
            :style="getItemSpan(item, itemIndex)"
          >
            <div class="item-trigger" @click="toggleItem(item.id, $event)">
              <h3 class="i-title font-longcang">
                {{ item.title }}
              </h3>
            </div>

            <div class="brutal-overlay-card" :class="{ 'is-align-right': alignRight }" v-show="activeItemId === item.id">
              <div class="overlay-inner">
                <p class="i-desc font-sans" v-if="item.desc">{{ item.desc }}</p>

                <div class="i-tags" v-if="item.tags && item.tags.length">
                  <span v-for="tag in item.tags" :key="tag" class="tag-box font-sans">#{{ tag }}</span>
                </div>

                <a v-if="item.link" :href="item.link" target="_blank" class="i-link font-sans">
                  ACCESS SOURCE ARCHIVE &nearr;
                </a>
              </div>
            </div>

          </article>
          
        </div>
      </section>
    </main>

    <footer class="master-footer theme-dark">
      <h1 class="footer-end font-sans">END OF ARCHIVE</h1>
      <p class="font-sans">SOURCE: rookieinvestigator/iceberg_reforged</p>
    </footer>

  </div>
</template>

<style scoped>
/* ========================================================================
  TYPOGRAPHY SYSTEM
======================================================================== */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;900&family=Long+Cang&display=swap');

.font-longcang {
  font-family: 'Long Cang', cursive;
  font-weight: 400;
}

.font-sans {
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
}

/* ================= 基礎重置 ================= */
.brutalist-artbook-wrapper {
  width: 100vw;
  min-height: 100vh;
  overflow-x: hidden;
  background: #000;
  -webkit-font-smoothing: antialiased;
}

.raw-texture {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  opacity: 0.05;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
}

/* ================= 主題反轉系統 ================= */
.theme-dark {
  background-color: #0a0a0a;
  color: #f4f4f0;
  --b-bg: #0a0a0a;
}
.theme-dark .matrix-item { border-top-color: rgba(255,255,255,0.2); }
.theme-dark .tag-box { border-color: #f4f4f0; }

.theme-light {
  background-color: #f4f4f0;
  color: #0a0a0a;
  --b-bg: #f4f4f0;
}
.theme-light .matrix-item { border-top-color: rgba(0,0,0,0.2); }
.theme-light .tag-box { border-color: #0a0a0a; }

/* ================= 全屏封面 ================= */
.master-cover {
  width: 100vw;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 2vw;
  box-sizing: border-box;
}

.cover-meta {
  display: flex;
  justify-content: space-between;
  font-size: 1.2rem;
  font-weight: 900;
  letter-spacing: 0.05em;
  border-bottom: 2px solid currentColor;
  padding-bottom: 1rem;
}

.cover-title {
  font-size: clamp(4rem, 22vw, 25rem);
  line-height: 1;
  margin: auto 0;
  text-align: center;
  white-space: nowrap;
}

.cover-rule {
  height: 4px;
  background-color: currentColor;
  margin-bottom: 1rem;
}

.cover-sub {
  font-size: clamp(1rem, 3vw, 2rem);
  font-weight: 900;
  letter-spacing: 0.1em;
  margin: 0;
  text-align: right;
}

/* ================= 層級區塊 ================= */
.tier-block {
  width: 100vw;
  padding: 5vw 2vw 10vw 2vw;
  box-sizing: border-box;
  border-bottom: 10px solid currentColor;
}

.data-flow {
  padding: 0;
}

.tier-hero {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 3vw;
  padding: 0.5rem 0;
  border-bottom: 2px solid currentColor;
}

.tier-hero-name {
  font-size: clamp(3rem, 15vw, 15rem);
  line-height: 1;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
}

.tier-nav-link {
  color: inherit;
  text-decoration: none;
  font-size: 2rem;
  font-weight: 900;
  margin-left: 1vw;
}

/* ================= 核心：彈性交錯矩陣網格 ================= */
.brutalist-matrix {
  display: grid;
  grid-template-columns: repeat(18, 1fr);
  grid-auto-rows: 5rem;
  grid-auto-flow: dense;
  gap: 0; 
}

/* 詞條容器 */
.matrix-item {
  border-top: 1px solid currentColor;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 0.8rem 1rem;
  position: relative;
  container-type: inline-size;
}

/* 交互觸發區 */
.item-trigger {
  cursor: pointer;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  z-index: 2;
  overflow: hidden;
  min-height: 0;
}

.item-meta {
  display: flex;
  justify-content: flex-start;
  padding-bottom: 0.5rem;
}

.i-cat {
  font-size: 0.75rem;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.8;
}

/* 龍藏體標題核心設定：
  1. 移除兩端對齊，回歸 text-align: left
  2. 保留 break-all，因為粗野主義不需要顧及語意斷行
*/
.i-title {
  margin: 0;
  line-height: 1.15;
  width: 100%;
  text-align: left;
  word-break: break-all;
  overflow-wrap: anywhere;
  transition: opacity 0.2s ease;

  --target-lines: max(1, calc(var(--r) * 1.1 - var(--c) * 0.12));
  --chars-per-line: calc(var(--len) / var(--target-lines));
  --size-w: calc((100cqi / var(--chars-per-line)) * 0.85);
  --avail-h: calc(var(--r) * 5rem - 3.5rem);
  --size-h: calc((var(--avail-h) / var(--target-lines)) / 1.15);

  font-size: max(12px, min(var(--size-w), var(--size-h), 65cqi));
}

.item-trigger:hover .i-title {
  opacity: 0.5;
}

/* 悬浮覆蓋卡片 */
.brutal-overlay-card {
  position: absolute;
  top: 100%;
  left: 0;
  width: min(80vw, 600px);
  background: var(--b-bg, #0a0a0a);
  border: 2px solid currentColor;
  padding: 2rem;
  z-index: 100;
  margin-top: 10px;
  max-height: 70vh;
  overflow-y: auto;
  scrollbar-width: none;
}

.brutal-overlay-card.is-align-right {
  left: auto;
  right: 0;
}

.brutal-overlay-card::-webkit-scrollbar { display: none; }

.overlay-inner {
  display: flex;
  flex-direction: column;
}

/* 描述文本也移除兩端對齊 */
.i-desc {
  font-size: 1rem;
  font-weight: 400;
  line-height: 1.8;
  margin: 0 0 1.5rem 0;
  text-align: left;
  overflow-wrap: anywhere;
}

.i-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.tag-box {
  font-size: 0.7rem;
  font-weight: 700;
  border: 1px solid;
  padding: 4px 8px;
  text-transform: uppercase;
}

.i-link {
  display: inline-block;
  font-size: 0.85rem;
  font-weight: 900;
  color: inherit;
  text-decoration: none;
  border-bottom: 2px solid currentColor;
  padding-bottom: 2px;
}

.i-link:hover { background-color: currentColor; }
.theme-dark .i-link:hover { color: #0a0a0a; }
.theme-light .i-link:hover { color: #f4f4f0; }

/* ================= 封底 ================= */
.master-footer {
  padding: 10vw 2vw;
  text-align: center;
}

.footer-end {
  font-size: clamp(3rem, 12vw, 15rem);
  line-height: 0.8;
  margin: 0 0 1rem;
  font-weight: 900;
  letter-spacing: -0.05em;
}

/* ================= 移動端降級 ================= */
@media (max-width: 768px) {
  .brutalist-matrix {
    grid-template-columns: 1fr;
    grid-auto-rows: minmax(5rem, auto);
  }

  .matrix-item {
    grid-column: 1 / -1 !important;
    grid-row: auto !important;
    padding: 1.5rem 1rem;
  }

  .i-title {
    font-size: 18cqi !important; 
  }
}
</style>