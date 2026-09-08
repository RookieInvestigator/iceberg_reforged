import { nextTick, ref, watch } from 'vue'

// 先挂载、下一帧再 show，保留 CSS 过渡（V2Tooltip teleport 门控逻辑上提）。
// getShow 传响应式读取函数；返回 ready（模板与 show 做与门）。
export function useFadeInOnShow(getShow: () => boolean) {
  const ready = ref(false)
  watch(getShow, async (v) => {
    if (v) {
      ready.value = false
      await nextTick()
      ready.value = true
    }
  })
  return ready
}
