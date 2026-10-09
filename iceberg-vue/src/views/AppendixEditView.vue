<script setup lang="ts">
// 副表编辑器（DEV 专用路由 /appendix-edit）。
//
// 这个文件只做三件事：**建编辑器模型、切模式、把两块 UI 拼起来**。
// 编辑模型在 lib/iceberg/useAppendixEditor.ts，界面在 components/appendix/：
//   AppendixSidebar     左栏词条列表
//   AppendixEntryEditor 所见即所得（默认）
//   AppendixRawRows     原始行（role / by / at / 越界）
// 副表关系（一表一域）的说明在 lib/iceberg/appendix.ts 文件头，界面里不复述。
import { ref } from 'vue'
import { useAppendixEditor } from '../lib/iceberg/useAppendixEditor'
import AppendixSidebar from '../components/appendix/AppendixSidebar.vue'
import AppendixEntryEditor from '../components/appendix/AppendixEntryEditor.vue'
import AppendixRawRows from '../components/appendix/AppendixRawRows.vue'

const ed = useAppendixEditor()
const mode = ref<'edit' | 'rows'>('edit')

function select(id: string) { ed.selectedId.value = id }
</script>

<template>
  <div class="root">
    <header class="bar">
      <span class="title">副表编辑器</span>
      <div class="mode">
        <button class="mode-btn" :class="{ on: mode === 'edit' }" title="所见即所得：直接改词条" @click="mode = 'edit'">编辑</button>
        <button class="mode-btn" :class="{ on: mode === 'rows' }" title="原始行：role / by / at / 越界" @click="mode = 'rows'">原始行</button>
      </div>
      <span class="gap" />
      <button v-if="ed.dirtyCount.value > 0" class="save" :disabled="ed.saving.value" @click="ed.saveAll()">
        {{ ed.saving.value ? '保存中…' : `保存 ${ed.dirtyCount.value} 张表` }}
      </button>
      <span v-else class="clean">已保存</span>
    </header>

    <div v-if="ed.violations.value.length" class="alert">⚠ 副表越界（保存会被拒）：{{ ed.violations.value.join('；') }}</div>
    <div v-if="ed.saveError.value" class="alert">✗ {{ ed.saveError.value }}</div>

    <div class="main">
      <AppendixSidebar :ed="ed" @select="select" />
      <div class="work" v-if="ed.selectedItem.value">
        <AppendixEntryEditor v-if="mode === 'edit'" :ed="ed" />
        <AppendixRawRows v-else :ed="ed" />
      </div>
      <div class="work empty" v-else>← 选择词条</div>
    </div>
  </div>
</template>

<style scoped>
.root {
  display: flex; flex-direction: column;
  height: calc(100vh - var(--bulletin-offset, 0px));
  background: var(--color-modal-bg); color: var(--white-88);
  font: 14px/1.7 system-ui, -apple-system, sans-serif;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
button { font-family: inherit; }

.bar { display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 1.25rem; border-bottom: 1px solid var(--white-09); flex-shrink: 0; }
.title { font-size: var(--font-sm); font-weight: 900; color: var(--white-95); letter-spacing: 0.02em; }
.gap { flex: 1; }
.mode { display: inline-flex; padding: 2px; gap: 2px; border-radius: 8px; background: var(--white-06); }
.mode-btn { font-size: var(--font-xs); padding: 0.22rem 0.7rem; border: none; border-radius: 6px; background: none; color: var(--white-60); cursor: pointer; }
.mode-btn:hover { color: var(--white-90); }
.mode-btn.on { background: var(--white-14); color: #fff; font-weight: 700; }
.save { font-size: var(--font-xs); font-weight: 700; padding: 0.32rem 0.9rem; border-radius: 7px; cursor: pointer; border: 1px solid var(--color-fav); background: color-mix(in srgb, var(--color-fav) 16%, transparent); color: var(--color-fav); }
.save:hover { background: color-mix(in srgb, var(--color-fav) 26%, transparent); }
.save:disabled { opacity: 0.5; }
.clean { font-size: var(--font-xs); color: var(--color-success); }
.alert { flex-shrink: 0; padding: 0.45rem 1.25rem; font-size: var(--font-xs); color: var(--color-danger); background: color-mix(in srgb, var(--color-danger) 12%, transparent); border-bottom: 1px solid color-mix(in srgb, var(--color-danger) 30%, transparent); }

.main { display: flex; flex: 1; overflow: hidden; }
.work { flex: 1; overflow-y: auto; padding: 2rem 2.5rem 5rem; }
.work.empty { display: flex; align-items: center; justify-content: center; color: var(--white-45); }
</style>
