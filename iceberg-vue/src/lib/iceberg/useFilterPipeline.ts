import { watchEffect, onMounted, onScopeDispose, type Ref, type ShallowRef } from 'vue'
import { useStore } from '@nanostores/vue'
import { activeCategories, activeTags, tagFilterMode, hiddenCategories, hiddenTags, specialFilter, favFilter } from '../filterStore'
import { favorites, readItems, showReadMark, showNewMark, filterMode } from '../settingsStore'
import type { RenderItem } from '../injectionKeys'

interface PipelineOptions {
  filterVisible: ShallowRef<Set<string> | null> | null
  dimItems: ShallowRef<Set<string> | null> | null
  searchResults: Ref<string[] | null>
  resolveId: (id: string | null | undefined) => string
  newCutoff: number
  itemModAt: Map<string, number>
  t: (key: string) => string
}

/**
 * 过滤管线 + 已读/NEW 标记（codeq 拆分：原 ItemInteractivity 的筛选职责）。
 * F14：统一快照 + 单一调度器取消旧帧；F15：与随机入口共用 matchesFilter；
 * 已读/最近更新标记独立于过滤管线（避免开弹窗触发 1400 词条全量重扫）。
 */
export function useFilterPipeline(allItems: RenderItem[], opts: PipelineOptions) {
  const { filterVisible, dimItems, searchResults, resolveId, newCutoff, itemModAt, t } = opts

  const activeCats = useStore(activeCategories);
  const activeT = useStore(activeTags);
  const tagMode = useStore(tagFilterMode);
  const hiddenCats = useStore(hiddenCategories);
  const hiddenT = useStore(hiddenTags);
  const spl = useStore(specialFilter);
  const favF = useStore(favFilter);
  const fList = useStore(favorites);
  const fltMode = useStore(filterMode);
  const rList = useStore(readItems);
  const sNew = useStore(showNewMark);
  const sRead = useStore(showReadMark);

  // F15：主筛选与随机入口共用的纯匹配函数 —— 同一快照 → 随机池与可见集合完全一致
  function filterSnapshot() {
    return {
      spl: spl.value, favF: favF.value, fList: fList.value.map(id => resolveId(id)), // F30：收藏旧 id 转换
      hCats: hiddenCats.value, hTags: hiddenT.value,
      cats: activeCats.value, tags: activeT.value, tagMode: tagMode.value,
      resultSet: searchResults.value ? new Set(searchResults.value) : null,
    };
  }
  function matchesFilter(item: RenderItem, snap: ReturnType<typeof filterSnapshot>) {
    const { spl, favF, fList, hCats, hTags, cats, tags, tagMode, resultSet } = snap;
    if (spl === 'hasLink') { if (!item.link) return false; }
    else if (spl === 'hasDesc') { if (!item.desc) return false; }
    else if (spl === 'isNew') { if ((item.modifiedAt || 0) < newCutoff) return false; }
    else if (spl === 'noLinkNoDesc') { if (item.link || item.desc) return false; }
    if (favF && !fList.includes(item.id)) return false;
    if (hCats.length > 0 && hCats.includes(item.category)) return false;
    if (hTags.length > 0 && hTags.some(t => (item.emojis || []).includes(t))) return false;
    if (cats.length > 0 && !cats.includes(item.category)) return false;
    if (tags.length > 0) {
      return tagMode === 'AND'
        ? tags.every(t => (item.emojis || []).includes(t))
        : tags.some(t => (item.emojis || []).includes(t));
    }
    if (resultSet && !resultSet.has(item.id)) return false;
    return true;
  }

  // Filter（F14：统一快照 + 单一调度器取消旧帧，最后一帧严格对应最新状态）
  let filterRaf = 0;
  watchEffect(() => {
    if (typeof document === 'undefined') return;
    const snap = filterSnapshot();
    const flt = fltMode.value;
    const tierEmptyMsg = t('tierEmpty');
    const noResultsMsg = t('noResults');
    if (filterRaf) cancelAnimationFrame(filterRaf);
    filterRaf = requestAnimationFrame(() => {
      const c = document.getElementById('items-container');
      if (!c) return;
      // 纯 JS 数组匹配（替代 DOM querySelectorAll 循环；F15：与随机入口共用 matchesFilter）
      const matched = new Set<string>();
      for (const item of allItems) {
        if (matchesFilter(item, snap)) matched.add(item.id);
      }
      // 声明式更新：一次性设置 Set，由 v-show / :class + v-memo 批量处理 DOM
      if (filterVisible) {
        if (flt === 'hide') {
          filterVisible.value = matched;
          if (dimItems) dimItems.value = null;
        } else {
          filterVisible.value = null;
          // perf：变暗集合响应式下发（替代 1409 次命令式 classList.toggle；v-memo 只重渲染状态翻转的词条）
          if (dimItems) dimItems.value = new Set(allItems.filter(i => !matched.has(i.id)).map(i => i.id));
        }
      } else {
        c.querySelectorAll<HTMLElement>('.iceberg-item').forEach(el => {
          const id = el.dataset.id || '';
          if (flt === 'hide') {
            el.style.display = matched.has(id) ? '' : 'none';
          } else {
            el.style.display = '';
            el.classList.toggle('dimmed', !matched.has(id));
          }
        });
      }
      // 标记样式已拆到独立 watchEffect（只依赖 rList/sRead/sNew，避免开弹窗触发全量过滤）
      // 统计可见 + tier-empty（基于 tier 数据，无需 DOM 查询）
      const total = matched.size;
      const tierVis = new Map<string, number>();
      for (const item of allItems) {
        if (!matched.has(item.id) || !item.tier) continue;
        tierVis.set(item.tier, (tierVis.get(item.tier) || 0) + 1);
      }
      c.querySelectorAll<HTMLElement>('.iceberg-tier').forEach(tier => {
        const tn = tier.dataset.tier || '';
        const v = tierVis.get(tn) || 0;
        let msg = tier.querySelector('.tier-empty');
        if (v === 0) {
          if (!msg) { msg = document.createElement('div'); msg.className = 'tier-empty text-center text-white/15 text-sm py-8 italic'; msg.textContent = tierEmptyMsg; tier.appendChild(msg); }
        } else if (msg) { msg.remove(); }
      });
      let globalMsg = document.getElementById('items-empty');
      if (total === 0) {
        if (!globalMsg) { globalMsg = document.createElement('div'); globalMsg.id = 'items-empty'; globalMsg.className = 'text-center text-white/20 text-lg py-40 italic'; globalMsg.textContent = noResultsMsg; c.appendChild(globalMsg); }
        c.querySelectorAll<HTMLElement>('.iceberg-tier').forEach(t => { t.style.display = 'none'; });
      } else {
        if (globalMsg) globalMsg.remove();
        c.querySelectorAll<HTMLElement>('.iceberg-tier').forEach(t => { t.style.display = ''; });
      }
    });
  });

  // 已读/最近更新标记：独立于过滤管线（收藏/已读变化不再触发 1400 词条全量重扫）
  function applyItemMarks() {
    if (typeof document === 'undefined') return;
    const rs = rList.value; const sn = sNew.value; const sr = sRead.value;
    const c = document.getElementById('items-container');
    if (!c) return;
    c.querySelectorAll<HTMLElement>('.iceberg-item').forEach(el => {
      const id = el.dataset.id || '';
      el.classList.toggle('recently-updated', sn && id ? ((itemModAt.get(id) || 0) >= newCutoff) : false);
      el.classList.toggle('read', sr && id ? rs.includes(resolveId(id)) : false); // F30：已读旧 id 转换
    });
  }
  watchEffect(applyItemMarks)
  // 首次进入时 watchEffect 在 setup 同步执行，此时 #items-container（IcebergApp 的兄弟节点）尚未挂载，
  // 依赖又不变化故不会重跑——onMounted（整树挂载完成后）补一次初始应用，否则已读/NEW 标记首屏不生效
  onMounted(applyItemMarks)

  onScopeDispose(() => {
    if (filterRaf) cancelAnimationFrame(filterRaf)
  })
  return { filterSnapshot, matchesFilter }
}
