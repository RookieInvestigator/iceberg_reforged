<script setup lang="ts">
import { ref, computed } from 'vue'
import raw from '../data/iceberg.json'
import { normalizeData, formatUnixDate } from '../lib/data'
import { parseCSV } from '../lib/csv'

const data = normalizeData(raw)
const allItems = Object.entries(data.tiers).flatMap(([tierName, items]) =>
  (items as any[]).map(item => ({ ...item, tier: tierName }))
)
const itemMap = new Map(allItems.map(i => [i.id, i]))
const tiers = data.tierOrder.filter(t => t !== '说明')

// ==========================================
// 类型
// ==========================================
type Row = Record<string, string>
type Store = Map<string, Row[]>

// ==========================================
// 副表注册
// ==========================================
interface AppendixDef {
  key: string
  label: string
  file: string
  headers: string[]
  /** item-id 所在列名 */
  idColumn: string
}

const TYPES: AppendixDef[] = [
  { key: 'related', label: '关联词条', file: 'related.csv',
    headers: ['source_id', 'target_id'], idColumn: 'source_id' },
  { key: 'references', label: '参考链接', file: 'references.csv',
    headers: ['source_id', 'label', 'url'], idColumn: 'source_id' },
]

// ==========================================
// 加载副表文件
// ==========================================
const modules = import.meta.glob('../data/appendix/*.csv', { query: '?raw', import: 'default', eager: true })
const stores = new Map<string, Store>()

for (const def of TYPES) {
  const key = `../data/appendix/${def.file}`
  const rawCsv = (modules as Record<string, string>)[key] || ''
  const rows: Row[] = parseCSV(rawCsv)
  const store: Store = new Map()
  for (const row of rows) {
    const id = (row[def.idColumn] || '').trim()
    if (!id) continue
    if (!store.has(id)) store.set(id, [])
    store.get(id)!.push(row)
  }
  stores.set(def.key, store)
}

// ==========================================
// UI 状态
// ==========================================
const selectedId = ref<string | null>(null)
const search = ref('')
const selectedTier = ref('')
const tick = ref(0)
const dirtySet = ref(new Set<string>())
const saveError = ref('')
function bump(def: AppendixDef) { tick.value++; dirtySet.value.add(def.key); saveError.value = '' }
const dirtyCount = computed(() => dirtySet.value.size)

const selectedItem = computed(() =>
  selectedId.value ? itemMap.get(selectedId.value) ?? null : null
)

const filteredItems = computed(() => {
  let items = allItems
  if (selectedTier.value) items = items.filter(i => i.tier === selectedTier.value)
  if (search.value) {
    const q = search.value.toLowerCase()
    items = items.filter(i => i.title.toLowerCase().includes(q) || i.id.includes(q))
  }
  return items
})

// 左栏分页：默认显示 200 条，可「加载更多」直至全部
const PAGE_SIZE = 200
const visibleCount = ref(PAGE_SIZE)
const shownItems = computed(() => filteredItems.value.slice(0, visibleCount.value))
const hasMore = computed(() => filteredItems.value.length > visibleCount.value)
const hiddenCount = computed(() => filteredItems.value.length - visibleCount.value)
function loadMore() { visibleCount.value += PAGE_SIZE }

function hasAnyData(id: string): boolean {
  for (const [, store] of stores) {
    if (store.has(id)) return true
  }
  return false
}

// ==========================================
// 行操作
// ==========================================
function getRows(def: AppendixDef): Row[] {
  tick.value // 订阅 tick，确保 Map 变更后模板重新求值
  return stores.get(def.key)?.get(selectedId.value!) || []
}

function addRow(def: AppendixDef) {
  const store = stores.get(def.key)!
  const rows = store.get(selectedId.value!) || []
  const row: Row = {}
  for (const h of def.headers) row[h] = ''
  row[def.idColumn] = selectedId.value!
  rows.push(row)
  store.set(selectedId.value!, rows)
  bump(def)
}

