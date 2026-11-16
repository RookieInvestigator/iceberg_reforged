<script setup lang="ts">
/**
 * 古籍模式 · 排版设置
 *
 * 结构：**分组**（字体 / 版面 / 装饰）—— 参数一多，平铺一列就找不到东西；
 * 但每组内部仍然「一行一个参数」，不加边框、不加底色，跟正文一样安静。
 * 所有改动即时生效并持久化。
 */
import { useStore } from '@nanostores/vue'
import { FONT_LABELS } from './layout'
import { typographyPrefs, updatePrefs, resetPrefs } from './prefs'
import type { FontFamily, TypographyPrefs } from './types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

// **必须用 useStore**：nanostores 用自己的订阅系统，Vue 追踪不到 `.value`，
// 直接读会让「点了没反应」（选中态不反黑、滑杆不动）。
const p = useStore(typographyPrefs)

const FONTS = Object.keys(FONT_LABELS) as FontFamily[]
const FONT_PREVIEW: Record<FontFamily, string> = {
  song: "'Noto Serif SC', serif",
  hei: "'Noto Sans SC', serif",
  kai: "'Huiji Zhengkai', serif",
  fangsong: "'Zhuque Fangsong', serif",
  sotyr: "'Sotyr Fangsong', serif",
}
/**
 * 只有**当前选中**的那款按钮用自己的字体预览。
 *
 * 五款按钮全用各自字体做预览的话，光是打开这一页就会把五款字库（合计 ≈5MB）全拉下来 ——
 * 而其中四款本来是要按需加载的。选中的那款已经在用时载过，预览它不产生额外请求；
 * 其余按钮用界面字体，点了之后才会去载那一款。
 */
function chipFont(f: FontFamily): string | undefined {
  return p.value.font === f ? FONT_PREVIEW[f] : undefined
}

/** 滑杆只覆盖数值型偏好 */
type NumKey = 'fontScale' | 'engScale' | 'colGap' | 'lineHeight' | 'headRatio' | 'marginRatio' | 'gutterRatio'

interface SliderDef {
  key: NumKey
  label: string
  min: number
  max: number
  step: number
  /** 显示格式：ratio = 百分比，dec = 小数位 */
  kind: 'ratio' | 'dec'
  decimals?: number
  suffix?: string
  hint?: string
}

const SLIDERS: Record<NumKey, SliderDef> = {
  fontScale: { key: 'fontScale', label: '字号', min: 0.85, max: 2, step: 0.05, kind: 'ratio' },
  engScale: { key: 'engScale', label: '西文', min: 0.6, max: 1.2, step: 0.02, kind: 'ratio' },
  lineHeight: { key: 'lineHeight', label: '行距', min: 0.95, max: 2.2, step: 0.01, kind: 'dec', decimals: 2 },
  colGap: { key: 'colGap', label: '列距', min: 0, max: 1.2, step: 0.02, kind: 'ratio' },
  headRatio: { key: 'headRatio', label: '天头', min: 0.1, max: 0.3, step: 0.01, kind: 'ratio' },
  marginRatio: { key: 'marginRatio', label: '页边', min: 0.02, max: 0.12, step: 0.005, kind: 'ratio' },
  gutterRatio: { key: 'gutterRatio', label: '订口', min: 1, max: 2.6, step: 0.05, kind: 'dec', decimals: 2, suffix: '×' },
}

const GROUPS: Array<{ title: string; keys: NumKey[] }> = [
  { title: '书版', keys: ['fontScale', 'lineHeight', 'colGap'] },
  { title: '页边留白', keys: ['headRatio', 'marginRatio', 'gutterRatio'] },
  { title: '西文', keys: ['engScale'] },
]

function fmt(d: SliderDef, v: number): string {
  const n = d.kind === 'ratio' ? Math.round(v * 100) : v.toFixed(d.decimals ?? 2)
  return `${n}${d.kind === 'ratio' ? '%' : ''}${d.suffix ?? ''}`
}

function setNum(key: NumKey, e: Event): void {
  const v = +(e.target as HTMLInputElement).value
  if (Number.isFinite(v)) updatePrefs({ [key]: v } as Partial<TypographyPrefs>)
}

function setBool(key: 'punct' | 'rules' | 'rulesFull' | 'swipeTurn' | 'tapTurn', e: Event): void {
  updatePrefs({ [key]: (e.target as HTMLInputElement).checked } as Partial<TypographyPrefs>)
}
</script>

<template>
  <div class="st-ov" :class="{ s: props.open }" @click.self.stop="emit('close')">
    <aside class="st" role="dialog" aria-modal="true" aria-label="排版设置">
      <button class="st-x" @click="emit('close')" aria-label="关闭">&times;</button>

      <div class="st-bd">
        <h2 class="st-hd">排版</h2>

        <!-- 字体 -->
        <section class="st-sec">
          <h3 class="st-sec-t">字体</h3>
          <div class="st-row">
            <button
              v-for="f in FONTS"
              :key="f"
              class="st-chip"
              :class="{ on: p.font === f }"
              :style="{ fontFamily: chipFont(f) }"
              @click="updatePrefs({ font: f })"
            >{{ FONT_LABELS[f] }}</button>
          </div>
        </section>

        <!-- 数值参数 -->
        <section v-for="g in GROUPS" :key="g.title" class="st-sec">
          <h3 class="st-sec-t">{{ g.title }}</h3>
          <label v-for="key in g.keys" :key="key" class="st-sl">
            <span>{{ SLIDERS[key].label }}</span>
            <input
              type="range"
              :min="SLIDERS[key].min"
              :max="SLIDERS[key].max"
              :step="SLIDERS[key].step"
              :value="p[key]"
              @input="setNum(key, $event)"
            />
            <em>{{ fmt(SLIDERS[key], p[key]) }}</em>
          </label>
        </section>

        <!-- 装饰 -->
        <section class="st-sec">
          <h3 class="st-sec-t">装饰</h3>
          <label class="st-ck">
            <input type="checkbox" :checked="p.punct" @change="setBool('punct', $event)" />
            <span>句读</span>
          </label>
          <label class="st-ck">
            <input type="checkbox" :checked="p.rules" @change="setBool('rules', $event)" />
            <span>界行</span>
          </label>
          <label class="st-ck" :class="{ off: !p.rules }">
            <input type="checkbox" :checked="p.rulesFull" :disabled="!p.rules" @change="setBool('rulesFull', $event)" />
            <span>贯穿</span>
          </label>
        </section>

        <!-- 手机翻页 -->
        <section class="st-sec">
          <h3 class="st-sec-t">翻页</h3>
          <label class="st-ck">
            <input type="checkbox" :checked="p.swipeTurn" @change="setBool('swipeTurn', $event)" />
            <span>左右滑动翻页</span>
          </label>
          <label class="st-ck">
            <input type="checkbox" :checked="p.tapTurn" @change="setBool('tapTurn', $event)" />
            <span>点按左右三分之一翻页</span>
          </label>
        </section>

        <button class="st-reset" @click="resetPrefs()">恢复默认</button>
      </div>
    </aside>
  </div>
</template>
