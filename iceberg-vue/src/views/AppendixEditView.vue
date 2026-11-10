<script setup lang="ts">
import DevShell from '../components/dev/DevShell.vue';
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
  <DevShell
    title="副表编辑器"
    subtitle="一表一域：overrides / categories / references / related / contributors / extra"
    layout="fill"
  >
    <template #actions>
      <div class="dev-seg">
        <button class="dev-seg-btn" :class="{ on: mode === 'edit' }" title="所见即所得：直接改词条" @click="mode = 'edit'">编辑</button>
        <button class="dev-seg-btn" :class="{ on: mode === 'rows' }" title="原始行：role / by / at / 越界" @click="mode = 'rows'">原始行</button>
      </div>
      <RouterLink to="/appendix-tables" class="dev-btn">整表编辑 →</RouterLink>
      <button v-if="ed.dirtyCount.value > 0" class="dev-btn dev-btn--primary" :disabled="ed.saving.value" @click="ed.saveAll()">
        {{ ed.saving.value ? '保存中…' : `保存 ${ed.dirtyCount.value} 张表` }}
      </button>
      <span v-else class="dev-note x-clean">已保存</span>
    </template>

    <div v-if="ed.violations.value.length" class="alert">⚠ 副表越界（保存会被拒）：{{ ed.violations.value.join('；') }}</div>
    <div v-if="ed.saveError.value" class="alert">✗ {{ ed.saveError.value }}</div>

    <div class="main dev-workspace">
      <AppendixSidebar class="dev-pane" :ed="ed" @select="select" />
      <div class="work" v-if="ed.selectedItem.value">
        <AppendixEntryEditor v-if="mode === 'edit'" :ed="ed" />
        <AppendixRawRows v-else :ed="ed" />
      </div>
      <div class="work empty" v-else>← 选择词条</div>
    </div>
  </DevShell>
</template>

<style scoped>
button { font-family: inherit; }

.x-clean { margin: 0; font-size: var(--font-xs); color: var(--color-success); }
.alert {
  flex-shrink: 0;
  margin-bottom: 0.6rem;
  padding: 0.45rem 0.8rem;
  border-radius: 8px;
  font-size: var(--font-xs);
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-danger) 30%, transparent);
}

.main { display: flex; }
.work { flex: 1; overflow-y: auto; padding: 1rem 1.25rem 3rem; }
.work.empty { display: flex; align-items: center; justify-content: center; color: var(--white-45); }
/* 子组件（Sidebar / EntryEditor / RawRows）内部控件拉齐到 dev 设计语言：
   统一圆角 6px、描边 white-10、底色 white-03、字号阶梯 —— 只改外观，不动布局与逻辑 */
:deep(.inp),
:deep(.sel),
:deep(.cell),
:deep(.by-in) {
  border-radius: 6px;
  border-color: var(--white-10);
  background: var(--white-03);
  font-size: var(--font-xs);
}
:deep(.add-txt),
:deep(.mini),
:deep(.more) {
  border-radius: 6px;
  border-color: var(--white-10);
  color: var(--white-65);
  font-size: var(--font-micro);
}
:deep(.add-txt:hover),
:deep(.mini:hover) { color: var(--white-92); border-color: var(--white-20); }
:deep(.n) { background: var(--white-10); color: var(--white-70); }
:deep(.tbl) { border-color: var(--white-06); border-radius: 12px; background: var(--white-02); }
</style>
