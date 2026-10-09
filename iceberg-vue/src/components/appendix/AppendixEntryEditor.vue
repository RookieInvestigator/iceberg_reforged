<script setup lang="ts">
// 所见即所得编辑：直接改词条在站点上的样子，改动按区域落到对应副表。
// 所有状态与写入口都来自 useAppendixEditor（ed），本组件只管画与浮层开关。
import { computed, ref } from 'vue'
import { linkDisplay } from '../../lib/sourceLabel'
import TagPicker from '../review/TagPicker.vue'
import EntryPicker from './EntryPicker.vue'
import type { AppendixEditor } from '../../lib/iceberg/useAppendixEditor'

const props = defineProps<{ ed: AppendixEditor }>()

/** 同时只开一个浮层 */
const pop = ref<'' | 'cats' | 'tags' | 'rel'>('')
const editingMain = ref(false)
const editingRef = ref(-1)
const refDraft = ref({ url: '', label: '' })
const newRef = ref<{ url: string; label: string } | null>(null)
const newBy = ref('')
const newAt = ref('')

const usedRelated = computed(() => new Set(props.ed.relatedList.value.map(r => r.id)))
const upstreamTitles = computed(() => props.ed.upstream.value.related.map(id => ({
  id, title: (props.ed.itemMap.get(id) as any)?.title || id,
})))

function openRefEditor(i: number) {
  const r = props.ed.refLinks.value.find(x => x.i === i)
  refDraft.value = { url: r?.url || '', label: r?.label || '' }
  editingRef.value = i
}
function commitRefEditor() {
  if (editingRef.value < 0) return
  if (!refDraft.value.url.trim()) props.ed.removeRefLink(editingRef.value)
  else {
    props.ed.setRefField(editingRef.value, 'url', refDraft.value.url.trim())
    props.ed.setRefField(editingRef.value, 'label', refDraft.value.label.trim())
  }
  editingRef.value = -1
}
function commitNewRef() {
  const d = newRef.value
  if (!d) return
  props.ed.addRefLink(d.url, d.label)
  newRef.value = null
}
function commitBy() {
  props.ed.addContributor(newBy.value, newAt.value)
  newBy.value = ''
  newAt.value = ''
}
</script>

