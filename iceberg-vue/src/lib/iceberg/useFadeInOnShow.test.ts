import { describe, expect, it } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useFadeInOnShow } from './useFadeInOnShow'

describe('useFadeInOnShow', () => {
  it('show 变 true 后下一帧 ready，false 不动', async () => {
    const show = ref(false)
    let readyRef!: { value: boolean }
    const Host = defineComponent({
      setup() {
        readyRef = useFadeInOnShow(() => show.value)
        return () => null
      },
    })
    mount(Host)
    expect(readyRef.value).toBe(false)
    show.value = true
    await nextTick()
    await nextTick()
    expect(readyRef.value).toBe(true)
  })
})
