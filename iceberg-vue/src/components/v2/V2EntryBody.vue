<script setup lang="ts">
// V2EntryBody（/v2 专用）：桌面卡与移动抽屉的共用内容区（审计 A1）。
// 标题 chrome 留在各自外壳（卡走 BaseModal 头、抽屉走标题按钮），此处从徽章行开始：
// 徽章 → 描述 → 外链/参考 → 关联 → 评论 → sticky 常驻动作条。
//
// 交互单实例由外壳 provide / 此处 inject（ENTRY_IA_KEY）：useEntryInteractions 在 setup
// 阶段即发网络请求，不可双调，也不适合当 prop 层层传。
// layout 只作为根元素 class 的开关，全部形态差异交给容器 CSS（.v2entry-body--*），
// 模板里不出现 isCard 三元。
import { computed, inject, ref, watch } from 'vue';
import { ExternalLink } from '@lucide/vue';
import { useI18n } from '../../lib/useI18n';
import { normalizeTags } from '../../lib/tags';
import type { EntryView } from '../../lib/iceberg/entryView';
import CommentPanel from '../items/CommentPanel.vue';
import EntryMetaBadges from './V2EntryMetaBadges.vue';
import EntryRelatedLinks from './V2RelatedLinks.vue';
import { REFERENCES_MAP_KEY, type ReferenceLink } from '../../lib/injectionKeys';
import { TRAIL_KEY, ENTRY_IA_KEY } from '../../lib/iceberg/v2/keys';

const props = defineProps<{
  item: EntryView
  layout: 'card' | 'sheet'
}>();
const emit = defineEmits<{
  navigate: [{ id: string; from?: string }]
  'comment-el': [el: HTMLElement | null]
}>();

const { t } = useI18n();

// 交互单实例：由外壳 provide（缺失即接线错误，直接抛错而非静默降级）
const ia = inject(ENTRY_IA_KEY)
if (!ia) throw new Error('[V2EntryBody] 缺少 ENTRY_IA_KEY：交互实例须由外壳 provide')
// 顶层解构（模板自动解包；解的是 inject 出来的对象引用，非 props，响应式链路完整）
// 这里只用评论区的开关与可用性；动作条已拆到 V2EntryActions，由外壳停靠在滚动区外
const { commentsOpen, supabaseReady } = ia

// A3：探索轨迹面包屑（栈来自 V2Interactivity；回跳走 navigate-from 复用统一入口）。
// 放 body 顶部，桌面卡与移动抽屉都有；超 4 环折叠为首 + … + 末，切词条复位。
const trailState = inject(TRAIL_KEY, null)
const trailRings = computed(() => trailState?.trail.value ?? [])
const trailCollapsed = ref(true)
watch(() => props.item.id, () => { trailCollapsed.value = true })
const visibleRings = computed(() => {
  const rings = trailRings.value
  if (!trailCollapsed.value || rings.length <= 4) return rings
  return [rings[0], ...rings.slice(-2)]
})
const showEllipsis = computed(() => trailCollapsed.value && trailRings.value.length > 4)

// 评论区元素由本区挂载，经 comment-el 交还外壳（外壳的 useEntryInteractions 单实例持有引用）
function setCommentEl(el: unknown) {
  emit('comment-el', el instanceof HTMLElement ? el : null)
}

const referencesMap = inject(REFERENCES_MAP_KEY, new Map<string, ReferenceLink[]>())
// 空结果复用同一常量，避免每次 computed 造新数组触发下游无谓更新
const NO_REFS: ReferenceLink[] = []
const refLinks = computed(() => referencesMap.get(props.item?.id || '') ?? NO_REFS)
const hasRelated = computed(
  () => (props.item?.related?.length ?? 0) + (props.item?.recommended?.length ?? 0) > 0,
)

// 标签归一化移出模板（原先每次渲染都跑一遍）
const tagList = computed(() => normalizeTags(props.item.tags))

// 描述留白自适应：短描述（<=100 字，约 1-3 行）上下保底 32px 呼吸空间；
// 长描述内容本身占空间，回归紧凑 16px。沿用 v1 原值，不改视觉。
const descSpacing = computed(() => ((props.item?.desc || '').length > 100 ? 'v2entry-desc--tight' : ''))
</script>

