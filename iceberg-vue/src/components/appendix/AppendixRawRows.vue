<script setup lang="ts">
// 原始行模式：直接编辑五张副表的行（role / by / at / 越界这些所见即所得表达不了的）。
//
// 关键约定：**控件按表的声明渲染**，不按「所有表都长一样」猜 ——
//   · role 下拉只在有 role 列的表出现（contributors 没有，出过幽灵空下拉）；
//   · by / at 输入框只在有这两列的表出现；
//   · 行体（原/改对照、关联选择器）只给对应的表。
import { computed, ref } from 'vue'
import type { AppendixEditor, Row } from '../../lib/iceberg/useAppendixEditor'

const props = defineProps<{ ed: AppendixEditor }>()

const has = (headers: string[], col: string) => headers.includes(col)
const isMain = (row: Row) => (row.role || '').trim().toLowerCase() === 'main'

/** 反向关联（只读）：谁把本词条设成了 target —— 整表扫描由编辑器提供 */
const reverseRelated = computed(() => {
  const id = props.ed.selectedId.value
  return id ? props.ed.reverseRelatedOf(id) : []
})

/** 关联词条：行内搜索选择 */
const relSearch = ref('')
const relResults = computed(() => {
  const q = relSearch.value.trim().toLowerCase()
  if (!q) return []
  return props.ed.allItems.filter(i => i.title.toLowerCase().includes(q) || i.id.includes(q)).slice(0, 12)
})

function origValueOf(row: Row): string {
  const f = (row.field || '').trim().toLowerCase()
  if (f === 'title') return props.ed.upstream.value.title || '（上游为空）'
  if (f === 'desc') return props.ed.upstream.value.desc || '（上游为空）'
  if (f === 'tags') return props.ed.upstream.value.tags.join('、') || '（上游为空）'
  return '（先选字段）'
}
</script>

