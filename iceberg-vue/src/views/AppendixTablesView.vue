<script setup lang="ts">
// 副表整表编辑（DEV 专用路由 /appendix-tables）。
//
// 与 /appendix-edit（按词条组织：先选词条再看它的七张副表）互补：这里**按表组织**，
// 直接把某张副表的全部行铺成一张网格，适合批量核对 / 批量补字段 / 清理重复行。
//
// 两侧共用同一个编辑模型（useAppendixEditor），但各自持有实例 —— 也就是说
// 在整表模式里的改动**不会**带到词条模式的未保存状态里；反之亦然。跨模式只靠磁盘保存交接。
import { computed, ref } from 'vue'
import { Plus, Trash2 } from '@lucide/vue'
import DevShell from '../components/dev/DevShell.vue'
import { useAppendixEditor } from '../lib/iceberg/useAppendixEditor'
import { EXTRA_FLAGS, type AppendixKey, type AppendixTableDef } from '../lib/iceberg/appendix'

const ed = useAppendixEditor()

const TAB_LABELS: Record<AppendixKey, string> = {
  overrides: '标量字段',
  categories: '分类',
  references: '链接',
  reading: '推荐书目',
  related: '关联',
  contributors: '署名',
  extra: '标记',
  entities: '语义实体',
}

const COL_LABELS: Record<AppendixKey, Record<string, string>> = {
  overrides: { item_id: '词条', field: '字段', value: '新值' },
  categories: { item_id: '词条', category: '分类', role: '角色' },
  references: { source_id: '词条', label: '显示名', url: '链接', role: '角色' },
  reading: { item_id: '词条', title: '书名', by: '作者', at: '年份', url: '链接', recommender: '推荐者', note: '理由' },
  related: { source_id: '词条', target_id: '关联词条' },
  contributors: { item_id: '词条', by: '姓名', at: '日期' },
  extra: { item_id: '词条', flag: '标记', note: '备注' },
  entities: { item_id: '词条', places: '地名', times: '时间', nouns: '核心名词' },
}

const activeKey = ref<AppendixKey>('overrides')
const query = ref('')

const def = computed<AppendixTableDef>(() => ed.defOf(activeKey.value))
const rows = computed(() => {
  void ed.tick.value
  return ed.tableRows(activeKey.value)
})

const idColumns = computed(() => new Set([def.value.idColumn, 'target_id']))
const titleOf = (id: string) => ed.itemMap.get(id)?.title || ''

// 词条候选（datalist）：id + 标题，按标题排序
const itemOptions = computed(() =>
  [...ed.itemMap.values()]
    .map((it) => ({ id: it.id as string, title: (it.title as string) || '' }))
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN')),
)

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return rows.value
  const cols = def.value.headers
  return rows.value.filter((row) => {
    if (titleOf((row[def.value.idColumn] || '').trim()).toLowerCase().includes(q)) return true
    return cols.some((c) => (row[c] || '').toLowerCase().includes(q))
  })
})

function labelOf(key: AppendixKey, col: string) {
  // id 列与首列「词条（标题）」区分开，否则表头会出现两个“词条”
  if (col === 'target_id') return '关联词条 id'
  if (col === 'item_id' || col === 'source_id') return '词条 id'
  return COL_LABELS[key]?.[col] || col
}

/** 某列是不是下拉（角色 / 字段 / 标记）；其余是文本框 */
function optionsFor(row: Record<string, string>, col: string): Array<{ value: string; label: string }> | null {
  if (col === 'role') return ed.roleOptions[def.value.key] || null
  if (col === 'field') return ed.fieldOptions(row).map((v) => ({ value: v, label: v }))
  if (col === 'flag') return EXTRA_FLAGS.map((f) => ({ value: f, label: f }))
  return null
}

