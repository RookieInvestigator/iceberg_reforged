/**
 * wallHtml —— 词条墙导出单文件 HTML（静态 + 筛选条/tooltip 小脚本，无构建依赖）。
 * 同一份 WallExportLayout：芯片按布局矩形绝对定位，胶囊/字距/图例与生产 v2 对齐。
 */
import { COVER, FOOTER, LEGEND } from './wallExport';
import type { ExportStyle, WallExportLayout } from './wallExport';
import { esc } from './wallSvg';

export interface HtmlExportOptions {
  pageTitle: string
  pageUrl: string | null
  qrDataUrl: string | null
  /** 筛选/空态文案（调用方传 t() 结果，HTML 内无 i18n 运行时） */
  labels: { search: string; reset: string; categories: string; tags: string; noResult: string }
  /** id → 描述 / 外链（tooltip 用） */
  descs: Record<string, string>
  links: Record<string, string>
  /** id → 分类名 / 标签名（筛选条用） */
  cats: Record<string, string>
  tags: Record<string, string[]>
}

export function renderWallHtml(
  layout: WallExportLayout,
  style: ExportStyle,
  opts: HtmlExportOptions,
): string {
  const ff = esc(style.fontFamily);
  const css = [
    `body{margin:0;background:${esc(style.bg)};color:${esc(style.legendColor)};font-family:${ff}}`,
    `.wrap{position:relative;width:${layout.width}px;height:${layout.height}px;margin:0 auto}`,
    `.cov{position:absolute;left:0;right:0;text-align:center}`,
    `.cov span{display:inline-block}`,
    `.chip{position:absolute;border-radius:999px;font-weight:700;white-space:nowrap;box-sizing:border-box;cursor:default}`,
    `.tag{font-size:.625em;margin-left:.3em;position:relative;top:-.08em}`,
    `.tier{position:absolute;text-align:center;font-weight:400}`,
    `.tier span{display:inline-block}`,
    `.leg{position:absolute;left:0;right:0;text-align:center}`,
    `.pill{position:absolute;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;white-space:nowrap}`,
    `.rule{position:absolute;height:1px}`,
    `.ft{position:absolute;left:0;right:0}`,
    `.ft .row{display:flex;align-items:center;gap:16px}`,
    `.fbar{position:sticky;top:0;z-index:5;padding:12px 16px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;background:${esc(style.bg)}}`,
    `.fbar input{padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:inherit}`,
    `.fbtn{padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.15);background:transparent;color:inherit;cursor:pointer;font-size:12px}`,
    `.fbtn.on{background:rgba(255,255,255,.9);color:#000;border-color:transparent}`,
    `.tip{position:fixed;z-index:50;max-width:280px;padding:10px 12px;border-radius:10px;background:rgba(20,20,28,.96);border:1px solid rgba(255,255,255,.12);font-size:13px;line-height:1.7;display:none}`,
    `.leg-cell{cursor:pointer;transition:opacity .15s,filter .15s}`,
    `.leg-cell.off{opacity:.35;filter:grayscale(.6)}`,
  ].join('\n');
  void COVER;
  const parts: string[] = [];
  const L = opts.labels;
  // 内嵌数据（</ 转义防闭合 script；筛选/tooltip 全靠它）
  const dataJson = JSON.stringify({
    items: layout.chips.map((c) => ({
      id: c.id,
      tier: c.tier,
      title: c.title,
      cat: opts.cats[c.id] || '',
      tags: opts.tags[c.id] || [],
      desc: opts.descs[c.id] || '',
      link: opts.links[c.id] || '',
    })),
  }).replace(/<\//g, '<\\/');
  parts.push(
    '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">',
    `<meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<title>${esc(opts.pageTitle)}</title>`,
    `<style>${css}</style></head><body>`,
    `<div class="fbar" id="fbar">` +
    `<input id="fq" type="search" placeholder="${esc(L.search)}">` +
    `<button class="fbtn" id="freset" type="button">${esc(L.reset)}</button></div>`,
    `<div class="tip" id="tip"></div>`,
    `<div class="wrap">`,
  );

  // 题头：内层 span 背负字距（margin-right 负值抵消末字 trailing space，保证真居中）
  for (const line of layout.cover) {
    const weight = line.font.startsWith('900') ? 900 : 400;
    const sizeMatch = /(\d+(?:\.\d+)?)px/.exec(line.font);
    const size = sizeMatch ? sizeMatch[1] : '12';
    parts.push(
      `<div class="cov" style="top:${r(line.baseline - parseFloat(size))}px;` +
      `font-size:${size}px;font-weight:${weight};color:${esc(line.color)}">` +
      `<span style="letter-spacing:${line.letterSpacingPx}px;margin-right:-${line.letterSpacingPx}px">${esc(line.text)}</span></div>`,
    );
  }

  // 图例：胶囊宽由布局锁定，文字用 padding-left 对齐（textX-x），无双重内边距
  for (const row of layout.legend) {
    if (row.label) {
      parts.push(
        `<div class="leg" style="top:${r(row.y)}px;height:${r(row.h)}px;` +
        `font-size:${LEGEND.px}px;font-weight:700;color:${esc(style.headerColor)}">${esc(row.label)}</div>`,
      );
    }
    for (const cell of row.cells) {
      const border = cell.color ? `border:1px solid ${esc(cell.color)};background:${esc(cell.color)}22;` : '';
      // 图例即筛选器：分类/标签点击切换（选中态由 .off 反显：未选中的变暗）
      const filterAttr = cell.color
        ? `data-leg-cat="${esc(cell.text)}"`
        : (cell.emoji ? `data-leg-tag="${esc(cell.emoji)}"` : '');
      parts.push(
        `<span class="pill leg-cell" ${filterAttr} style="left:${r(cell.x)}px;top:${r(row.y)}px;` +
        `width:${r(cell.w)}px;height:${r(cell.h)}px;${border}` +
        `font-size:${LEGEND.px}px;color:${esc(style.legendColor)};justify-content:center">` +
        (cell.emoji ? `<span>${esc(cell.emoji)}</span><span style="width:4px"></span>` : '') +
        `<span>${esc(cell.text)}</span></span>`,
      );
    }
  }

  for (const t of layout.tiers) {
    if (t.dividerY != null) {
      parts.push(
        `<div class="rule" data-tier-rule="${esc(t.tier)}" style="left:${r(t.x)}px;top:${r(t.dividerY)}px;width:${r(t.w)}px;` +
        `background:${esc(style.dividerColor)}"></div>`,
      );
    }
    parts.push(
      `<div class="tier" data-tier-head="${esc(t.tier)}" style="left:${r(t.x)}px;top:${r(t.y)}px;width:${r(t.w)}px;` +
      `font-size:${style.headerPx}px;color:${esc(style.headerColor)}">` +
      `<span style="letter-spacing:0.35em;margin-right:-0.35em">${esc(t.tier)}</span></div>`,
    );
  }

  // 芯片：整块按布局矩形定位，标题+emoji 同行基线对齐（与 canvas 同几何）
  for (const c of layout.chips) {
    const op = c.alpha === 1 ? '' : `opacity:${c.alpha};`;
    parts.push(
      `<span class="chip" data-id="${esc(c.id)}" style="left:${r(c.x)}px;top:${r(c.y)}px;width:${r(c.w)}px;height:${r(c.h)}px;` +
      `line-height:${r(c.h)}px;font-size:${style.fontPx}px;text-align:center;` +
      `color:${esc(c.color)};text-shadow:2px 2px 3px ${esc(style.shadowColor)};${op}">` +
      `${esc(c.title)}` +
      c.emojis.map((e) => `<span class="tag" style="color:${esc(style.tagColor)}">${esc(e)}</span>`).join('') +
      `</span>`,
    );
  }

  if (layout.footer) {
    const fl = layout.footer;
    parts.push(`<div class="ft" style="top:${r(fl.blockY)}px;height:${r(fl.blockH)}px">`);
    if (opts.qrDataUrl) {
      parts.push(
        `<img src="${opts.qrDataUrl}" alt="" style="position:absolute;left:${r(fl.qrX)}px;top:${r(fl.qrY)}px;` +
        `width:${r(fl.qrSize)}px;height:${r(fl.qrSize)}px">`,
      );
    }
    parts.push(
      `<div class="row" style="position:absolute;left:${r(fl.textX)}px;top:${r(fl.qrY)}px">` +
      `<div><div style="font-size:${FOOTER.urlPx}px;color:${esc(style.legendColor)}">` +
      (opts.pageUrl ? `<a href="${esc(fl.url)}" style="color:inherit">${esc(fl.url)}</a>` : esc(fl.url)) +
      `</div><div style="font-size:${FOOTER.copyPx}px;color:${esc(style.headerColor)};margin-top:8px">${esc(fl.copy)}</div></div>` +
      `</div></div>`,
    );
  }

  parts.push(`<div id="noresult" style="display:none;text-align:center;padding:24px;opacity:.6">${esc(L.noResult)}</div>`);
  parts.push('</div>');

  // —— 交互脚本：筛选（搜索 + 分类 pills + 标签下拉 + 重置）+ tooltip（悬停/点击）——
  const script = [
    `var DATA=${dataJson};`,
    `var byId={};DATA.items.forEach(function(e){byId[e.id]=e;});`,
    `var sel={q:'',cats:{},tag:''};`,
    // perf：芯片元素一次建表（1440 次 querySelector 会把每次筛选拖成秒级）
    `var chipEls={};document.querySelectorAll('.chip').forEach(function(el){chipEls[el.dataset.id]=el;});`,
    `function apply(){`,
    `  var vis=0;var perTier={};`,
    `  DATA.items.forEach(function(e){`,
    `    var el=chipEls[e.id];if(!el)return;`,
    `    var ok=true;`,
    `    if(sel.q&&e.title.toLowerCase().indexOf(sel.q)<0)ok=false;`,
    `    if(ok&&Object.keys(sel.cats).length&&!sel.cats[e.cat])ok=false;`,
    `    if(ok&&sel.tag&&(e.tags||[]).indexOf(sel.tag)<0)ok=false;`,
    `    el.style.display=ok?'':'none';`,
    `    if(ok){vis++;perTier[e.tier]=(perTier[e.tier]||0)+1;}`,
    `  });`,
    `  document.querySelectorAll('[data-tier-head]').forEach(function(h){`,
    `    var show=(perTier[h.dataset.tierHead]||0)>0;h.style.display=show?'':'none';});`,
    `  document.querySelectorAll('[data-tier-rule]').forEach(function(h){`,
    `    var show=(perTier[h.dataset.tierRule]||0)>0;h.style.display=show?'':'none';});`,
    `  document.getElementById('noresult').style.display=vis?'none':'';`,
    `}`,
    `document.getElementById('fq').addEventListener('input',function(e){sel.q=e.target.value.trim().toLowerCase();apply();});`,
    `document.querySelector('.wrap').addEventListener('click',function(e){` +
    `var leg=e.target.closest?e.target.closest('.leg-cell'):null;` +
    `if(!leg)return;` +
    `if(leg.dataset.legCat){var c=leg.dataset.legCat;if(sel.cats[c])delete sel.cats[c];else sel.cats[c]=1;}` +
    `else if(leg.dataset.legTag){var tg=leg.dataset.legTag;sel.tag=(sel.tag===tg?'':tg);}` +
    `syncLeg();apply();});`,
    `function syncLeg(){var anyCat=Object.keys(sel.cats).length>0;` +
    `document.querySelectorAll('.leg-cell[data-leg-cat]').forEach(function(el){el.classList.toggle('off',anyCat&&!sel.cats[el.dataset.legCat]);});` +
    `document.querySelectorAll('.leg-cell[data-leg-tag]').forEach(function(el){el.classList.toggle('off',!!sel.tag&&el.dataset.legTag!==sel.tag);});}`,
    `document.getElementById('freset').addEventListener('click',function(){` +
    `sel={q:'',cats:{},tag:''};document.getElementById('fq').value='';syncLeg();apply();});`,
    `var tip=document.getElementById('tip'),pinned=null;`,
    `function xesc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}`,
    `function showTip(el,x,y){var e=byId[el.dataset.id];if(!e||(!e.desc&&!e.link))return;` +
    `tip.innerHTML='<b>'+xesc(e.title)+'</b>'+` +
    `(e.desc?'<div>'+xesc(e.desc)+'</div>':'')+` +
    `(e.link?'<div><a href="'+e.link.replace(/"/g,'&quot;')+'">link</a></div>':'');` +
    `tip.style.display='block';` +
    `var r=tip.getBoundingClientRect();` +
    `tip.style.left=Math.min(x+14,innerWidth-r.width-8)+'px';` +
    `tip.style.top=Math.min(y+14,innerHeight-r.height-8)+'px';}`,
    `function hideTip(){if(!pinned)tip.style.display='none';}`,
    `document.querySelector('.wrap').addEventListener('mousemove',function(e){` +
    `if(!e.target.closest||window.__tipTick)return;window.__tipTick=true;` +
    `var cx=e.clientX,cy=e.clientY;` +
    `requestAnimationFrame(function(){window.__tipTick=false;` +
    `var el=document.elementFromPoint(cx,cy);` +
    `var chip=el&&el.closest?el.closest('.chip'):null;` +
    `if(chip&&chip!==pinned)showTip(chip,cx,cy);else if(!chip&&!pinned)hideTip();});});`,
    `document.querySelector('.wrap').addEventListener('click',function(e){` +
    `var el=e.target.closest?e.target.closest('.chip'):null;` +
    `if(el){pinned=el;showTip(el,e.clientX,e.clientY);}else{pinned=null;hideTip();}});`,
    `document.addEventListener('scroll',hideTip,{passive:true});`,
    `apply();`,
  ].join('\n');
  parts.push(`<script>${script}<\/script>`);
  parts.push('</body></html>');
  return parts.join('\n');
}

function r(n: number): string {
  return String(Math.round(n * 100) / 100);
}
