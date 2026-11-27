<script setup lang="ts">
// V2EntryBody：桌面卡与移动抽屉的共用内容区。
// 标题 chrome 留在各自外壳（卡走 BaseModal 头、抽屉走标题按钮），此处从徽章行开始：
// 徽章 → 描述 → 外链/参考 → 关联 → 评论 → sticky 常驻动作条。
//
// 交互单实例由外壳 provide / 此处 inject（ENTRY_IA_KEY）：useEntryInteractions 在 setup
// 阶段即发网络请求，不可双调，也不适合当 prop 层层传。
// layout 只作为根元素 class 的开关，全部形态差异交给容器 CSS（.v2entry-body--*），
// 模板里不出现 isCard 三元。
import { computed, inject, ref, watch } from 'vue';
import { useStore } from '@nanostores/vue';
import { ExternalLink } from '@lucide/vue';
import { useI18n } from '../../lib/useI18n';
import { normalizeTags } from '../../lib/tags';
import type { EntryView } from '../../lib/iceberg/entryView';
import CommentPanel from '../items/CommentPanel.vue';
import EntryMarks from '../items/EntryMarks.vue';
import EntryMetaBadges from './V2EntryMetaBadges.vue';
import EntryRelatedLinks from './V2RelatedLinks.vue';
import EntryReading from './V2EntryReading.vue';
import RichText from '../ui/RichText.vue';
import { REFERENCES_MAP_KEY, READING_MAP_KEY, type ReferenceLink } from '../../lib/injectionKeys';
import type { ReadingRecord } from '../../lib/iceberg/appendix';
import { linkDisplay } from '../../lib/sourceLabel';
import { pickLinks } from '../../lib/iceberg/entryLinks';
import { CATEGORY_COLORS_KEY, DEFAULT_COLOR_KEY } from '../../lib/injectionKeys';
import { extraBadges } from '../../lib/iceberg/extraCategories';
import { TRAIL_KEY, ENTRY_IA_KEY } from '../../lib/iceberg/v2/keys';
import { showTrail } from '../../lib/settingsStore';

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

// 探索轨迹面包屑（栈由外壳提供；回跳走 navigate-from 复用统一入口）。
// 放 body 顶部，桌面卡与移动抽屉都有；超 4 环折叠为首 + … + 末，切词条复位。
const trailOn = useStore(showTrail);
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

// 推荐阅读书目副表：一行 = 某词条 → 一本书（同一本书可挂多个词条）
const readingMap = inject(READING_MAP_KEY, new Map<string, ReadingRecord[]>())
const NO_READING: ReadingRecord[] = []
const reading = computed(() => readingMap.get(props.item?.id || '') ?? NO_READING)

// 链接副表：role=main 可覆盖主链接（改 URL / 只改显示名），其余为附加参考链接
const picked = computed(() => pickLinks(props.item?.link, refLinks.value))
const mainLink = computed(() => {
  const m = picked.value.main
  return m ? { url: m.url, ...linkDisplay(m.label, m.url) } : null
})
const refItems = computed(() => picked.value.refs.map((r) => ({ url: r.url, d: linkDisplay(r.label, r.url) })))
const hasRelated = computed(
  () => (props.item?.related?.length ?? 0) + (props.item?.recommended?.length ?? 0) > 0,
)

// 多分类副表：副分类徽章（色源与筛选栏同源）
const categoryColors = inject(CATEGORY_COLORS_KEY, {} as Record<string, string>)
const defaultColor = inject(DEFAULT_COLOR_KEY, '#FFFFFF')
const extraCats = computed(() => extraBadges(props.item, categoryColors, defaultColor))

// 标签归一化移出模板（原先每次渲染都跑一遍）
const tagList = computed(() => normalizeTags(props.item.tags))

// 描述留白自适应：短描述（<=100 字，约 1-3 行）上下保底 32px 呼吸空间；
// 长描述内容本身占空间，收为紧凑 16px。
const descSpacing = computed(() => ((props.item?.desc || '').length > 100 ? 'v2entry-desc--tight' : ''))
</script>