<template>
  <div class="v2entry-body" :class="`v2entry-body--${layout}`">
    <nav v-if="trailRings.length > 1" class="trail" :aria-label="t('trailNav')">
      <template v-for="(ring, i) in visibleRings" :key="ring.id">
        <span class="trail-sep" aria-hidden="true">›</span>
        <button
          v-if="showEllipsis && i === 1"
          type="button"
          class="trail-ring trail-ellipsis"
          :aria-label="t('trailExpand')"
          :title="t('trailExpand')"
          @click="trailCollapsed = false"
        >…</button>
        <button
          v-else-if="ring.id !== item.id"
          type="button"
          class="trail-ring"
          @click="emit('navigate', { id: ring.id, from: item.id })"
        >{{ ring.title }}</button>
        <span v-else class="trail-cur" aria-current="true">{{ ring.title }}</span>
      </template>
    </nav>

    <!-- 元信息徽章行（层级 / 分类 / 标签，术语表深链） -->
    <EntryMetaBadges
      class="v2entry-badges"
      :tier="item.tier"
      :category="item.category"
      :categoryColor="item.categoryColor"
      :tags="tagList"
    />

    <!-- 描述：核心阅读区（15px / 1.8 与 v1 对齐，属展示级例外，不收编进 5 阶梯） -->
    <p class="v2entry-desc" :class="[item.desc ? '' : 'v2entry-desc--empty', descSpacing]">
      {{ item.desc || t('noDescShort') }}
    </p>

    <!-- 链接：词条内容的延伸，与描述同区（弱化、无线分隔） -->
    <div v-if="item.link || refLinks.length" class="v2entry-links">
      <a v-if="item.link" :href="item.link" target="_blank" rel="noopener" class="v2entry-link">
        <ExternalLink :size="11" :stroke-width="2" />
        {{ t('openLink') }}
      </a>

      <div v-if="refLinks.length" class="v2entry-refs">
        <span class="v2entry-refs__label">{{ t('referenceLinks') }}</span>
        <ul class="v2entry-refs__list">
          <li v-for="(r, i) in refLinks" :key="i">
            <a :href="r.url" target="_blank" rel="noopener" class="v2entry-link">{{ r.label }}</a>
          </li>
        </ul>
      </div>
    </div>

    <!-- 拓展信息区：关联词条（跳板，沉底弱化） -->
    <div v-if="hasRelated" class="v2entry-sec v2entry-sec--related">
      <EntryRelatedLinks :layout="layout" :from="item.id" :related="item.related" :recommended="item.recommended" @navigate="emit('navigate', $event)" />
    </div>

    <!-- 参与区：评论区（v-if 受控：未展开时不渲染，下方不留空位） -->
    <div v-if="commentsOpen" :ref="setCommentEl" class="v2entry-sec">
      <CommentPanel v-if="supabaseReady" :itemId="item.id" :opened="commentsOpen" />
    </div>

  </div>
</template>

<style scoped>
/* ── 间距节奏 ──
 * 全部沿用 v1 原值，不在本次改动视觉：
 * 描述上下 32（长描述收为 16）；分区之间 12 / 6；动作条上 10；关联区落底 14（用 padding）。
 * 动作条恒为末块，统一吃掉原本散落在三个分区上的 -mb-4。
 * 注意：本容器是普通 block 流，相邻兄弟 margin 会折叠 —— 任何「加大间距」的改动
 * 若写在 margin-bottom 上都可能被折叠吃掉，需实测实得值。 */
/* card：modal-body 顶 24 + header 底 16 = 40 偏松，首个块回抽贴回标题。
   用 :first-child 而非固定给徽章 —— 有下潜链时上移的应是面包屑，徽章保持正常流；
   否则徽章的 -12 会吃掉面包屑的 8px 下间距并造成重叠。 */
.v2entry-body--card > :first-child { margin-top: -12px; }
/* 面包屑是细辅助行，比徽章多收 4px，免得与标题之间显得空 */
.v2entry-body--card > .trail:first-child { margin-top: -16px; }

.v2entry-desc {
  margin: 32px 0;
  /* 15px / 1.8 与 v1 一致：收进 5 阶梯会跳到 14 或 16，视觉变化过大，保留原值 */
  font-size: 15px;
  line-height: 1.8;
  white-space: pre-wrap;
  -webkit-font-smoothing: antialiased;
  color: var(--white-85);
}
/* 长描述内容本身占空间，回归紧凑 */
.v2entry-desc--tight { margin: 16px 0; }
.v2entry-desc--empty { color: var(--white-55); font-style: italic; }