function removeRow(def: AppendixDef, idx: number) {
  const store = stores.get(def.key)!
  const rows = store.get(selectedId.value!)
  if (!rows) return
  rows.splice(idx, 1)
  if (rows.length === 0) store.delete(selectedId.value!)
  bump(def)
}

function setCell(def: AppendixDef, idx: number, col: string, val: string) {
  const store = stores.get(def.key)!
  const rows = store.get(selectedId.value!)
  if (!rows) return
  rows[idx][col] = val
  bump(def)
}

// ==========================================
// 保存
// ==========================================
const saving = ref(false)
async function saveAll() {
  saving.value = true
  saveError.value = ''
  let ok = 0
  const failed: string[] = []
  for (const def of TYPES) {
    const store = stores.get(def.key)!
    const lines = [def.headers.join(',')]
    for (const [, rows] of store) {
      for (const row of rows) {
        lines.push(def.headers.map(h => {
          const v = (row[h] || '').trim()
          if (v.includes(',') || v.includes('"') || v.includes('\n') || v.includes('\r')) {
            return '"' + v.replace(/"/g, '""') + '"'
          }
          return v
        }).join(','))
      }
    }
    const content = '﻿' + lines.join('\n')
    try {
      const resp = await fetch('/__appendix-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: def.file, content }),
      })
      if (resp.ok) {
        ok++
      } else {
        const body = await resp.json().catch(() => ({})) as { error?: string }
        failed.push(`${def.file}: ${body.error || `HTTP ${resp.status}`}`)
      }
    } catch (e) {
      failed.push(`${def.file}: ${(e as Error).message}`)
    }
  }
  if (ok === TYPES.length) {
    dirtySet.value.clear()
  } else {
    // 失败：红色提示 + 保留 dirty 状态（修改不丢失，可重试）
    saveError.value = `保存失败：${failed.join('；')}。修改已保留，请重试。`
  }
  saving.value = false
}

function itemById(id: string) { return itemMap.get(id) }

// 反向关联：哪些词条把 selectedItem 设为了 target
const reverseRelated = computed(() => {
  if (!selectedId.value) return []
  const store = stores.get('related')
  if (!store) return []
  const result: { sourceId: string; row: Row }[] = []
  for (const [srcId, rows] of store) {
    for (const row of rows) {
      if ((row.target_id || '').trim() === selectedId.value) {
        result.push({ sourceId: srcId, row })
      }
    }
  }
  return result
})

// ==========================================
// 关联词条搜索
// ==========================================
const relSearch = ref('')
const relResults = computed(() => {
  if (!relSearch.value) return []
  const q = relSearch.value.toLowerCase()
  return allItems.filter(i => i.title.toLowerCase().includes(q) || i.id.includes(q)).slice(0, 12)
})
function usedTargets(def: AppendixDef): Set<string> {
  return new Set(getRows(def).map(r => (r.target_id || '').trim()).filter(Boolean))
}

// ==========================================
// 统计
// ==========================================
function itemCount(def: AppendixDef): number {
  return stores.get(def.key)!.size
}
function rowCount(def: AppendixDef): number {
  let n = 0
  for (const [, rows] of stores.get(def.key)!) n += rows.length
  return n
}
</script>

