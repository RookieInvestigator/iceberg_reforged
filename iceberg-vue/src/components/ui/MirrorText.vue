<script setup lang="ts">
/**
 * 按字镜像渲染一段文本：「廻戮戈」这三个字逐字左右翻转，其余原样。
 *
 * 用法与纯文本一致：`<MirrorText :text="item.title" />`。
 * 逐字翻转而不是整串翻转 —— 整串 scaleX(-1) 会把字序倒过来。
 */
import { computed } from 'vue'
import { splitMirror } from '../../lib/iceberg/mirror'

const props = defineProps<{ text: string }>()

const segments = computed(() => splitMirror(props.text))
</script>

<template>
  <template v-for="(seg, si) in segments" :key="si">
    <span v-if="seg.mirror" class="mir-seq"><span v-for="(ch, ci) in seg.text" :key="ci" class="mir">{{ ch }}</span></span>
    <template v-else>{{ seg.text }}</template>
  </template>
</template>

<style scoped>
/* inline 元素上 transform 不生效，必须 inline-block */
.mir {
  display: inline-block;
  transform: scaleX(-1);
}
</style>
