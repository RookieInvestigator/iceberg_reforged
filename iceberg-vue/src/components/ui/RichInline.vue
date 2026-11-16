<script setup lang="ts">
// RichInline：富文本的「行内段」渲染 —— 标记样式 + 链接（外链 / 站内 / 锚点）。
// 被 RichText 的段落、引用块与 tooltip 内联模式共用，保证四处视觉一致。
import { RouterLink } from 'vue-router'
import { hrefKind, segmentDesc, groupUnbreakable } from '../../lib/richText'

defineProps<{ text: string }>()
</script>

<template>
  <template v-for="(seg, si) in segmentDesc(text)" :key="si">
    <a
      v-if="seg.href && hrefKind(seg.href) === 'external'"
      :href="seg.href"
      target="_blank"
      rel="noopener noreferrer"
      class="rt-link"
      :class="{ 'rt-em': seg.em, 'rt-i': seg.italic, 'rt-b': seg.bold }"
    ><template v-for="(part, pi) in groupUnbreakable(seg.text)" :key="pi"><span v-if="part.nobreak" class="clreq-nobreak">{{ part.text }}</span><template v-else>{{ part.text }}</template></template></a>
    <a
      v-else-if="seg.href && hrefKind(seg.href) === 'hash'"
      :href="seg.href"
      class="rt-link"
      :class="{ 'rt-em': seg.em, 'rt-i': seg.italic, 'rt-b': seg.bold }"
    ><template v-for="(part, pi) in groupUnbreakable(seg.text)" :key="pi"><span v-if="part.nobreak" class="clreq-nobreak">{{ part.text }}</span><template v-else>{{ part.text }}</template></template></a>
    <RouterLink
      v-else-if="seg.href"
      :to="seg.href"
      class="rt-link"
      :class="{ 'rt-em': seg.em, 'rt-i': seg.italic, 'rt-b': seg.bold }"
    ><template v-for="(part, pi) in groupUnbreakable(seg.text)" :key="pi"><span v-if="part.nobreak" class="clreq-nobreak">{{ part.text }}</span><template v-else>{{ part.text }}</template></template></RouterLink>
    <span v-else :class="{ 'rt-em': seg.em, 'rt-i': seg.italic, 'rt-b': seg.bold }"><template v-for="(part, pi) in groupUnbreakable(seg.text)" :key="pi"><span v-if="part.nobreak" class="clreq-nobreak">{{ part.text }}</span><template v-else>{{ part.text }}</template></template></span>
  </template>
</template>

<style scoped>
.rt-i { font-style: italic; }
.rt-b { font-weight: 700; }
/* 强调：琥珀底色 + 提亮文字；box-decoration-break 让跨行时底色不断裂 */
.rt-em {
  color: var(--white-92);
  background: var(--color-accent-wash);
  border-radius: 4px;
  padding: 0 0.18em;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}
.rt-link {
  color: var(--color-accent-soft);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.18em;
  transition: color 0.15s;
}
.rt-link:hover { color: var(--color-accent-bright); }
</style>