<template>
  <div class="raw">
    <section v-for="def in ed.tables" :key="def.key" class="tbl" :class="{ on: ed.getRows(def).length }">
      <div class="hd">
        <h3 :title="`本表独占「${def.area}」区域；同一数据位只有一张表能写`">{{ def.label }}</h3>
        <code class="file">{{ def.file }}</code>
        <span class="n">{{ ed.getRows(def).length }} 行</span>
        <span class="gap" />
        <button class="add-txt" @click="ed.addRow(def)">＋ 添加</button>
      </div>
      <div v-if="ed.getRows(def).length === 0" class="none">暂无</div>

      <div v-for="(row, idx) in ed.getRows(def)" :key="idx" class="row" :class="{ bad: !!ed.violationOf(def, row) }">
        <div class="row-hd">
          <span class="idx">{{ idx + 1 }}</span>

          <!-- field 下拉：只有 overrides 有 field 列 -->
          <select v-if="has(def.headers, 'field')" class="cell" :value="row.field || ''"
            @change="ed.setCell(def, idx, 'field', ($event.target as HTMLSelectElement).value)">
            <option value="">— 字段 —</option>
            <option v-for="f in ed.fieldOptions(row)" :key="f" :value="f">{{ f }}</option>
          </select>

          <!-- role 下拉：只有声明了 role 列且有可选项的表（contributors 两者都没有 → 不出控件） -->
          <select v-else-if="has(def.headers, 'role') && ed.roleOptions[def.key]" class="cell" :value="row.role || ''"
            @change="ed.setCell(def, idx, 'role', ($event.target as HTMLSelectElement).value)">
            <option v-for="o in ed.roleOptions[def.key]" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>

          <span class="gap" />
          <template v-if="has(def.headers, 'by')">
            <input class="cell cell-sm" :value="row.by || ''" placeholder="by（谁）"
              @input="ed.setCell(def, idx, 'by', ($event.target as HTMLInputElement).value)" />
          </template>
          <template v-if="has(def.headers, 'at')">
            <input class="cell cell-sm" :value="row.at || ''" placeholder="at（日期）"
              @input="ed.setCell(def, idx, 'at', ($event.target as HTMLInputElement).value)" />
          </template>
          <button class="mini danger" @click="ed.removeRow(def, idx)">删除</button>
        </div>
        <p v-if="ed.violationOf(def, row)" class="warn">⚠ {{ ed.violationOf(def, row) }}</p>

        <!-- overrides：原 / 改 -->
        <div v-if="def.key === 'overrides'" class="pair">
          <div class="box box-orig"><span class="ok">原</span><div class="bv">{{ origValueOf(row) }}</div></div>
          <div class="box box-new">
            <span class="ok new">改</span>
            <div class="bv">
              <textarea class="cell area" :value="row.value || ''" rows="3"
                @input="ed.setCell(def, idx, 'value', ($event.target as HTMLTextAreaElement).value)" />
            </div>
          </div>
        </div>

        <!-- categories：主分类对照 + 分类下拉 -->
        <div v-else-if="def.key === 'categories'" class="pair">
          <div class="box box-orig"><span class="ok">原</span><div class="bv">主分类 {{ ed.upstream.value.category }}</div></div>
          <div class="box box-new">
            <span class="ok new">改</span>
            <div class="bv">
              <select class="cell" :value="row.category || ''"
                @change="ed.setCell(def, idx, 'category', ($event.target as HTMLSelectElement).value)">
                <option value="">— 分类 —</option>
                <option v-for="c in ed.categories" :key="c" :value="c">{{ c }}</option>
              </select>
              <p class="note">{{ isMain(row) ? `覆盖主分类为 ${row.category || '（未选）'}` : `追加副分类 ${row.category || '（未选）'}` }}</p>
            </div>
          </div>
        </div>

        <!-- references：URL + 显示名（含站点名候选） -->
        <div v-else-if="def.key === 'references'" class="pair">
          <div class="box box-orig">
            <span class="ok">原</span>
            <div class="bv">{{ isMain(row) ? `主链接 ${ed.upstream.value.link || '（上游为空）'}` : '追加参考链接' }}</div>
          </div>
          <div class="box box-new">
            <span class="ok new">改</span>
            <div class="bv">
              <input class="cell mono" :value="row.url || ''" placeholder="https://…"
                @input="ed.setCell(def, idx, 'url', ($event.target as HTMLInputElement).value)" />
              <input class="cell" :value="row.label || ''" list="src-names-raw" placeholder="显示名（留空＝自动识别）"
                @input="ed.setCell(def, idx, 'label', ($event.target as HTMLInputElement).value)" />
            </div>
          </div>
        </div>

        <!-- related：词条选择器 -->
        <div v-else-if="def.key === 'related'" class="rel-cell">
          <div v-if="row.target_id && ed.itemMap.get(row.target_id)" class="picked">
            <span class="picked-name" :style="{ color: (ed.itemMap.get(row.target_id) as any).categoryColor }">
              {{ (ed.itemMap.get(row.target_id) as any).title }}
            </span>
            <code class="picked-id">{{ row.target_id }}</code>
            <button class="mini" @click="ed.setCell(def, idx, 'target_id', '')">×</button>
          </div>
          <div v-else class="pop-wrap">
            <input v-model="relSearch" class="cell grow" placeholder="搜索词条名 / ID…"
              @keydown.enter.prevent="relResults.length > 0 && ed.setCell(def, idx, 'target_id', relResults[0].id)" />
            <div v-if="relSearch && relResults.length" class="pop">
              <button v-for="r in relResults" :key="r.id" class="pop-row" @click="ed.setCell(def, idx, 'target_id', r.id)">
                <span class="pop-name">{{ r.title }}</span><span class="pop-tier">{{ (r as any).tier }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- extra：标记行（flag 下拉 + note） -->
        <div v-else-if="def.key === 'extra'" class="pair">
          <div class="box box-orig"><span class="ok">原</span><div class="bv">无标记</div></div>
          <div class="box box-new">
            <span class="ok new">改</span>
            <div class="bv">
              <select class="cell" :value="row.flag || ''"
                @change="ed.setCell(def, idx, 'flag', ($event.target as HTMLSelectElement).value)">
                <option v-for="f in ed.extraFlags" :key="f" :value="f">{{ f === 'warn' ? '警示 warn' : '需补充 need' }}</option>
              </select>
              <input class="cell" :value="row.note || ''" placeholder="note（前端 hover 提示文案，可空）"
                @input="ed.setCell(def, idx, 'note', ($event.target as HTMLInputElement).value)" />
            </div>
          </div>
        </div>

        <!-- contributors：署名行（by/at 已在行首），正文无需控件 -->
      </div>
    </section>

    <datalist id="src-names-raw">
      <option v-for="n in ed.sourceNames" :key="n" :value="n" />
    </datalist>

    <section class="tbl">
      <div class="hd"><h3 title="related.csv 里指向本词条的行；双向索引，改请去对面词条">反向关联（只读）</h3></div>
      <div v-if="reverseRelated.length === 0" class="none">暂无</div>
      <div v-for="rev in reverseRelated" :key="rev.sourceId" class="row">
        <div class="picked">
          <span class="picked-name" :style="{ color: (ed.itemMap.get(rev.sourceId) as any)?.categoryColor }">
            {{ (ed.itemMap.get(rev.sourceId) as any)?.title || rev.sourceId }}
          </span>
          <span class="gap" />
          <button class="mini" @click="ed.selectedId.value = rev.sourceId">跳转</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.tbl { margin-bottom: 1.25rem; border: 1px solid var(--white-09); border-radius: 10px; padding: 0.85rem 1rem; }
.tbl.on { border-color: var(--white-16); background: var(--white-025); }
.hd { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
.hd h3 { font-size: var(--font-xs); font-weight: 700; color: var(--white-70); }
.file { font-size: var(--font-micro); color: var(--white-45); font-family: 'SF Mono', ui-monospace, monospace; }
.n { font-size: var(--font-micro); color: var(--white-50); }
.gap { flex: 1; }
.none { font-size: var(--font-xs); color: var(--white-45); }
.add-txt { font-size: var(--font-xs); padding: 0.2rem 0.6rem; border-radius: 6px; background: none; border: 1px solid var(--white-16); color: var(--white-65); cursor: pointer; }
.add-txt:hover { border-color: var(--white-40); color: #fff; }

.row { padding: 0.5rem 0.55rem; border-radius: 8px; margin-bottom: 0.4rem; background: var(--white-025); }
.row.bad { background: color-mix(in srgb, var(--color-danger) 10%, transparent); }
.row-hd { display: flex; align-items: center; gap: 0.45rem; margin-bottom: 0.45rem; }
.idx { font-size: var(--font-micro); color: var(--white-50); min-width: 0.9rem; }
.warn { font-size: var(--font-xs); color: var(--color-danger); margin-bottom: 0.4rem; }
.cell { padding: 0.3rem 0.5rem; font-size: var(--font-sm); background: var(--white-06); border: 1px solid var(--white-14); border-radius: 7px; color: var(--white-92); }
.cell:focus { border-color: var(--color-accent); outline: none; }
.cell.grow { flex: 1; min-width: 13rem; }
.cell-sm { min-width: 6.5rem; }
.cell.area { width: 100%; font-family: inherit; line-height: 1.7; resize: vertical; }
.mono { font-family: 'SF Mono', ui-monospace, monospace; font-size: var(--font-xs); }
.mini { font-size: var(--font-tiny); padding: 0.1rem 0.5rem; border-radius: 5px; background: none; border: 1px solid var(--white-16); color: var(--white-65); cursor: pointer; }
.mini:hover { border-color: var(--white-40); color: #fff; }
.mini.danger:hover { border-color: var(--color-danger); color: var(--color-danger); }

.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 0.55rem; }
@media (max-width: 1100px) { .pair { grid-template-columns: 1fr; } }
.box { display: flex; gap: 0.45rem; padding: 0.45rem 0.55rem; border-radius: 8px; border: 1px solid var(--white-08); }
.box-orig { border-left: 3px solid var(--white-25); }
.box-new { background: color-mix(in srgb, var(--color-accent) 5%, transparent); border-left: 3px solid var(--color-accent); }
.ok { flex-shrink: 0; font-size: var(--font-micro); font-weight: 700; padding: 0.05rem 0.3rem; border-radius: 4px; background: var(--white-10); color: var(--white-65); }
.ok.new { background: color-mix(in srgb, var(--color-accent) 22%, transparent); color: var(--color-accent-bright); }
.bv { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.35rem; font-size: var(--font-xs); color: var(--white-75); white-space: pre-wrap; word-break: break-word; }
.note { font-size: var(--font-tiny); color: var(--white-55); }

.rel-cell { display: flex; flex-direction: column; }
.picked { display: flex; align-items: center; gap: 0.5rem; }
.picked-name { font-size: var(--font-sm); font-weight: 700; }
.picked-id { font-size: var(--font-micro); color: var(--white-50); font-family: 'SF Mono', ui-monospace, monospace; }
.pop-wrap { position: relative; }
.pop { position: absolute; top: 100%; left: 0; right: 0; z-index: 20; margin-top: 0.2rem; padding: 0.3rem; border-radius: 9px; background: #16181d; border: 1px solid var(--white-16); box-shadow: 0 14px 34px rgba(0, 0, 0, 0.55); }
.pop-row { display: flex; align-items: center; gap: 0.5rem; width: 100%; padding: 0.35rem 0.5rem; font-size: var(--font-xs); text-align: left; background: none; border: none; border-radius: 7px; color: var(--white-80); cursor: pointer; }
.pop-row:hover { background: var(--white-08); color: #fff; }
.pop-name { flex: 1; }
.pop-tier { font-size: var(--font-micro); color: var(--white-50); }
</style>