<template>
  <div class="root">
    <!-- 工具栏 -->
    <header class="bar">
      <span class="bar-title">副表编辑器</span>
      <span class="bar-gap" />
      <span v-if="dirtyCount > 0" class="dirty-badge">
        ⚠ 已修改 {{ dirtyCount }} 个副表
        — <button @click="saveAll()" class="btn-save" :disabled="saving">{{ saving ? '保存中…' : '保存' }}</button>
      </span>
      <span v-else class="clean-text">✓ 已保存</span>
    </header>

    <div v-if="saveError" class="save-error-bar">✗ {{ saveError }}</div>

    <div class="main">
      <!-- ===== 左栏：词条列表 ===== -->
      <aside class="side">
        <div class="side-hd">
          <input v-model="search" placeholder="搜索标题 / ID…" class="inp" />
          <select v-model="selectedTier" class="sel">
            <option value="">全部层级</option>
            <option v-for="t in tiers" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>
        <div class="side-list">
          <button
            v-for="item in shownItems" :key="item.id"
            @click="selectedId = item.id"
            class="side-row" :class="{ on: selectedId === item.id }"
          >
            <span class="side-dot" :class="{ fill: hasAnyData(item.id) }" />
            <span class="side-name">{{ item.title }}</span>
            <span class="side-tier">{{ item.tier }}</span>
          </button>
        </div>
        <button v-if="hasMore" @click="loadMore()" class="side-more">
          加载更多（还有 {{ hiddenCount }} 个）
        </button>
      </aside>

      <!-- ===== 右栏：该词条的全部副表数据 ===== -->
      <div class="work" v-if="selectedItem">
        <!-- 词条信息 -->
        <div class="card">
          <h2 class="card-title">{{ selectedItem.title }}</h2>
          <div class="card-badges">
            <span class="badge">{{ selectedItem.tier }}</span>
            <span class="badge" :style="{ color: selectedItem.categoryColor, borderColor: selectedItem.categoryColor + '66' }">
              {{ selectedItem.category }}
            </span>
            <code class="id-code">{{ selectedItem.id }}</code>
          </div>
          <p class="card-desc" v-if="(selectedItem as any).desc">
            {{ (selectedItem as any).desc }}
          </p>
          <div class="card-meta" v-if="(selectedItem as any).createdAt">
            <span>创建：{{ formatUnixDate((selectedItem as any).createdAt) }}</span>
            <span v-if="(selectedItem as any).modifiedAt !== (selectedItem as any).createdAt">
              更新：{{ formatUnixDate((selectedItem as any).modifiedAt) }}
            </span>
          </div>
          <div class="card-tags" v-if="(selectedItem as any).tags?.length">
            <span v-for="t in (selectedItem as any).tags" :key="t" class="card-tag">#{{ t }}</span>
          </div>
          <a v-if="(selectedItem as any).link" :href="(selectedItem as any).link" target="_blank" class="card-link">
            原始链接 →
          </a>
        </div>

        <!-- 每种副表一个 section -->
        <section v-for="def in TYPES" :key="def.key" class="sec">
          <div class="sec-hd">
            <h3>{{ def.label }}</h3>
            <span class="sec-n">{{ getRows(def).length }} 行</span>
            <span class="sec-gap" />
            <button @click="addRow(def)" class="btn-add">+ 添加</button>
          </div>

          <!-- 关联词条专用 UI -->
          <template v-if="def.key === 'related'">
            <!-- 正向关联 -->
            <div class="rel-label">此词条关联到</div>
            <div v-if="getRows(def).length === 0" class="none">暂无</div>
            <div v-for="(row, idx) in getRows(def)" :key="'f'+idx" class="rel-row">
              <span class="rel-idx">{{ idx + 1 }}</span>
              <div class="rel-cell">
                <div v-if="row.target_id && itemById(row.target_id)" class="rel-picked">
                  <span class="rel-picked-name" :style="{ color: (itemById(row.target_id) as any).categoryColor }">
                    {{ (itemById(row.target_id) as any).title }}
                  </span>
                  <span class="rel-picked-tier">{{ (itemById(row.target_id) as any).tier }}</span>
                  <code class="rel-picked-id">{{ row.target_id }}</code>
                  <button @click="setCell(def, idx, 'target_id', '')" class="rel-clear">×</button>
                </div>
                <div v-else class="rel-search-wrap">
                  <input
                    v-model="relSearch"
                    @keydown.enter.prevent="relResults.length > 0 && setCell(def, idx, 'target_id', relResults[0].id)"
                    :placeholder="row.target_id ? `ID: ${row.target_id}（未找到）` : '搜索词条…'"
                    class="inp inp-sm"
                  />
                  <div v-if="relSearch && relResults.length" class="rel-drop">
                    <button
                      v-for="r in relResults" :key="r.id"
                      @click="setCell(def, idx, 'target_id', r.id)"
                      class="rel-drop-row"
                      :class="{ used: usedTargets(def).has(r.id) }"
                    >
                      <span class="rel-drop-name">{{ r.title }}</span>
                      <span class="rel-drop-tier">{{ (r as any).tier }}</span>
                      <span :style="{ color: (r as any).categoryColor }">{{ (r as any).category }}</span>
                    </button>
                  </div>
                </div>
              </div>
              <button @click="removeRow(def, idx)" class="btn-del">删除</button>
            </div>

            <!-- 反向关联 -->
            <div class="rel-label" :class="{ mt: getRows(def).length > 0 }">关联到此词条</div>
            <div v-if="reverseRelated.length === 0" class="none">暂无</div>
            <div v-for="rev in reverseRelated" :key="'r'+rev.sourceId" class="rel-row rev-row">
              <span class="rel-idx rev-idx">←</span>
              <div class="rel-cell">
                <div class="rel-picked" v-if="itemById(rev.sourceId)">
                  <span class="rel-picked-name" :style="{ color: (itemById(rev.sourceId) as any).categoryColor }">
                    {{ (itemById(rev.sourceId) as any).title }}
                  </span>
                  <span class="rel-picked-tier">{{ (itemById(rev.sourceId) as any).tier }}</span>
                  <code class="rel-picked-id">{{ rev.sourceId }}</code>
                </div>
                <code v-else class="rel-missing-id">{{ rev.sourceId }}（未找到）</code>
              </div>
              <button @click="selectedId = rev.sourceId" class="btn-goto" title="跳转编辑">编辑</button>
            </div>
          </template>

          <!-- 通用表格 UI（其他副表类型） -->
          <template v-else>
            <div v-if="getRows(def).length === 0" class="none">暂无数据</div>
            <table v-else class="tbl">
              <thead><tr><th v-for="h in def.headers" :key="h">{{ h }}</th><th></th></tr></thead>
              <tbody>
                <tr v-for="(row, idx) in getRows(def)" :key="idx">
                  <td v-for="h in def.headers" :key="h">
                    <input
                      v-if="h !== def.idColumn"
                      :value="row[h] || ''"
                      @input="setCell(def, idx, h, ($event.target as HTMLInputElement).value)"
                      class="cell-inp"
                    />
                    <code v-else class="cell-id">{{ row[h] }}</code>
                  </td>
                  <td><button @click="removeRow(def, idx)" class="btn-del">删除</button></td>
                </tr>
              </tbody>
            </table>
          </template>
        </section>
      </div>

      <div class="work empty" v-else>
        <p>← 选择词条开始编辑</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ===== 基础 ===== */