<template>
  <article class="entry" @click="pop = ''">
    <header class="hd">
      <input class="title" :value="ed.effTitle.value" placeholder="（无标题）"
        @input="ed.setOverride('title', ($event.target as HTMLInputElement).value)" />
      <span v-if="ed.totalChanges.value" class="cnt" :title="`本词条在副表里共 ${ed.totalChanges.value} 行`">
        {{ ed.totalChanges.value }}
      </span>
    </header>
    <div v-if="ed.overrideRow('title')" class="orig">
      <span class="ok">原</span><span class="ov">{{ ed.upstream.value.title }}</span>
      <button class="undo" @click="ed.clearOverride('title')">还原</button>
    </div>

    <!-- 徽章行：层级 · 分类 · 标签 -->
    <div class="meta">
      <span class="tier">{{ ed.upstream.value.tier }}</span>

      <span class="grp" @click.stop>
        <select class="cat-sel" :value="ed.effMainCat.value"
          :style="{ color: ed.catColor(ed.effMainCat.value), borderColor: ed.catColor(ed.effMainCat.value) + '66' }"
          title="主分类（categories.csv role=main）"
          @change="ed.setMainCategory(($event.target as HTMLSelectElement).value)">
          <option v-for="c in ed.categories" :key="c" :value="c">{{ c }}</option>
        </select>
        <span v-for="c in ed.effExtraCats.value" :key="c" class="chip"
          :style="{ color: ed.catColor(c), borderColor: ed.catColor(c) + '66' }">
          {{ c }}<button class="x" title="移除副分类" @click="ed.toggleExtraCategory(c)">×</button>
        </span>
        <button class="add" title="添加副分类" @click="pop = pop === 'cats' ? '' : 'cats'">＋</button>
        <div v-if="pop === 'cats'" class="pop">
          <button v-for="c in ed.addableCats.value" :key="c" class="pop-row" @click="ed.toggleExtraCategory(c)">
            <span class="dot" :style="{ background: ed.catColor(c) }" />{{ c }}
          </button>
          <p v-if="!ed.addableCats.value.length" class="pop-empty">已包含全部分类</p>
        </div>
      </span>

      <span class="grp" @click.stop>
        <span v-for="t in ed.effTags.value" :key="t" class="chip">
          <span class="emoji">{{ ed.tagEmoji[t] || '·' }}</span>{{ t }}
          <button class="x" title="移除标签" @click="ed.setTags(ed.effTags.value.filter(v => v !== t))">×</button>
        </span>
        <button class="add" title="从标签表选择" @click="pop = pop === 'tags' ? '' : 'tags'">＋</button>
        <div v-if="pop === 'tags'" class="pop pop-tags">
          <TagPicker compact :options="ed.tagNames" :emoji="ed.tagEmoji" :model-value="ed.effTags.value" @update:model-value="ed.setTags" />
        </div>
      </span>
      <span v-if="ed.effGradient.value" class="grad" :style="{ background: ed.effGradient.value }" title="词条墙标题渐变（生效后）" />
    </div>
    <div v-if="ed.mainCatRow.value" class="orig">
      <span class="ok">原</span><span class="ov">主分类 {{ ed.upstream.value.category }}</span>
      <button class="undo" @click="ed.setMainCategory('')">还原</button>
    </div>
    <div v-if="ed.overrideRow('tags')" class="orig">
      <span class="ok">原</span><span class="ov">标签 {{ ed.upstream.value.tags.join('、') || '（无）' }}</span>
      <button class="undo" @click="ed.clearOverride('tags')">还原</button>
    </div>

    <!-- 标记（extra.csv）：警示 / 需补充 + 各自 note（hover 提示）；行存在即标记为真 -->
    <div class="marks-row">
      <span class="mk-k">标记</span>
      <template v-for="f in ed.extraFlags" :key="f">
        <button class="mk" :class="[f, { on: ed.extraOf(f).on }]" @click="ed.toggleExtraFlag(f)">
          {{ f === 'warn' ? '警示' : '需补充' }}
        </button>
        <input
          v-if="ed.extraOf(f).on"
          class="mk-note"
          :value="ed.extraOf(f).note"
          :placeholder="f === 'warn' ? '警示备注（hover 提示）' : '需补充备注（hover 提示）'"
          @input="ed.setExtraNote(f, ($event.target as HTMLInputElement).value)"
        />
      </template>
    </div>

    <!-- 署名（contributors.csv）→ 详情页脚那行「由 X 提供」 -->
    <div class="byline">
      <span class="by-k">署名</span>
      <span v-for="(c, i) in ed.contributorRows.value" :key="i" class="chip">
        {{ c.by }}<span v-if="c.at" class="by-at">{{ c.at }}</span>
        <button class="x" title="移除署名" @click="ed.removeContributor(i)">×</button>
      </span>
      <input v-model="newBy" class="by-in" placeholder="＋ 谁提供的" @keydown.enter="commitBy" />
      <input v-if="newBy" v-model="newAt" class="by-in by-date" placeholder="日期（可空）" @keydown.enter="commitBy" />
    </div>

    <!-- 描述 -->
    <textarea class="desc" :value="ed.effDesc.value"
      :rows="Math.min(12, Math.max(2, Math.ceil((ed.effDesc.value.length || 1) / 52)))"
      placeholder="（无描述）"
      @input="ed.setOverride('desc', ($event.target as HTMLTextAreaElement).value)" />
    <div v-if="ed.overrideRow('desc')" class="orig">
      <span class="ok">原</span><span class="ov">{{ ed.upstream.value.desc || '（上游为空）' }}</span>
      <button class="undo" @click="ed.clearOverride('desc')">还原</button>
    </div>

    <!-- 链接 -->
    <section class="sec">
      <div class="sec-hd">
        <h3>链接</h3>
        <span class="gap" />
        <button class="add-txt" @click="newRef = { url: '', label: '' }">＋ 参考链接</button>
      </div>

      <div class="link">
        <span class="role role-main">主</span>
        <template v-if="!editingMain">
          <template v-if="ed.effMainDisp.value">
            <a class="lname" :href="ed.effMainUrl.value" target="_blank">{{ ed.effMainDisp.value.name }}</a>
            <span v-if="ed.effMainDisp.value.showHost" class="lhost">{{ ed.effMainDisp.value.host }}</span>
          </template>
          <span v-else class="lhost">（无主链接）</span>
          <span class="acts">
            <button class="mini" @click="editingMain = true">编辑</button>
            <button v-if="ed.mainLinkRow.value" class="mini" @click="ed.setMainLink('', '')">还原</button>
          </span>
        </template>
        <template v-else>
          <input class="cell grow" :value="ed.effMainUrl.value" placeholder="https://…"
            @input="ed.setMainLink(($event.target as HTMLInputElement).value, ed.effMainLabel.value)" />
          <input class="cell" :value="ed.effMainLabel.value" list="src-names"
            :placeholder="`显示名（留空＝自动：${ed.effMainUrl.value ? linkDisplay('', ed.effMainUrl.value).name : '—'}）`"
            @input="ed.setMainLink(ed.effMainUrl.value, ($event.target as HTMLInputElement).value)" />
          <button class="mini" @click="editingMain = false">完成</button>
        </template>
      </div>
      <div v-if="ed.mainLinkRow.value" class="orig">
        <span class="ok">原</span><span class="ov">主链接 {{ ed.upstream.value.link || '（上游为空）' }}</span>
      </div>

      <div v-for="r in ed.refLinks.value" :key="'r' + r.i" class="link">
        <span class="role">参考</span>
        <template v-if="editingRef !== r.i">
          <a class="lname" :href="r.url" target="_blank">{{ r.d.name }}</a>
          <span v-if="r.d.showHost" class="lhost">{{ r.d.host }}</span>
          <span class="acts">
            <button class="mini" @click="openRefEditor(r.i)">编辑</button>
            <button class="mini danger" @click="ed.removeRefLink(r.i)">删除</button>
          </span>
        </template>
        <template v-else>
          <input class="cell grow" v-model="refDraft.url" placeholder="https://…" />
          <input class="cell" v-model="refDraft.label" list="src-names" placeholder="显示名（留空＝自动识别）" />
          <button class="mini" @click="commitRefEditor">完成</button>
        </template>
      </div>

      <div v-if="newRef" class="link link-new">
        <span class="role">参考</span>
        <input class="cell grow" v-model="newRef.url" placeholder="https://…（回车添加）" @keydown.enter="commitNewRef" />
        <input class="cell" v-model="newRef.label" list="src-names" placeholder="显示名（留空＝自动识别）" @keydown.enter="commitNewRef" />
        <button class="mini" @click="commitNewRef">添加</button>
        <button class="mini" @click="newRef = null">取消</button>
      </div>
      <datalist id="src-names">
        <option v-for="n in ed.sourceNames" :key="n" :value="n" />
      </datalist>
    </section>

    <!-- 关联词条 -->
    <section class="sec">
      <div class="sec-hd">
        <h3>关联词条</h3>
        <span class="gap" />
        <button class="add-txt" @click.stop="pop = pop === 'rel' ? '' : 'rel'">＋ 添加</button>
      </div>
      <div class="chips" @click.stop>
        <span v-for="r in ed.relatedList.value" :key="r.i" class="chip" :style="{ color: r.color, borderColor: r.color + '66' }">
          {{ r.title }}<button class="x" title="移除" @click="ed.removeRelated(r.i)">×</button>
        </span>
        <span v-for="u in upstreamTitles" :key="'u' + u.id" class="chip chip-up" title="上游数据自带（副表删不掉）">{{ u.title }}</span>
        <span v-if="!ed.relatedList.value.length && !upstreamTitles.length" class="none">暂无</span>
        <div v-if="pop === 'rel'" class="pop pop-rel">
          <EntryPicker :ed="ed" :used="usedRelated" @pick="ed.addRelated($event)" />
        </div>
      </div>
    </section>
  </article>
