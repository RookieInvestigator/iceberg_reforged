import { reactive, ref, nextTick, onScopeDispose, type Ref } from 'vue'
import type { RenderItem } from '../injectionKeys'

interface TooltipOptions {
  t: (key: string) => string
  dm: Readonly<Ref<string>>
  findItem: (el: HTMLElement) => RenderItem | undefined
}

/**
 * 词条 Tooltip 控制器（codeq 拆分：原 ItemInteractivity 的悬浮提示职责）。
 * 200ms 悬停延迟、滚动/缩放阻止误触发、位置自适应（上/下 + 左/中/右 + 视口钳制）。
 *
 * 定位架构（2026-08-21 重做）：**body 级浮动层** —— ItemTooltip 以 floating 模式
 * Teleport 到 <body>，useTooltip 用视口坐标 + position:fixed + 8px 硬钳制定位。
 * tooltip 不再属于任何可裁剪祖先盒（tier 合成层 / content-visibility / capture-area
 * overflow / body clip）的后代，结构上不存在被截断的路径。
 */
export function useTooltip(opts: TooltipOptions) {
  const { t, dm, findItem } = opts

  const tip = reactive({ show: false, anchor: null as HTMLElement | null, floating: false, desc: '', noDesc: false, category: '', color: '', tags: '' });
  const tipRef = ref<any>(null);
  const hoverTimer = ref(0);
  let currentItemEl: HTMLElement | null = null;
  let activeItemEl: HTMLElement | null = null;
  /** 内容尺寸观测（字体加载/换行/宽度变化 → 重定位），隐藏时断开 */
  let tipRO: ResizeObserver | null = null;
  let tipRORaf = 0;

  /**
   * 浮动层定位：body 级 fixed + 视口坐标。
   * - 与词条**紧贴**（0 间距）：上置 top = chip.top − h；下置 top = chip.bottom；
   *   左/右对齐贴边；居中则水平居中于词条
   * - 视口硬钳制保留 8px 安全边距（只在即将越界时才让出间距）
   * - 输入一律「当次实测」：chip 矩形、tooltip 尺寸即时读取；
   *   打开期间内容/布局变动由 ResizeObserver 重定位兜底
   */
  function placeTip(tp: HTMLElement, el: HTMLElement, alignParam?: string) {
    const M = 8; // 视口安全边距（非词条间距）
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const h = tp.offsetHeight || 80;
    const w = tp.offsetWidth || 0;
    // 翻向判定用带边距的空间（避免贴边粘贴），视觉间距恒为 0
    const spaceAbove = rect.top - M;
    const spaceBelow = vh - rect.bottom - M;
    let below = false;
    let maxH = 0;
    if (spaceAbove < h && spaceBelow >= h) below = true;
    else if (spaceAbove < h && spaceBelow < h) {
      below = spaceBelow > spaceAbove;
      maxH = Math.max(below ? spaceBelow : spaceAbove, 80);
      tp.style.maxHeight = maxH + 'px';
    }
    let align = alignParam;
    if (!align) {
      const cx = rect.left + rect.width / 2;
      if (cx < vw * 0.25) align = 'left';
      else if (cx > vw * 0.75) align = 'right';
      else align = 'center';
    }
    let x: number;
    if (align === 'left') x = rect.left;
    else if (align === 'right') x = rect.right - w;
    else x = rect.left + rect.width / 2 - w / 2;
    x = Math.min(Math.max(x, M), Math.max(M, vw - w - M));
    const y = below
      ? Math.min(rect.bottom, Math.max(M, vh - maxH - M))
      : Math.min(Math.max(rect.top - h, M), Math.max(M, vh - h - M));
    tp.style.transform = 'none';
    tp.style.left = `${Math.round(x)}px`;
    tp.style.top = `${Math.round(y)}px`;
    // 定位类直接落在浮层盒上（贴着词条的阴影/语义；tooltip 已不在词条内，chip 侧类仅实验页用）
    tp.classList.toggle('tooltip-below', below);
    tp.classList.toggle('tooltip-left', align === 'left');
    tp.classList.toggle('tooltip-right', align === 'right');
    setItemClasses(el as HTMLElement, align, below);
    if (import.meta.env.DEV) {
      (window as any).__tipDebug = { rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, w, h, align, below, y, x, scrollY: window.scrollY };
    }
  }

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

    Object.assign(tip, {
      show: true, anchor: el, floating: true,
      desc: item.desc || t('noDesc'),
      noDesc: !item.desc,
      category: item.category,
      color: item.categoryColor,
      tags: (item.tags || []).join(' | '),
    });

    nextTick().then(() => {
      const tp = tipRef.value?.rootEl as HTMLElement | null;
      if (!tp) return;
      tp.style.maxHeight = '';
      tp.style.left = '';
      tp.style.top = '';
      tp.style.transform = '';
      placeTip(tp, el, align);
      // 观测驱动重定位：tooltip 内容尺寸（字体/换行）与锚点 chip 尺寸（字体重排/布局）
      // 任一变化 → rAF 合并按最新矩形重放；隐藏时断开
      if (!tipRO && typeof ResizeObserver === 'function') {
        tipRO = new ResizeObserver(() => {
          if (tipRORaf) cancelAnimationFrame(tipRORaf);
          tipRORaf = requestAnimationFrame(() => {
            tipRORaf = 0;
            const tp = tipRef.value?.rootEl as HTMLElement | null;
            if (!tp || !tip.show || !activeItemEl) return;
            placeTip(tp, activeItemEl);
          });
        });
        tipRO.observe(tp);
        tipRO.observe(el);
      }
    });
  }

  function hideTooltip() {
    clearTimeout(hoverTimer.value);
    currentItemEl = null;
    if (tipRO) { tipRO.disconnect(); tipRO = null; }
    if (tipRORaf) cancelAnimationFrame(tipRORaf);
    tipRORaf = 0;
    if (activeItemEl) {
      activeItemEl.classList.remove('tooltip-active', 'tooltip-left', 'tooltip-right', 'tooltip-below');
      if (activeItemEl.dataset.wasRead) { activeItemEl.classList.add('read'); delete activeItemEl.dataset.wasRead; }
      activeItemEl = null;
    }
    tip.show = false;
    tip.anchor = null;
    tip.floating = false;
    const tp = tipRef.value?.rootEl as HTMLElement | null;
    if (tp) {
      tp.style.transform = '';
      tp.style.left = '';
      tp.style.top = '';
      tp.style.maxHeight = '';
    }
  }

  // 滚动/缩放（含 Ctrl+/− 变 dpr）期间阻止误触发 & 关闭；300ms 无事件恢复
  let scrollBusy = false;
  let scrollTimer = 0;
  function onWindowScroll() {
    scrollBusy = true;
    hideTooltip();
    clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => { scrollBusy = false; }, 300);
  }
  function onWindowResize() {
    scrollBusy = true;
    hideTooltip();
    clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => { scrollBusy = false; }, 300);
  }
  window.addEventListener('scroll', onWindowScroll, { passive: true });
  window.addEventListener('resize', onWindowResize);

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
    window.removeEventListener('resize', onWindowResize)
    window.clearTimeout(hoverTimer.value)
    window.clearTimeout(scrollTimer)
  })
  return { tip, tipRef, onMouseOver, onMouseLeave, showTooltip, hideTooltip, resetCurrentItem }
}
