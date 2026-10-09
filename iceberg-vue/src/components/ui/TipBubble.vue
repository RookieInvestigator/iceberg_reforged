<script setup lang="ts">
// TipBubble：气泡 tooltip 的**唯一实现**（2026-10-09 提取）。
//
// 之前徽章释义与标记备注各写一套：一个白底黑字居中、一个深底白字左对齐，
// 截断行数、过渡时长、z-index 也都不一样 —— 于是「两种 tooltip 看着不是一回事」。
// 现在外观全在 styles/v2.css 的 .tip-anchor / .tip-bubble（一处定义），
// 组件只负责结构 + 三条展开路径（hover / 键盘聚焦 / 触屏点击）+ 超界归位。
//
// 用法：把触发元素放进默认插槽，组件会包一层 .tip-anchor 作为定位参照与事件宿主。
//   <TipBubble :text="desc"><a class="meta-chip">…</a></TipBubble>
import { nextTick, ref } from 'vue'
import { clearTipFit, fitTipIntoView } from '../../lib/fitTip'

const props = defineProps<{
  /** 气泡文案；空串则不渲染气泡（也不占位） */
  text?: string
}>()

const root = ref<HTMLElement | null>(null)
const open = ref(false)

function show() {
  if (!props.text) return
  open.value = true
  // 量取需要等气泡真正参与布局（v-if 之后）
  void nextTick(() => fitTipIntoView(root.value, '.tip-bubble'))
}
function hide() {
  open.value = false
  clearTipFit(root.value, '.tip-bubble')
}
/** 触屏：点一下切换（无 hover）；桌面点击也会切，移开时由 mouseleave 收掉 */
function toggle() {
  if (open.value) hide()
  else show()
}
</script>

<template>
  <span
    ref="root"
    class="tip-anchor"
    :class="{ open }"
    @mouseenter="show" @mouseleave="hide"
    @focusin="show" @focusout="hide"
    @click="toggle"
  >
    <slot />
    <span v-if="text" class="tip-bubble" role="tooltip">{{ text }}</span>
  </span>
</template>