.root { display: flex; flex-direction: column; height: 100vh; background: var(--color-surface); color: var(--white-82); font: 15px/1.5 system-ui, -apple-system, sans-serif; }
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ===== 工具栏 ===== */
.bar { display: flex; align-items: center; gap: 0.6rem; padding: 0.5rem 1.25rem; border-bottom: 1px solid var(--white-06); flex-shrink: 0; }
.bar-title { font-weight: 700; font-size: 1rem; }
.bar-gap { flex: 1; }
.dirty-badge { font-size: var(--font-xs); color: var(--color-fav); display: flex; align-items: center; gap: 0.4rem; }
.btn-save { font-size: var(--font-xs); padding: 0.25rem 0.7rem; border-radius: 5px; cursor: pointer; border: 1px solid var(--color-fav); background: color-mix(in srgb, var(--color-fav) 10%, transparent); color: var(--color-fav); }
.btn-save:hover { background: color-mix(in srgb, var(--color-fav) 20%, transparent); }
.clean-text { font-size: var(--font-xs); color: var(--white-18); }
.save-error-bar { flex-shrink: 0; padding: 0.4rem 1.25rem; font-size: var(--font-xs); color: var(--color-danger); background: color-mix(in srgb, var(--color-danger) 8%, transparent); border-bottom: 1px solid color-mix(in srgb, var(--color-danger) 25%, transparent); }

