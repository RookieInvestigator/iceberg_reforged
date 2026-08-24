import { watch, watchEffect, onMounted, onScopeDispose, type Ref, type ShallowRef } from 'vue'
import { useStore } from '@nanostores/vue'
import { activeCategories, activeTags, tagFilterMode, hiddenCategories, hiddenTags, specialFilter, favFilter } from '../filterStore'
import { favorites, readItems, showReadMark, showNewMark, filterMode } from '../settingsStore'
import { tierVisibleCounts } from './wallCounts'
import { buildNavIndex, docOrder, navIndex, wallMatched } from './wallState'
import type { RenderItem } from '../injectionKeys'

interface PipelineOptions {
  filterVisible: ShallowRef<Set<string> | null> | null
  dimItems: ShallowRef<Set<string> | null> | null
  searchResults: Ref<string[] | null>
  resolveId: (id: string | null | undefined) => string
  newCutoff: number
  itemModAt: Map<string, number>
}

/**
 * 过滤管线 + 已读/NEW 标记（codeq 拆分：原 ItemInteractivity 的筛选职责）。
 * F14：统一快照 + 单一调度器取消旧帧；F15：与随机入口共用 matchesFilter；
 * 已读/最近更新标记独立于过滤管线（避免开弹窗触发 1400 词条全量重扫）。
 */
export function useFilterPipeline(allItems: RenderItem[], opts: PipelineOptions) {
  const { filterVisible, dimItems, searchResults, resolveId, newCutoff, itemModAt } = opts

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
  // 仅声明式路径：filterVisible/dimItems 由宿主（IndexView）注入，v-show / :class + v-memo
  // 批量消费；层空/全空提示同属声明式（宿主模板渲染），此处不再触碰 DOM（双路径已剪除）。
  // 单遍产出：matched + dim 集合 + 层可见数（tierVisibleCounts）一次遍历全量派生。
  let filterRaf = 0;
  watchEffect(() => {
    if (typeof document === 'undefined') return;
    const snap = filterSnapshot();
    const flt = fltMode.value;
    if (filterRaf) cancelAnimationFrame(filterRaf);
    filterRaf = requestAnimationFrame(() => {
      const wantDim = flt !== 'hide' && !!dimItems;
      const matched = new Set<string>();
      const dimArr: string[] = [];
      const counts = new Map<string, number>();
      // 纯 JS 数组匹配（替代 DOM querySelectorAll 循环；F15：与随机入口共用 matchesFilter）
      for (const item of allItems) {
        if (matchesFilter(item, snap)) {
          matched.add(item.id);
          // 层可见数（hide 模式模板空态用；dim 模式不适用 → null）
          if (item.tier) counts.set(item.tier, (counts.get(item.tier) || 0) + 1);
        } else if (wantDim) {
          dimArr.push(item.id);
        }
      }
      tierVisibleCounts.value = flt === 'hide' ? counts : null;
      // 匹配集（hide/dim 皆产出）：随机池等交互的 O(1) 数据源
      wallMatched.value = matched;
      // 声明式更新：一次性设置 Set，由 v-show / :class + v-memo 批量处理 DOM
      if (filterVisible) {
        if (flt === 'hide') {
          filterVisible.value = matched;
          if (dimItems) dimItems.value = null;
        } else {
          filterVisible.value = null;
          // perf：变暗集合响应式下发（替代 1409 次命令式 classList.toggle；v-memo 只重渲染状态翻转的词条）
          if (dimItems) dimItems.value = dimArr.length ? new Set(dimArr) : new Set();
        }
      }
    });
  });

  // 可见文档序位置索引（前后导航单一事实源）：docOrder（sortMode 重建）与可见集合变化时
  // 线性重建一次，navIdsFor 查表 O(1)；dim 模式 visible=null → 全量文档序（原语义一致）
  watchEffect(() => {
    const vis = filterVisible?.value ?? null
    navIndex.value = buildNavIndex(docOrder.value, vis)
  })

  // 已读/NEW 标记：**只对开关变化全量扫描**；单条已读由 ItemInteractivity.markRead 定向
  // 翻转（O(1)），管线不再监听 readItems —— 每次开弹窗不再触发 1400 节点全量重扫。
  // 关闭开关时清理一次残留标记类，之后保持零扫描。
  let marksApplied = false
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
    marksApplied = sn || sr
  }
  watch([sNew, sRead], ([sn, sr]) => {
    if (sn || sr) applyItemMarks()
    else if (marksApplied) {
      const c = document.getElementById('items-container');
      c?.querySelectorAll<HTMLElement>('.iceberg-item').forEach(el => {
        el.classList.remove('recently-updated', 'read');
      });
      marksApplied = false
    }
  })
  // 首次进入时 setup 同步执行时 #items-container（IcebergApp 的兄弟节点）尚未挂载，
  // onMounted（整树挂载完成后）补一次初始应用，否则已读/NEW 标记首屏不生效
  onMounted(() => { if (sNew.value || sRead.value) applyItemMarks() })

  onScopeDispose(() => {
    if (filterRaf) cancelAnimationFrame(filterRaf)
  })
  return { filterSnapshot, matchesFilter }
}
