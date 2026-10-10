<script setup lang="ts">
// ReviewDetail：工作台右栏 —— 当前值 vs 建议值（五字段均可就地编辑）+ 作者说明 + 三个决定键。
//
// 反馈表单允许改五个字段（title/desc/link/category/tags），这里一一对应呈现与编辑。
// 编辑语义：改动只进 decisions.json 的 edits，**不写 Supabase**（RLS 也不允许改他人行），
// 落盘时由 apply_feedback.py 用编辑后的值；反馈没提到的字段也能补。
// 空编辑 = 撤销该字段的修改（不做删除语义：副表本就是追加/覆盖模型）。
import { computed, reactive, ref, watch } from 'vue'
import TagPicker from './TagPicker.vue'
import {
  effectiveTags, effectiveValue, hasEdits, serializeTags,
  type DecisionRecord, type FeedbackRow, type FieldEdits,
} from '../../lib/feedbackReview'
import { hostOf, sourceLabel } from '../../lib/sourceLabel'

interface CurrentItem {
  id?: string
  title: string
  desc?: string
  link?: string
  category?: string
  tier?: string
  tags?: string[]
  emojis?: string[]
}

type Field = 'title' | 'desc' | 'link' | 'category' | 'tags'
const FIELDS: Field[] = ['title', 'desc', 'link', 'category', 'tags']
const TEXT_FIELDS = ['title', 'desc', 'link', 'category'] as const
type TextField = (typeof TEXT_FIELDS)[number]

const props = defineProps<{
  row: FeedbackRow | null
  item: CurrentItem | null
  decision: DecisionRecord | undefined
  edits: FieldEdits | undefined
  byName: string
  /** 署名解析状态：pending 解析中 / ok 已解析（可能确实没设昵称）/ offline 未尝试（落盘时由脚本解） */
  nameState: 'pending' | 'ok' | 'offline'
  /** 分类下拉选项（categoryColors 的键）与标签多选项（tagMap 的值）+ 名称→emoji */
  categoryOptions: string[]
  tagOptions: string[]
  tagEmoji: Record<string, string>
}>()
const emit = defineEmits<{
  decide: [decision: 'accept' | 'reject' | 'later', reason?: string]
  edit: [patch: FieldEdits]
}>()

const reason = ref('')
const editing = reactive<Record<Field, boolean>>({ title: false, desc: false, link: false, category: false, tags: false })
const draft = reactive<Record<TextField, string>>({ title: '', desc: '', link: '', category: '' })
const tagDraft = ref<string[]>([])
/** 链接副表的两个附加属性：显示名（留空 = 自动按域名判）与角色（main 覆盖主链接 / ref 附加） */
const draftLabel = ref('')
const draftRole = ref<'main' | 'ref'>('ref')

// 换行 / 编辑落定后重置草稿，避免把上一条的改动带过去（item 换条也要重置：起点取决于当前值）
watch(() => [props.row?.id, props.item?.id, props.edits], () => {
  reason.value = props.decision?.reason || ''
  for (const f of FIELDS) editing[f] = false
  for (const f of TEXT_FIELDS) draft[f] = initialOf(f)
  tagDraft.value = initialTags()
  draftLabel.value = props.edits?.linkLabel || ''
  draftRole.value = props.edits?.linkRole === 'main' ? 'main' : 'ref'
}, { immediate: true, deep: true })

const byLabel = computed(() => {
  if (props.byName) return props.byName
  if (props.nameState === 'pending') return '解析中…'
  if (props.nameState === 'ok') return '未设昵称（前端显示匿名）'
  return '离线未解析（落盘时由脚本解析）'
})