/* ===== 主布局 ===== */
.main { display: flex; flex: 1; overflow: hidden; }

/* ===== 左栏 ===== */
.side { width: 280px; flex-shrink: 0; display: flex; flex-direction: column; border-right: 1px solid var(--white-05); }
.side-hd { padding: 0.6rem; display: flex; flex-direction: column; gap: 0.35rem; border-bottom: 1px solid var(--white-04); }
.inp { width: 100%; padding: 0.38rem 0.5rem; font-size: var(--font-sm); border-radius: 5px; background: var(--white-04); border: 1px solid var(--white-07); color: var(--white-70); }
.inp:focus { border-color: var(--white-18); background: var(--white-05); }
.inp-sm { font-size: var(--font-sm); padding: 0.28rem 0.45rem; }
.sel { padding: 0.28rem 0.45rem; font-size: var(--font-xs); border-radius: 5px; background: var(--white-03); border: 1px solid var(--white-06); color: var(--white-40); }
.side-list { flex: 1; overflow-y: auto; padding: 0.2rem 0; }
.side-row { display: flex; align-items: center; gap: 0.4rem; width: 100%; padding: 0.32rem 0.7rem; font-size: var(--font-sm); text-align: left; background: none; border: none; color: var(--white-38); cursor: pointer; }
.side-row:hover { background: var(--white-025); color: var(--white-55); }
.side-row.on { background: var(--white-05); color: var(--white-82); }
.side-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; border: 1px solid var(--white-10); }
.side-dot.fill { background: var(--color-success); border-color: var(--color-success); }
.side-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.side-tier { font-size: var(--font-micro); color: var(--white-13); flex-shrink: 0; }
.side-more { display: block; width: 100%; padding: 0.4rem 0.7rem; font-size: var(--font-xs); text-align: center; background: none; border: none; border-top: 1px solid var(--white-05); color: var(--white-30); cursor: pointer; flex-shrink: 0; }
.side-more:hover { color: var(--white-60); }

/* ===== 右栏 ===== */
.work { flex: 1; overflow-y: auto; padding: 1.5rem 2rem 4rem; }
.work.empty { display: flex; align-items: center; justify-content: center; color: var(--white-12); font-size: var(--font-base); }

/* 词条信息卡 */
.card { border: 1px solid var(--white-05); border-radius: 7px; padding: 1rem 1.25rem; margin-bottom: 1.5rem; background: var(--white-015); }
.card-title { font-size: 1.2rem; font-weight: 800; color: var(--white-88); margin-bottom: 0.3rem; }
.card-badges { display: flex; gap: 0.4rem; flex-wrap: wrap; align-items: center; margin-bottom: 0.5rem; }
.badge { font-size: var(--font-tiny); padding: 0.08rem 0.4rem; border-radius: 3px; border: 1px solid var(--white-10); color: var(--white-30); }
.id-code { font-size: var(--font-micro); color: var(--white-16); font-family: 'SF Mono', monospace; }
.card-desc { font-size: var(--font-sm); color: var(--white-35); line-height: 1.65; margin-bottom: 0.5rem; white-space: pre-wrap; }
.card-meta { display: flex; gap: 1rem; font-size: var(--font-xs); color: var(--white-20); margin-bottom: 0.35rem; }
.card-tags { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-bottom: 0.35rem; }
.card-tag { font-size: var(--font-tiny); color: var(--white-18); }
.card-link { font-size: var(--font-xs); color: var(--white-25); text-decoration: none; }
.card-link:hover { color: var(--white-50); }

/* ===== Section ===== */
.sec { margin-bottom: 2rem; }
.sec-hd { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.7rem; }
.sec-hd h3 { font-size: var(--font-sm); font-weight: 600; color: var(--white-50); }
.sec-n { font-size: var(--font-xs); color: var(--white-18); }
.sec-gap { flex: 1; }
.btn-add { font-size: var(--font-xs); padding: 0.18rem 0.55rem; border-radius: 4px; background: var(--white-05); border: 1px solid var(--white-10); color: var(--white-45); cursor: pointer; }
.btn-add:hover { background: var(--white-09); color: var(--white-70); }
.none { font-size: var(--font-sm); color: var(--white-16); padding: 0.8rem 0; }