<template>
  <div class="v2entry-body" :class="`v2entry-body--${layout}`">
    <nav v-if="trailOn && trailRings.length > 1" class="trail" :aria-label="t('trailNav')">
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
        ><MirrorText :text="ring.title" /></button>
        <span v-else class="trail-cur" aria-current="true"><MirrorText :text="ring.title" /></span>
      </template>
    </nav>

    <!-- 元信息徽章行（层级 / 分类 / 标签，术语表深链）；行尾挂标记图标（警示 / 需补充 / 社区贡献） -->
    <EntryMetaBadges
      class="v2entry-badges"
      :tier="item.tier"
      :category="item.category"
      :categoryColor="item.categoryColor"
      :tags="tagList"
      :extra="extraCats"
    >
      <EntryMarks :itemId="item.id" />
    </EntryMetaBadges>

    <!-- 描述：核心阅读区（15px / 1.8，属展示级例外，不收编进 5 阶梯）。
         正文支持行内标记与 `> ` 引用块，解析与渲染与手册共用 lib/richText + ui/RichText -->
    <RichText
      v-if="item.desc"
      class="v2entry-desc"
      :class="descSpacing"
      :text="item.desc"
    />
    <p v-else class="v2entry-desc v2entry-desc--empty">{{ t('noDescShort') }}</p>

    <!-- 链接区：一个连续的列表 —— 主链接在前、参考链接紧随，**没有任何分组字样**把两者分开；
         仅用 sr-only 标题给读屏用户交代后半段语义（也让 i18n 的 referenceLinks 不成为死词） -->
    <div v-if="mainLink || refItems.length" class="v2entry-links">
      <ul v-if="mainLink" class="v2entry-linklist">
        <li>
          <a :href="mainLink.url" target="_blank" rel="noopener" class="v2entry-link" :aria-label="t('openLink')">
            <span class="v2entry-link__name">{{ mainLink.name }}</span>
            <span v-if="mainLink.showHost" class="v2entry-link__host">{{ mainLink.host }}</span>
            <ExternalLink :size="11" :stroke-width="2" class="v2entry-link__icon" />
          </a>
        </li>
      </ul>

      <h4 v-if="refItems.length" class="sr-only">{{ t('referenceLinks') }}</h4>
      <ul v-if="refItems.length" class="v2entry-linklist">
        <li v-for="(r, i) in refItems" :key="i">
          <a :href="r.url" target="_blank" rel="noopener" class="v2entry-link">
            <span class="v2entry-link__name">{{ r.d.name }}</span>
            <span v-if="r.d.showHost" class="v2entry-link__host">{{ r.d.host }}</span>
            <ExternalLink :size="11" :stroke-width="2" class="v2entry-link__icon" />
          </a>
        </li>
      </ul>
    </div>

    <!-- 推荐阅读书目：延伸到站外的书 / 论文，比关联词条更弱一档 -->
    <div v-if="reading.length" class="v2entry-sec v2entry-sec--reading">
      <EntryReading :items="reading" />
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
/* ── 间距节奏（「该收窄收窄，该有呼吸感就有呼吸感」）──
 * 顶部面包屑 / 徽章紧贴容器上内边距，不再用负 margin 硬抽；
 * 主描述区保持上下 22px 呼吸感（长描述 16px，窄屏/抽屉 18px / 14px）；
 * 若描述即为末块，底边距收为 4px 与容器 20px 底边距合成 24px 对称留白；
 * 拓展区（阅读 / 关联 / 评论）用 18px 上距 + 14px 上内距均衡分隔线呼吸。 */
.v2entry-desc {
  margin: 22px 0;
  /* 15px / 1.8 刻意不走 5 阶梯（收进去会跳到 14 或 16，视觉变化过大） */
  font-size: 15px;
  line-height: 1.8;
  -webkit-font-smoothing: antialiased;
  color: var(--white-85);
}
/* 长描述内容本身占空间，略微收紧但仍保留阅读呼吸感 */
.v2entry-desc--tight { margin: 16px 0; }
.v2entry-desc:last-child { margin-bottom: 4px; }
.v2entry-desc--empty { color: var(--white-55); font-style: italic; }

/* 链接区：外链与参考组竖向堆叠，微间距收紧 */
.v2entry-links {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.v2entry-link {
  display: inline-flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2px 6px;
  max-width: 100%;
  font-size: var(--font-xs);
  color: var(--white-60);
  text-decoration: none;
  transition: color 0.15s;
}
.v2entry-link:hover { color: var(--white-90); }
/* 下划线只画在站点+标题上：域名与图标保持弱化，两者混排时不会连成一条长下划线 */
.v2entry-link__name {
  overflow-wrap: anywhere;
  text-decoration: underline;
  text-underline-offset: 4px;
  text-decoration-color: var(--white-20);
  transition: text-decoration-color 0.15s;
}
.v2entry-link:hover .v2entry-link__name { text-decoration-color: var(--white-50); }
.v2entry-link__host { font-size: var(--font-micro); color: var(--white-30); }
.v2entry-link__icon { flex: none; align-self: center; opacity: 0.5; transition: opacity 0.15s; }
.v2entry-link:hover .v2entry-link__icon { opacity: 0.9; }
.v2entry-linklist { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; }

/* 分区（推荐阅读 / 关联词条 / 评论）：分隔线上下均衡留白（上方 16~20px，下方 14px） */
.v2entry-sec {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--white-06);
}
.v2entry-sec + .v2entry-sec {
  margin-top: 14px;
}

/* A3：探索轨迹面包屑 —— 刻意做弱：细字重（300）、低透明度、不抢正文。 */
.trail {
  display: flex; align-items: baseline; flex-wrap: wrap;
  column-gap: 6px; row-gap: 2px;
  margin: 0 0 6px;
  font-size: var(--font-tiny);
  line-height: 1.55;
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

@media (max-width: 1023px) {
  .v2entry-desc { margin: 18px 0; }
  .v2entry-desc--tight { margin: 14px 0; }
  .v2entry-desc:last-child { margin-bottom: 2px; }
  .v2entry-sec {
    margin-top: 14px;
    padding-top: 12px;
  }
  .v2entry-sec + .v2entry-sec { margin-top: 12px; }
}
</style>