const curDesc = computed(() => props.item?.desc || '')
const deltaDesc = computed(() => {
  if (!props.row) return 0
  return effectiveValue(props.row, props.edits, 'desc').length - curDesc.value.length
})
const effLink = computed(() => (props.row ? effectiveValue(props.row, props.edits, 'link') : ''))
const effCat = computed(() => (props.row ? effectiveValue(props.row, props.edits, 'category') : ''))
const effTags = computed(() => (props.row ? effectiveTags(props.row, props.edits) : []))
const curTags = computed(() => props.item?.tags || [])
const categoryDiffers = computed(() => !!effCat.value && effCat.value !== (props.item?.category || ''))
/** 反馈没改此项时的统一提示：采纳不会覆盖原文（changes 是 diff，只带改动过的字段） */
const UNTOUCHED = '（反馈未改此项 —— 采纳不会覆盖原文）'

const isEdited = (f: Field) => !!(props.edits && f in props.edits)
const proposed = (f: TextField) => (props.row ? effectiveValue(props.row, props.edits, f) : '')
const tagLabel = (n: string) => `${props.tagEmoji[n] || '·'} ${n}`

/** 当前值（主数据里已有的正文/链接/分类）—— 反馈没改此项时，编辑器要从这里起步 */
function curOf(f: TextField): string {
  const it = props.item
  if (!it) return ''
  if (f === 'title') return it.title || ''
  if (f === 'desc') return it.desc || ''
  if (f === 'link') return it.link || ''
  return it.category || ''
}

/**
 * 编辑器起点：建议值优先（反馈已提改动 / 你已改过），否则预填**当前值**。
 * 为什么不能留空：空编辑器会被误读成「这里没有内容」，而「反馈未改此项」的正确含义是
 * 「保持原文不变」—— 留空既误导人，也让「保存」变得没有意义（见 commit 的比较基准）。
 */
const initialOf = (f: TextField): string => proposed(f) || curOf(f)

/** 标签的编辑器起点：编辑 > 反馈建议 > 当前标签 */
function initialTags(): string[] {
  const eff = props.row ? effectiveTags(props.row, props.edits) : []
  return eff.length ? [...eff] : [...(props.item?.tags || [])]
}

function startEdit(f: Field) {
  if (f === 'tags') tagDraft.value = initialTags()
  else draft[f] = initialOf(f)
  if (f === 'link') {
    draftLabel.value = props.edits?.linkLabel || ''
    // 角色默认值：编辑地址与「词条当前主链接」同址 → 这行是在改主链接的显示名，默认 main；
    // 否则（新给一个地址）默认 ref 附加参考。
    const sameAsMain = !!draft.link && draft.link === (props.item?.link || '')
    draftRole.value = props.edits?.linkRole === 'main' ? 'main' : (sameAsMain ? 'main' : 'ref')
  }
  editing[f] = true
}
function cancelEdit(f: Field) {
  if (f === 'tags') tagDraft.value = initialTags()
  else draft[f] = initialOf(f)
  editing[f] = false
}

/**
 * 保存：**只有真的改动过才产生编辑**。
 * 链接是三元组（URL / 显示名 / 角色）：任一改动就把三者一起发出 —— 落盘脚本要靠 URL 才能写行，
 * 「只改显示名」也必须带上 URL（= 该词条当前的主链接），否则脚本无处安放这条 label。
 */
function commit(f: Field) {
  if (f === 'tags') {
    if (tagDraft.value.join('\u0000') !== initialTags().join('\u0000')) {
      emit('edit', { tags: serializeTags(tagDraft.value) } as FieldEdits)
    }
  } else if (f === 'link') {
    const role: 'main' | 'ref' = draftRole.value === 'main' ? 'main' : 'ref'
    const initRole: 'main' | 'ref' = props.edits?.linkRole === 'main' ? 'main' : 'ref'
    const changed = draft.link !== initialOf('link')
      || draftLabel.value.trim() !== (props.edits?.linkLabel || '').trim()
      || role !== initRole
    if (changed) emit('edit', { link: draft.link, linkLabel: draftLabel.value, linkRole: role } as FieldEdits)
  } else if (draft[f] !== initialOf(f)) {
    emit('edit', { [f]: draft[f] } as FieldEdits)
  }
  editing[f] = false
}

/** 恢复建议值 = 清掉该字段的编辑（空串即删 key）；草稿由 props.edits 的 watch 自动重置 */
function revert(f: Field) {
  emit('edit', f === 'tags' ? ({ tags: '' } as FieldEdits) : ({ [f]: '' } as FieldEdits))
  editing[f] = false
}
</script>