/* 链接区：外链与参考组竖向堆叠，间距由 gap 统一，不再散落 mt-* */
.v2entry-links {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.v2entry-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-xs);
  color: var(--white-60);
  text-decoration: underline;
  text-underline-offset: 4px;
  text-decoration-color: var(--white-20);
  transition: color 0.15s, text-decoration-color 0.15s;
}
.v2entry-link:hover { color: var(--white-90); text-decoration-color: var(--white-50); }
.v2entry-refs__label {
  display: block;
  margin-bottom: 4px;
  font-size: var(--font-micro);
  font-weight: 700;
  text-transform: uppercase;
  /* 中文标签不需要 0.15em 那么松（那是为拉丁字母设计的），收到 0.08em */
  letter-spacing: 0.08em;
  color: var(--white-50);
}
.v2entry-refs__list {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;   /* 10px label 与 12px 链接混排时基线对齐 */
  column-gap: 16px;
  row-gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 分区（关联 / 评论）：原为两套（12/4 与 10/8），统一到 12/6 —— 各自仅差 2px，
   视觉几乎无感，但两区节奏一致 */
.v2entry-sec {
  margin-top: 12px;
  padding-top: 6px;
  border-top: 1px solid var(--white-05);
}
/* 关联区落底留白：推荐词条紧贴动作条顶边显得拥挤。
   用 padding-bottom 而非 margin-bottom —— margin 会与 .v2entry-actions 的
   margin-top:10px 折叠成 max()，加多少都吃掉大半（这是先前改到 12px 仍嫌紧的原因）。
   padding 不参与折叠，实得 = 14 + 10 = 24，比内部分隔线的 18（12 上边距 + 6 内边距）
   再拉开一档：动作条是常驻 chrome，与正文的分离应强于正文内部的分隔。 */
.v2entry-sec--related { padding-bottom: 6px; }
/* 相邻两分区（关联 → 评论）：评论展开时两区之间的留白由
   关联区落底 padding（6） + 上一区 margin-top 折叠（=0）= 6 决定，
   与原 .mt-3 的余量相近，不另设重叠抑制 —— 评论本身就是大块视觉。 */
/* 相邻两分区（关联 → 评论）：评论展开时两区之间的留白由
   关联区落底 padding（6） + 上一区 margin-top 折叠（=0）= 6 决定，
   与原 .mt-3 的余量相近，不另设重叠抑制 —— 评论本身就是大块视觉。 */

/* A3：探索轨迹面包屑 —— 刻意做弱：细字重（300）、低透明度、不抢正文。
   层次只靠透明度区分，不靠字重（原 700 过重）；不再显示「已下潜 N 跳」文字标签。
   分隔符与省略号是纯装饰，压到 --white-15/20；历史项 --white-30 为可点最低可辨档；
   当前项 --white-55 只比历史亮一档，hover 才升到 --white-70。 */
.trail {
  display: flex; align-items: baseline; flex-wrap: wrap;
  column-gap: 6px; row-gap: 2px;
  margin: 0 0 8px;
  font-size: var(--font-tiny);
  line-height: 1.6;
  font-weight: 300;
}
.trail-sep { color: var(--white-15); font-weight: 300; }
.trail-ring {
  background: none; border: none; cursor: pointer; padding: 0;
  font: inherit;
  color: var(--white-30); font-weight: 300; max-width: 140px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  transition: color 0.15s;
}
.trail-ring:hover { color: var(--white-70); text-decoration: underline; text-underline-offset: 3px; }
.trail-ellipsis { color: var(--white-20); letter-spacing: 0.1em; }
.trail-ellipsis:hover { color: var(--white-50); text-decoration: none; }
/* 当前所在环：只比历史项亮一档 */
.trail-cur {
  color: var(--white-55); font-weight: 300; max-width: 140px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* ── 末块回收：动作条已外迁到滚动区外的底栏，原「-mb-4 压缩末尾留白」的职责
 * 现在转给这里的「末尾块回收」：把 .modal-body 的 32px 底内边距减到 16px，
 * 与 v1 原版对齐（v1 在末尾分区上写 -mb-4）。
 * 用 .v2entry-links / .v2entry-sec 显式列出而不写 :last-child —— 描述本身
 * 的 32px 上下呼吸应当保留，不参与回收。 */
.v2entry-body--card > .v2entry-links:last-child,
.v2entry-body--card > .v2entry-sec:last-child { margin-bottom: -16px; }

@media (max-width: 640px) {
  /* 窄屏容器 padding 本就更小（header 底 12 + body 顶 16 = 28，桌面为 40），
     回抽量相应减半，否则内容会贴到标题 */
  .v2entry-body--card > :first-child { margin-top: -8px; }
  .v2entry-body--card > .trail:first-child { margin-top: -10px; }
  /* 窄屏纵向空间宝贵，描述上下留白各收一档 */
  .v2entry-desc { margin: 24px 0; }
  .v2entry-desc--tight { margin: 12px 0; }
}

</style>
