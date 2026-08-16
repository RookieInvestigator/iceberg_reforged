import { reactive, ref, nextTick, onScopeDispose, type Ref } from 'vue'
import type { RenderItem } from '../injectionKeys'

interface TooltipOptions {
  t: (key: string) => string
  dm: Readonly<Ref<string>>
  findItem: (el: HTMLElement) => RenderItem | undefined
}

/**
 * 词条 Tooltip 控制器（codeq 拆分：原 ItemInteractivity 的悬浮提示职责）。
 * 200ms 悬停延迟、滚动阻止误触发、位置自适应（上/下 + 左/中/右）。
 */
export function useTooltip(opts: TooltipOptions) {
  const { t, dm, findItem } = opts

  const tip = reactive({ show: false, anchor: null as HTMLElement | null, desc: '', noDesc: false, category: '', color: '', tags: '' });
  const tipRef = ref<any>(null);
  const hoverTimer = ref(0);
  let currentItemEl: HTMLElement | null = null;
  let activeItemEl: HTMLElement | null = null;

  function setItemClasses(el: HTMLElement, align: string, below: boolean) {
    el.classList.remove('tooltip-left', 'tooltip-right', 'tooltip-below');
    if (align === 'left') el.classList.add('tooltip-left');
    else if (align === 'right') el.classList.add('tooltip-right');
    if (below) el.classList.add('tooltip-below');
  }

  function showTooltip(el: HTMLElement, item: RenderItem) {
    if (window.innerWidth < 1024) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const cx = rect.left + rect.width / 2;

    let align = 'center';
    if (cx < vw * 0.25) align = 'left';
    else if (cx > vw * 0.75) align = 'right';

    if (activeItemEl && activeItemEl !== el) { activeItemEl.classList.remove('tooltip-active'); if (activeItemEl.dataset.wasRead) activeItemEl.classList.add('read'); }
    activeItemEl = el;
    if (el.classList.contains('read')) { el.dataset.wasRead = '1'; el.classList.remove('read'); }
    el.classList.add('tooltip-active');
    setItemClasses(el, align, false);

    const tp = tipRef.value?.rootEl;
    if (tp) tp.style.maxHeight = '';

    Object.assign(tip, {
      show: true, anchor: el,
      desc: item.desc || t('noDesc'),
      noDesc: !item.desc,
      category: item.category,
      color: item.categoryColor,
      tags: (item.tags || []).join(' | '),
    });

    nextTick().then(() => {
      const tp = tipRef.value?.rootEl;
      if (!tp) return;
      const h = tp.getBoundingClientRect().height;
      const spaceAbove = rect.top - 8;
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      let below = false;

      if (spaceAbove >= h) {
        below = false;
      } else if (spaceBelow >= h) {
        below = true;
      } else {
        below = spaceBelow > spaceAbove;
        const maxH = Math.max(below ? spaceBelow : spaceAbove, 80);
        tp.style.maxHeight = maxH + 'px';
      }
      setItemClasses(el, align, below);
    });
  }

  function hideTooltip() {
    clearTimeout(hoverTimer.value);
    currentItemEl = null;
    if (activeItemEl) {
      activeItemEl.classList.remove('tooltip-active', 'tooltip-left', 'tooltip-right', 'tooltip-below');
      if (activeItemEl.dataset.wasRead) { activeItemEl.classList.add('read'); delete activeItemEl.dataset.wasRead; }
      activeItemEl = null;
    }
    tip.show = false;
    tip.anchor = null;
  }

  // 滚动期间阻止误触发；300ms 无滚动恢复
  let scrollBusy = false;
  let scrollTimer = 0;
  function onWindowScroll() {
    scrollBusy = true;
    hideTooltip();
    clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => { scrollBusy = false; }, 300);
  }
  window.addEventListener('scroll', onWindowScroll, { passive: true });

  function onMouseOver(e: MouseEvent) {
    if (scrollBusy || dm.value === 'modal' || window.innerWidth < 1024) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('.iceberg-item');
    if (!el) { hideTooltip(); return; }
    if (el === currentItemEl) return;
    currentItemEl = el;
    clearTimeout(hoverTimer.value);
    const item = findItem(el);
    if (!item) { hideTooltip(); return; }
    hoverTimer.value = window.setTimeout(() => showTooltip(el, item), 200);
  }

  function onMouseLeave(e: MouseEvent) {
    if (dm.value === 'modal') return;
    clearTimeout(hoverTimer.value);
    currentItemEl = null;
    const to = e.relatedTarget as HTMLElement | null;
    const tp = tipRef.value?.rootEl;
    if (to && tp && (to === tp || tp.contains(to))) return;
    if (!to || !to.closest('#items-container')) hideTooltip();
  }

  // 模板 @enter 用（进入 tooltip 本体时清空当前词条，避免状态残留）
  function resetCurrentItem() { currentItemEl = null; }

  onScopeDispose(() => {
    window.removeEventListener('scroll', onWindowScroll)
    window.clearTimeout(hoverTimer.value)
    window.clearTimeout(scrollTimer)
  })
  return { tip, tipRef, onMouseOver, onMouseLeave, showTooltip, hideTooltip, resetCurrentItem }
}