<template>
  <div v-if="!row" class="rd rd-empty">左侧选一条反馈开始审</div>
  <div v-else class="rd">
    <div class="rd-body no-scrollbar">
      <header class="rd-head">
        <h2 class="rd-title">{{ item?.title || row.itemId }}</h2>
        <p class="rd-sub">
          <span class="rd-by-name">提交者：{{ byLabel }}</span>
          <span class="rd-id">{{ row.itemId }}</span>
          <span v-if="item?.tier">{{ item.tier }}</span>
          <span v-if="item?.category">{{ item.category }}</span>
          <span>{{ row.createdAt.slice(0, 16).replace('T', ' ') }}</span>
          <span>#{{ row.id }}</span>
          <span v-if="hasEdits(edits)" class="rd-edited-tag">已就地修改（不改 Supabase，只进本地落盘）</span>
        </p>
      </header>

      <section v-if="row.note" class="rd-block">
        <h3 class="rd-h">作者说明</h3>
        <p class="rd-note">{{ row.note }}</p>
      </section>

      <!-- 标题 -->
      <section class="rd-block">
        <h3 class="rd-h">
          标题
          <span v-if="isEdited('title')" class="rd-edited">已编辑</span>
          <button v-if="!editing.title" type="button" class="rd-mini" @click="startEdit('title')">编辑</button>
          <template v-else>
            <button type="button" class="rd-mini on" @click="commit('title')">保存</button>
            <button type="button" class="rd-mini" @click="cancelEdit('title')">取消</button>
          </template>
          <button v-if="isEdited('title') && !editing.title" type="button" class="rd-mini" @click="revert('title')">恢复建议值</button>
        </h3>
        <div class="rd-cols">
          <div class="rd-col"><span class="rd-tag">当前</span><p class="rd-text">{{ item?.title || '（空）' }}</p></div>
          <div class="rd-col rd-new">
            <span class="rd-tag">建议{{ row.title ? '' : '（反馈未改此项）' }}</span>
            <textarea v-if="editing.title" v-model="draft.title" class="rd-area" rows="2" />
            <p v-else class="rd-text">{{ proposed('title') || UNTOUCHED }}</p>
          </div>
        </div>
      </section>

      <!-- 描述 -->
      <section class="rd-block">
        <h3 class="rd-h">
          描述
          <span class="rd-delta" :class="{ minus: deltaDesc < 0 }">{{ deltaDesc >= 0 ? '+' : '' }}{{ deltaDesc }} 字</span>
          <span v-if="isEdited('desc')" class="rd-edited">已编辑</span>
          <button v-if="!editing.desc" type="button" class="rd-mini" @click="startEdit('desc')">编辑</button>
          <template v-else>
            <button type="button" class="rd-mini on" @click="commit('desc')">保存</button>
            <button type="button" class="rd-mini" @click="cancelEdit('desc')">取消</button>
          </template>
          <button v-if="isEdited('desc') && !editing.desc" type="button" class="rd-mini" @click="revert('desc')">恢复建议值</button>
        </h3>
        <div class="rd-cols">
          <div class="rd-col">
            <span class="rd-tag">当前（{{ curDesc.length }} 字）</span>
            <p class="rd-text">{{ curDesc || '（无描述）' }}</p>
          </div>
          <div class="rd-col rd-new">
            <span class="rd-tag">建议（{{ proposed('desc').length }} 字）{{ row.desc ? '' : '· 反馈未改此项' }}</span>
            <textarea v-if="editing.desc" v-model="draft.desc" class="rd-area" rows="8" />
            <p v-else class="rd-text">{{ proposed('desc') || UNTOUCHED }}</p>
          </div>
        </div>
      </section>

      <!-- 分类 -->
      <section class="rd-block">
        <h3 class="rd-h">
          分类
          <span v-if="isEdited('category')" class="rd-edited">已编辑</span>
          <button v-if="!editing.category" type="button" class="rd-mini" @click="startEdit('category')">编辑</button>
          <template v-else>
            <button type="button" class="rd-mini on" @click="commit('category')">保存</button>
            <button type="button" class="rd-mini" @click="cancelEdit('category')">取消</button>
          </template>
          <button v-if="isEdited('category') && !editing.category" type="button" class="rd-mini" @click="revert('category')">恢复建议值</button>
        </h3>
        <div class="rd-cols">
          <div class="rd-col"><span class="rd-tag">当前</span><p class="rd-text">{{ item?.category || '（无）' }}</p></div>
          <div class="rd-col rd-new">
            <span class="rd-tag">建议{{ row.category ? '' : '（反馈未改此项）' }}</span>
            <select v-if="editing.category" v-model="draft.category" class="rd-input">
              <!-- 当前分类若已不在 categoryColors（上游改名/下线）也要能选中，否则下拉会空掉 -->
              <option v-if="draft.category && !categoryOptions.includes(draft.category)" :value="draft.category">{{ draft.category }}</option>
              <option v-for="c in categoryOptions" :key="c" :value="c">{{ c }}</option>
            </select>
            <p v-else class="rd-text">{{ proposed('category') || UNTOUCHED }}</p>
            <p v-if="categoryDiffers" class="rd-hint">改分类会连带重算分类色（墙上的词条底色与徽章颜色）</p>
          </div>
        </div>
      </section>

      <!-- 标签 -->
      <section class="rd-block">
        <h3 class="rd-h">
          标签
          <span v-if="isEdited('tags')" class="rd-edited">已编辑</span>
          <button v-if="!editing.tags" type="button" class="rd-mini" @click="startEdit('tags')">编辑</button>
          <template v-else>
            <button type="button" class="rd-mini on" @click="commit('tags')">保存</button>
            <button type="button" class="rd-mini" @click="cancelEdit('tags')">取消</button>
          </template>
          <button v-if="isEdited('tags') && !editing.tags" type="button" class="rd-mini" @click="revert('tags')">恢复建议值</button>
        </h3>
        <div class="rd-cols">
          <div class="rd-col">
            <span class="rd-tag">当前（{{ curTags.length }} 个）</span>
            <p class="rd-text">{{ curTags.length ? curTags.map(tagLabel).join('　') : '（无标签）' }}</p>
          </div>
          <div class="rd-col rd-new">
            <span class="rd-tag">建议（{{ effTags.length }} 个）{{ row.tags.length ? '' : '· 反馈未改此项' }}</span>
            <TagPicker v-if="editing.tags" v-model="tagDraft" :options="tagOptions" :emoji="tagEmoji" />
            <p v-else class="rd-text">{{ effTags.length ? effTags.map(tagLabel).join('　') : UNTOUCHED }}</p>
            <p v-if="effTags.length" class="rd-hint">落盘后墙上的标签 emoji 与标签筛选都按这份走（emojis 与 tags 同步重算）</p>
          </div>
        </div>
      </section>

      <!-- 链接（链接副表：可覆盖主链接、可手填显示名，也可只作附加参考） -->
      <section class="rd-block">
        <h3 class="rd-h">
          链接
          <span v-if="isEdited('link')" class="rd-edited">已编辑</span>
          <button v-if="!editing.link" type="button" class="rd-mini" @click="startEdit('link')">编辑</button>
          <template v-else>
            <button type="button" class="rd-mini on" @click="commit('link')">保存</button>
            <button type="button" class="rd-mini" @click="cancelEdit('link')">取消</button>
          </template>
          <button v-if="isEdited('link') && !editing.link" type="button" class="rd-mini" @click="revert('link')">恢复建议值</button>
        </h3>
        <div class="rd-cols">
          <div class="rd-col">
            <span class="rd-tag">当前主链接</span>
            <p class="rd-text"><a v-if="item?.link" :href="item.link" target="_blank" rel="noopener noreferrer">{{ item.link }}</a><template v-else>（无链接）</template></p>
          </div>
          <div class="rd-col rd-new">
            <span class="rd-tag">建议{{ row.link ? ' · ' + sourceLabel(proposed('link')) : '（反馈未改此项）' }}</span>
            <input v-if="editing.link" v-model="draft.link" class="rd-input" type="url" placeholder="https://…" />
            <p v-else class="rd-text">
              <a v-if="proposed('link')" :href="proposed('link')" target="_blank" rel="noopener noreferrer">{{ proposed('link') }}</a>
              <template v-else>（未提供 —— 可点「编辑」补一条或改主链接）</template>
            </p>

            <!-- 链接副表的两个附加属性：手填显示名 + 角色（主链接覆盖 / 附加参考） -->
            <template v-if="editing.link">
              <span class="rd-tag">显示名（留空 = 按域名自动判断）</span>
              <input v-model="draftLabel" class="rd-input" type="text" placeholder="例如：百度百科 / 某档案馆" />
              <span class="rd-tag">角色</span>
              <select v-model="draftRole" class="rd-input">
                <option value="ref">附加参考链接</option>
                <option value="main">覆盖词条主链接</option>
              </select>
            </template>

            <p v-if="effLink" class="rd-hint">
              {{ hostOf(effLink) }} → 显示名「{{ edits?.linkLabel || sourceLabel(effLink) }}」<template v-if="!edits?.linkLabel">（自动识别）</template>
              · 角色：{{ edits?.linkRole === 'main' ? '覆盖主链接' : '附加参考链接' }}
            </p>
          </div>
        </div>
      </section>

      <p v-if="row.unsupported.length" class="rd-unsupported">
        该反馈还改了 {{ row.unsupported.join(' / ') }} —— 未知字段，落盘会被脚本跳过。
      </p>

      <section class="rd-block">
        <h3 class="rd-h">驳回理由（可选，仅驳回时记录）</h3>
        <input v-model="reason" class="rd-input" type="text" placeholder="例如：来源不可靠 / 与词条无关 / 描述有事实错误" />
      </section>

      <p v-if="decision?.decision" class="rd-current">
        当前决定：<b>{{ decision.decision === 'accept' ? '采纳' : decision.decision === 'reject' ? '驳回' : '待定' }}</b>
        <span v-if="decision.reason"> · {{ decision.reason }}</span>
      </p>
      <p v-else-if="hasEdits(edits)" class="rd-current">
        已就地改过字段，但还没做决定 —— 决定「采纳」才会落盘（用改后的值）。
      </p>
    </div>

    <footer class="rd-actions">
      <button type="button" class="rd-btn ok" :class="{ on: decision?.decision === 'accept' }" @click="emit('decide', 'accept', reason)">采纳 <kbd>A</kbd></button>
      <button type="button" class="rd-btn no" :class="{ on: decision?.decision === 'reject' }" @click="emit('decide', 'reject', reason)">驳回 <kbd>R</kbd></button>
      <button type="button" class="rd-btn later" :class="{ on: decision?.decision === 'later' }" @click="emit('decide', 'later', reason)">待定 <kbd>S</kbd></button>
      <span class="rd-kbd-hint">J / K 或 ↑↓ 翻条 · Backspace 撤销决定（不改编辑）</span>
    </footer>
  </div>