function isBlankExceptId(row: Record<string, string>) {
  return def.value.headers.every((h) => h === def.value.idColumn || !(row[h] || '').trim())
}
function rowInvalid(row: Record<string, string>) {
  return !(row[def.value.idColumn] || '').trim() && !isBlankExceptId(row)
}

function addRow() {
  ed.addTableRow(def.value)
}
function removeRow(row: Record<string, string>) {
  ed.removeTableRow(def.value, row)
}
function setCell(row: Record<string, string>, col: string, val: string) {
  ed.setTableRowCell(def.value, row, col, val)
}
</script>

<template>
  <DevShell title="副表 · 整表编辑" layout="fill">
    <template #subtitle>
      按表组织，不按词条：直接铺开一整张副表改行。与「副表编辑」（按词条）共用同一套解析 / 校验 / 保存。
    </template>
    <template #actions>
      <button
        v-if="ed.dirtyCount.value > 0"
        type="button"
        class="dev-btn dev-btn--primary"
        :disabled="ed.saving.value"
        @click="ed.saveAll()"
      >{{ ed.saving.value ? '保存中…' : `保存 ${ed.dirtyCount.value} 张表` }}</button>
      <span v-else class="dev-note x-clean">已保存</span>
    </template>

    <!-- 表切换 -->
    <nav class="tabs" aria-label="副表">
      <button
        v-for="t in ed.tables"
        :key="t.key"
        type="button"
        class="tab"
        :class="{ on: activeKey === t.key }"
        :title="t.label"
        @click="activeKey = t.key"
      >
        {{ TAB_LABELS[t.key] }}
        <span class="tab-n">{{ ed.tableRows(t.key).length }}</span>
      </button>
    </nav>

    <!-- 工具条 -->
    <div class="bar">
      <input v-model="query" class="dev-input grow" type="search" placeholder="搜索任意列 / 词条标题" />
      <span class="dim">{{ def.file }}</span>
      <button type="button" class="dev-btn" @click="addRow"><Plus :size="12" :stroke-width="2" /> 新增行</button>
    </div>

    <!-- 提示区：孤儿行 / 越界 / 保存失败 -->
    <p v-if="ed.invalidRows.value.length" class="msg msg--warn">
      有行缺 id（保存会被拒绝）：{{ ed.invalidRows.value.join('；') }}
    </p>
    <p v-if="ed.violations.value.length" class="msg msg--warn">
      副表越界：{{ ed.violations.value.join('；') }}
    </p>
    <p v-if="ed.saveError.value" class="msg msg--err">{{ ed.saveError.value }}</p>

    <!-- 网格 -->
    <div class="gridwrap">
      <table class="grid">
        <thead>
          <tr>
            <th class="col-title">词条</th>
            <th v-for="h in def.headers" :key="h" :class="{ 'col-id': idColumns.has(h) }">{{ labelOf(def.key, h) }}</th>
            <th class="col-del" aria-label="删除" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in filtered" :key="i" :class="{ 'is-invalid': rowInvalid(row) }">
            <td class="col-title">
              <span class="title-txt" :title="titleOf((row[def.idColumn] || '').trim())">
                {{ titleOf((row[def.idColumn] || '').trim()) || '（未填 id）' }}
              </span>
            </td>
            <td v-for="h in def.headers" :key="h" :class="{ 'col-id': idColumns.has(h) }">
              <select
                v-if="optionsFor(row, h)"
                class="dev-input cell"
                :value="row[h] || ''"
                @change="setCell(row, h, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">（空）</option>
                <option v-for="o in optionsFor(row, h)!" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
              <template v-else-if="idColumns.has(h)">
                <input
                  class="dev-input cell"
                  :value="row[h] || ''"
                  :placeholder="h === 'target_id' ? '关联词条 id' : '词条 id'"
                  :list="h === 'target_id' ? 'apx-targets' : 'apx-items'"
                  @input="setCell(row, h, ($event.target as HTMLInputElement).value)"
                />
              </template>
              <input
                v-else
                class="dev-input cell"
                :value="row[h] || ''"
                :placeholder="labelOf(def.key, h)"
                @input="setCell(row, h, ($event.target as HTMLInputElement).value)"
              />
            </td>
            <td class="col-del">
              <button type="button" class="del" title="删除这一行" @click="removeRow(row)">
                <Trash2 :size="12" :stroke-width="2" />
              </button>
            </td>
          </tr>
          <tr v-if="!filtered.length">
            <td :colspan="def.headers.length + 2" class="empty">
              {{ rows.length ? '没有匹配的行' : '这张表还没有行；点「新增行」加一条' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="foot">
      共 {{ rows.length }} 行 · 显示 {{ filtered.length }} 行 · 有改动 {{ ed.dirtyCount.value }} 张表
    </p>

    <!-- 词条 id 候选（原生 datalist，不引第三方组件） -->
    <datalist id="apx-items">
      <option v-for="it in itemOptions" :key="it.id" :value="it.id">{{ it.title }}</option>
    </datalist>
    <datalist id="apx-targets">
      <option v-for="it in itemOptions" :key="it.id" :value="it.id">{{ it.title }}</option>
    </datalist>
  </DevShell>
</template>

<style scoped>
.x-clean { margin: 0; font-size: var(--font-xs); color: var(--color-success); }

.tabs { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.6rem; flex: none; }
.tab {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.22rem 0.6rem;
  border-radius: 6px;
  border: 1px solid var(--white-08);
  background: none;
  color: var(--white-55);
  font: inherit;
  font-size: var(--font-xs);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.tab:hover { color: var(--white-90); border-color: var(--white-18); }
.tab.on { color: #000; background: var(--color-accent); border-color: var(--color-accent); font-weight: 700; }
.tab-n { font-size: var(--font-micro); opacity: 0.7; font-variant-numeric: tabular-nums; }

.bar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.8rem; margin-bottom: 0.5rem; flex: none; }
.grow { flex: 1 1 14rem; }
.dim { font-size: var(--font-micro); color: var(--white-30); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }

.msg { margin: 0 0 0.5rem; padding: 0.4rem 0.7rem; border-radius: 8px; font-size: var(--font-xs); flex: none; }
.msg--warn {
  color: var(--color-accent-soft);
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-accent) 28%, transparent);
}
.msg--err {
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-danger) 30%, transparent);
}

.gridwrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--white-06);
  border-radius: 12px;
  background: var(--dev-surface, var(--white-035));
}
.grid { width: 100%; border-collapse: separate; border-spacing: 0; }
.grid th {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 0.4rem 0.5rem;
  text-align: left;
  font-size: var(--font-micro);
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--white-45);
  background: #0b0e13;
  border-bottom: 1px solid var(--white-08);
  white-space: nowrap;
}
.grid td {
  padding: 0.22rem 0.4rem;
  border-bottom: 1px solid var(--white-04);
  vertical-align: middle;
}
.grid tbody tr:hover td { background: var(--white-02); }
.grid tr.is-invalid td { background: color-mix(in srgb, var(--color-danger) 8%, transparent); }

.col-title { width: 11rem; max-width: 11rem; }
.col-id { width: 9rem; }
.col-del { width: 2.2rem; }
.title-txt {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-xs);
  color: var(--white-55);
}
.cell { width: 100%; min-width: 5rem; font-size: var(--font-micro); }
.del {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.6rem;
  height: 1.6rem;
  padding: 0;
  border-radius: 5px;
  border: 1px solid transparent;
  background: none;
  color: var(--white-30);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.del:hover { color: var(--color-danger); border-color: color-mix(in srgb, var(--color-danger) 40%, transparent); }
.empty { padding: 1.2rem; text-align: center; color: var(--white-30); font-size: var(--font-xs); }

.foot { margin: 0.5rem 0 0; font-size: var(--font-micro); color: var(--white-30); flex: none; }
</style>
