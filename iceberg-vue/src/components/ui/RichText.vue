<script setup lang="ts">
// RichText：块级富文本 —— 段落 + 引用块，行内标记/链接交给 RichInline。
// 词条正文（卡片 / 抽屉 / 3D 面板 / 深潜面板）与手册释义共用，避免四套渲染各写一遍。
// inline 模式供 tooltip 这类单行容器使用：不分块、不产生 <p>，只做行内渲染。
import { computed } from 'vue'
import { parseRichBlocks, type RichBlock } from '../../lib/richText'
import RichInline from './RichInline.vue'

const props = defineProps<{ text: string; inline?: boolean }>()

/** 内联模式把整段当一个块（保留换行由 pre-line 处理） */
const blocks = computed<RichBlock[]>(() =>
  props.inline ? [{ type: 'p', text: props.text }] : parseRichBlocks(props.text),
)
</script>

<template>
  <span v-if="inline" class="rt rt--inline"><RichInline :text="text" /></span>
  <div v-else class="rt">
    <template v-for="(block, bi) in blocks" :key="bi">
      <blockquote v-if="block.type === 'quote'" class="rt-quote">
        <RichInline :text="block.text" />
      </blockquote>
      <p v-else class="rt-p">
        <RichInline :text="block.text" />
      </p>
    </template>
  </div>
</template>

<style scoped>
.rt { white-space: normal; }
.rt--inline { white-space: pre-line; }

/* 一个 <p> = 一个段落；段内硬换行（行尾 \ 或两个空格）靠 pre-line 顶格续行 */
.rt-p {
  margin: 0;
  white-space: pre-line;
}
/* 段落之间 0.8em；引用块前后稍宽（0.9em）—— 与手册释义同一套节奏 */
.rt > * + * { margin-top: 0.8em; }
.rt-quote {
  margin: 0;
  padding: 0.15em 0 0.15em 0.85em;
  border-left: 2px solid var(--white-18);
  color: var(--white-70);
  white-space: pre-line;
}
.rt > * + .rt-quote,
.rt > .rt-quote + * { margin-top: 0.9em; }
</style>