</template>

<style scoped>
.entry { max-width: 52rem; margin: 0 auto; }
.hd { display: flex; align-items: baseline; gap: 0.6rem; }
.title { flex: 1; padding: 0.15rem 0.4rem; margin-left: -0.4rem; font-size: 1.55rem; font-weight: 900; line-height: 1.35; color: #fff; background: none; border: 1px solid transparent; border-radius: 8px; font-family: inherit; }
.title:hover { border-color: var(--white-18); }
.title:focus { border-color: var(--color-accent); outline: none; }
.cnt { font-size: var(--font-tiny); color: var(--color-accent-bright); background: color-mix(in srgb, var(--color-accent) 18%, transparent); border-radius: 999px; padding: 0.1rem 0.5rem; flex-shrink: 0; }

.meta { display: flex; align-items: center; flex-wrap: wrap; gap: 0.4rem; margin: 0.7rem 0 0.2rem; }
.tier { font-size: var(--font-tiny); padding: 0.12rem 0.5rem; border-radius: 6px; background: var(--white-08); color: var(--white-70); }
.grp { position: relative; display: inline-flex; align-items: center; flex-wrap: wrap; gap: 0.35rem; }
.cat-sel { font-size: var(--font-tiny); font-weight: 700; padding: 0.14rem 0.5rem; border-radius: 999px; background: var(--white-05); border: 1px solid var(--white-20); cursor: pointer; }
.chip { display: inline-flex; align-items: center; gap: 0.25rem; font-size: var(--font-tiny); padding: 0.12rem 0.5rem; border-radius: 999px; border: 1px solid var(--white-18); background: var(--white-04); color: var(--white-85); }
.emoji { font-size: var(--font-xs); }
.x { background: none; border: none; color: inherit; opacity: 0.55; cursor: pointer; font-size: var(--font-xs); line-height: 1; padding: 0; }
.x:hover { opacity: 1; color: var(--color-danger); }
.add { width: 1.4rem; height: 1.4rem; display: inline-flex; align-items: center; justify-content: center; font-size: var(--font-sm); border-radius: 50%; background: var(--white-06); border: 1px solid var(--white-16); color: var(--white-70); cursor: pointer; }
.add:hover { background: var(--white-12); color: #fff; }
.grad { width: 84px; height: 10px; border-radius: 3px; border: 1px solid var(--white-18); }

/* 标记行：两个布尔开关（警示 / 需补充）+ 各自的 note（note 即前端 tooltip 文案） */
.marks-row { display: flex; align-items: center; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.5rem; }
.mk-k { font-size: var(--font-tiny); color: var(--white-50); }
.mk { font-size: var(--font-tiny); padding: 0.12rem 0.55rem; border-radius: 999px; background: var(--white-04); border: 1px solid var(--white-18); color: var(--white-65); cursor: pointer; }
.mk:hover { border-color: var(--white-35); color: var(--white-90); }
.mk.warn.on { color: var(--color-danger); border-color: color-mix(in srgb, var(--color-danger) 55%, transparent); background: color-mix(in srgb, var(--color-danger) 12%, transparent); }
.mk.need.on { color: var(--color-fav); border-color: color-mix(in srgb, var(--color-fav) 55%, transparent); background: color-mix(in srgb, var(--color-fav) 12%, transparent); }
.mk-note { flex: 1; min-width: 14rem; max-width: 26rem; padding: 0.14rem 0.5rem; font-size: var(--font-tiny); border-radius: 999px; background: var(--white-04); border: 1px dashed var(--white-20); color: var(--white-90); }
.mk-note:focus { border-style: solid; border-color: var(--color-accent); outline: none; }

.byline { display: flex; align-items: center; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.5rem; }
.by-k { font-size: var(--font-tiny); color: var(--white-50); }
.by-at { margin-left: 0.25rem; color: var(--white-50); font-size: var(--font-micro); }
.by-in { width: 9rem; padding: 0.14rem 0.5rem; font-size: var(--font-tiny); border-radius: 999px; background: var(--white-04); border: 1px dashed var(--white-20); color: var(--white-90); }
.by-in:focus { border-style: solid; border-color: var(--color-accent); outline: none; }
.by-date { width: 7.5rem; }

.pop { position: absolute; top: calc(100% + 6px); left: 0; z-index: 30; max-height: 20rem; overflow-y: auto; padding: 0.35rem; border-radius: 10px; background: #16181d; border: 1px solid var(--white-16); box-shadow: 0 14px 34px rgba(0, 0, 0, 0.55); }
.pop-tags { min-width: 26rem; }
.pop-rel { min-width: 24rem; }
.pop-row { display: flex; align-items: center; gap: 0.5rem; width: 100%; padding: 0.38rem 0.5rem; font-size: var(--font-xs); text-align: left; background: none; border: none; border-radius: 7px; color: var(--white-80); cursor: pointer; }
.pop-row:hover { background: var(--white-08); color: #fff; }
.pop-empty { padding: 0.4rem 0.5rem; font-size: var(--font-xs); color: var(--white-45); }
.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

.desc { display: block; width: 100%; margin-top: 0.9rem; padding: 0.5rem 0.6rem; font-size: 15px; line-height: 1.85; color: var(--white-88); background: none; border: 1px solid transparent; border-radius: 8px; font-family: inherit; resize: vertical; }
.desc:hover { border-color: var(--white-16); }
.desc:focus { border-color: var(--color-accent); outline: none; }

.orig { display: flex; align-items: baseline; gap: 0.5rem; margin: 0.25rem 0 0; font-size: var(--font-tiny); color: var(--white-50); }
.ok { flex-shrink: 0; padding: 0.05rem 0.3rem; border-radius: 4px; background: var(--white-10); color: var(--white-65); }
.ov { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 44rem; }
.undo { flex-shrink: 0; font-size: var(--font-tiny); padding: 0.05rem 0.45rem; border-radius: 5px; background: none; border: 1px solid var(--white-16); color: var(--white-60); cursor: pointer; }
.undo:hover { border-color: var(--color-accent); color: var(--color-accent-bright); }

.sec { margin-top: 1.6rem; padding-top: 1rem; border-top: 1px solid var(--white-08); }
.sec-hd { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.6rem; }
.sec-hd h3 { font-size: var(--font-xs); font-weight: 700; color: var(--white-55); letter-spacing: 0.08em; }
.gap { flex: 1; }
.add-txt { font-size: var(--font-xs); padding: 0.2rem 0.6rem; border-radius: 6px; background: none; border: 1px solid var(--white-16); color: var(--white-65); cursor: pointer; }
.add-txt:hover { border-color: var(--white-40); color: #fff; }

.link { display: flex; align-items: center; gap: 0.5rem; padding: 0.32rem 0.45rem; border-radius: 8px; }
.link:hover { background: var(--white-04); }
.link-new { background: var(--white-03); }
.role { flex-shrink: 0; font-size: var(--font-micro); padding: 0.08rem 0.35rem; border-radius: 4px; background: var(--white-10); color: var(--white-60); }
/* 类名不能叫 main：本文件布局类 .main{flex:1} 会命中（scoped 不隔离类名） */
.role-main { background: color-mix(in srgb, var(--color-accent) 22%, transparent); color: var(--color-accent-bright); }
.lname { font-size: var(--font-sm); color: var(--white-92); text-decoration: underline; text-decoration-color: var(--white-30); text-underline-offset: 3px; }
.lname:hover { text-decoration-color: var(--color-accent); }
.lhost { font-size: var(--font-xs); color: var(--white-50); }
.acts { display: flex; gap: 0.3rem; margin-left: auto; opacity: 0; transition: opacity 0.12s; }
.link:hover .acts { opacity: 1; }
.mini { font-size: var(--font-tiny); padding: 0.1rem 0.5rem; border-radius: 5px; background: none; border: 1px solid var(--white-16); color: var(--white-65); cursor: pointer; }
.mini:hover { border-color: var(--white-40); color: #fff; }
.mini.danger:hover { border-color: var(--color-danger); color: var(--color-danger); }

.chips { position: relative; display: flex; align-items: center; flex-wrap: wrap; gap: 0.4rem; }
.chip-up { opacity: 0.55; border-style: dashed; }
.none { font-size: var(--font-xs); color: var(--white-45); }
.cell { padding: 0.3rem 0.5rem; font-size: var(--font-sm); background: var(--white-06); border: 1px solid var(--white-14); border-radius: 7px; color: var(--white-92); }
.cell:focus { border-color: var(--color-accent); outline: none; }
.cell.grow { flex: 1; min-width: 13rem; }
</style>