/* ===== 关联行 ===== */
.rel-row { display: flex; align-items: flex-start; gap: 0.4rem; padding: 0.4rem 0.5rem; background: var(--white-012); border: 1px solid var(--white-04); border-radius: 6px; margin-bottom: 0.3rem; }
.rel-idx { font-size: var(--font-tiny); color: var(--white-11); min-width: 1rem; padding-top: 0.3rem; text-align: right; }
.rel-cell { flex: 1; min-width: 0; }
.btn-del { font-size: var(--font-tiny); padding: 0.1rem 0.45rem; border-radius: 3px; flex-shrink: 0; background: none; border: 1px solid var(--white-06); color: var(--white-18); cursor: pointer; }
.btn-del:hover { border-color: var(--color-danger); color: var(--color-danger); }

/* 已选词条 */
.rel-picked { display: flex; align-items: center; gap: 0.4rem; padding: 0.2rem 0; }
.rel-picked-name { font-size: var(--font-sm); font-weight: 600; }
.rel-picked-tier { font-size: var(--font-tiny); color: var(--white-20); }
.rel-picked-id { font-size: var(--font-micro); color: var(--white-12); font-family: 'SF Mono', monospace; }
.rel-missing-id { font-size: var(--font-xs); color: var(--white-15); }
.rel-clear { font-size: var(--font-xs); padding: 0 0.15rem; background: none; border: none; color: var(--white-12); cursor: pointer; margin-left: auto; }
.rel-clear:hover { color: var(--color-danger); }
.rel-label { font-size: var(--font-xs); color: var(--white-22); margin-bottom: 0.35rem; }
.rel-label.mt { margin-top: 1rem; }
.rev-row { opacity: 0.7; border-style: dashed; }
.rev-idx { color: var(--white-08); }
.btn-goto { font-size: var(--font-tiny); padding: 0.1rem 0.5rem; border-radius: 3px; flex-shrink: 0; background: none; border: 1px solid var(--white-08); color: var(--white-25); cursor: pointer; }
.btn-goto:hover { border-color: var(--white-25); color: var(--white-55); }

/* 搜索下拉 */
.rel-search-wrap { position: relative; }
.rel-drop { position: absolute; top: 100%; left: 0; right: 0; z-index: 20; max-height: 240px; overflow-y: auto; margin-top: 0.15rem; background: var(--color-modal-bg); border: 1px solid var(--white-10); border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
.rel-drop-row { display: flex; align-items: center; gap: 0.4rem; width: 100%; padding: 0.35rem 0.55rem; font-size: var(--font-xs); text-align: left; background: none; border: none; cursor: pointer; color: var(--white-42); }
.rel-drop-row:hover { background: var(--white-05); color: var(--white-72); }
.rel-drop-row.used { opacity: 0.25; }
.rel-drop-name { flex: 1; }
.rel-drop-tier { font-size: var(--font-micro); color: var(--white-14); }
.rel-drop-row span:last-child { font-size: var(--font-micro); }

/* 通用表格 */
.tbl { width: 100%; border-collapse: collapse; font-size: var(--font-xs); }
.tbl th { text-align: left; font-weight: 500; font-size: var(--font-tiny); color: var(--white-18); padding: 0.25rem 0.4rem; border-bottom: 1px solid var(--white-04); }
.tbl td { padding: 0.2rem 0.4rem; }
.cell-inp { width: 100%; padding: 0.25rem 0.35rem; font-size: var(--font-xs); background: var(--white-02); border: 1px solid var(--white-06); border-radius: 4px; color: var(--white-60); }
.cell-inp:focus { border-color: var(--white-14); }
.cell-id { font-size: var(--font-tiny); color: var(--white-13); }
</style>