</template>

<style scoped>
.rd { display: flex; flex-direction: column; height: 100%; min-width: 0; min-height: 0; }
.rd-empty { align-items: center; justify-content: center; color: var(--white-30); font-size: var(--font-sm); }
/* min-height: 0 是内部滚动的前提：flex 子项默认 min-height: auto，会被内容撑高而不滚动 */
.rd-body { flex: 1; min-height: 0; overflow-y: auto; padding: 1.1rem 1.2rem; display: flex; flex-direction: column; gap: 1rem; }
.rd-head { display: flex; flex-direction: column; gap: 0.35rem; }
.rd-title { margin: 0; font-size: 1.25rem; font-weight: 700; color: var(--white-90); }
.rd-sub { margin: 0; display: flex; flex-wrap: wrap; gap: 0.6rem; font-size: var(--font-micro); color: var(--white-30); }
.rd-by-name { color: var(--white-55); }
.rd-edited-tag { color: var(--color-accent-soft); }
.rd-id { font-variant-numeric: tabular-nums; }
.rd-block { display: flex; flex-direction: column; gap: 0.45rem; }
.rd-h { margin: 0; display: flex; align-items: center; gap: 0.5rem; font-size: var(--font-tiny); font-weight: 400; letter-spacing: 0.14em; color: var(--white-30); text-transform: uppercase; }
.rd-edited { color: var(--color-accent-soft); letter-spacing: 0; text-transform: none; }
.rd-mini { padding: 0.1rem 0.45rem; background: var(--white-04); border: 1px solid var(--white-12); border-radius: var(--v2-r-sm); color: var(--white-55); font-size: var(--font-micro); letter-spacing: 0; text-transform: none; cursor: pointer; }
.rd-mini:hover { color: var(--white-90); border-color: var(--white-25); }
.rd-mini.on { color: #0a0c10; background: var(--color-accent-soft); border-color: var(--color-accent-soft); font-weight: 700; }
.rd-delta { color: #43c96a; }
.rd-delta.minus { color: var(--color-accent-soft); }
.rd-note { margin: 0; padding: 0.6rem 0.75rem; background: var(--white-03); border: 1px solid var(--white-08); border-radius: var(--v2-r-sm); font-size: var(--font-xs); line-height: 1.8; color: var(--white-70); white-space: pre-wrap; }
.rd-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
@media (max-width: 1080px) { .rd-cols { grid-template-columns: 1fr; } }
.rd-col { display: flex; flex-direction: column; gap: 0.35rem; padding: 0.6rem 0.75rem; background: var(--white-02); border: 1px solid var(--white-08); border-radius: var(--v2-r-sm); }
.rd-new { border-color: var(--white-15); background: var(--white-04); }
.rd-tag { font-size: var(--font-micro); color: var(--white-30); letter-spacing: 0.08em; }
.rd-text { margin: 0; font-size: var(--font-xs); line-height: 1.9; color: var(--white-70); white-space: pre-wrap; word-break: break-word; }
.rd-text a { color: var(--color-accent-soft); word-break: break-all; }
.rd-hint { margin: 0; font-size: var(--font-micro); color: var(--white-25); }
.rd-unsupported { margin: 0; font-size: var(--font-xs); color: var(--color-accent-soft); }
.rd-input, .rd-area { width: 100%; padding: 0.5rem 0.7rem; background: var(--white-03); border: 1px solid var(--white-20); border-radius: var(--v2-r-sm); color: var(--white-90); font-size: var(--font-xs); font-family: inherit; line-height: 1.9; }
.rd-area { resize: vertical; }
.rd-input:focus-visible, .rd-area:focus-visible { outline: none; border-color: var(--color-accent-soft); }
.rd-current { margin: 0; font-size: var(--font-xs); color: var(--white-55); }
.rd-actions { flex: none; display: flex; align-items: center; gap: 0.5rem; padding: 0.7rem 1.2rem; border-top: 1px solid var(--white-08); }
.rd-btn { display: flex; align-items: center; gap: 0.4rem; padding: 0.5rem 1rem; background: var(--white-04); border: 1px solid var(--white-12); border-radius: var(--v2-r-sm); color: var(--white-70); font-size: var(--font-xs); cursor: pointer; transition: color 0.15s, border-color 0.15s, background-color 0.15s; }
.rd-btn:hover { color: var(--white-90); border-color: var(--white-25); }
.rd-btn.ok.on { color: #0a0c10; background: #43c96a; border-color: #43c96a; font-weight: 700; }
.rd-btn.no.on { color: #0a0c10; background: #e2564b; border-color: #e2564b; font-weight: 700; }
.rd-btn.later.on { color: var(--white-90); background: var(--white-15); }
.rd-btn kbd { font-size: var(--font-micro); opacity: 0.6; border: 1px solid currentColor; border-radius: 3px; padding: 0 0.25rem; }
.rd-kbd-hint { margin-left: auto; font-size: var(--font-micro); color: var(--white-25); }
</style>
