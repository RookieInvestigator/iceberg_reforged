<script setup lang="ts">
import BaseModal from '../modals/BaseModal.vue'

const emit = defineEmits<{ close: [] }>()

const GROUPS = [
  {
    title: '全局',
    rows: [
      { keys: ['/'], desc: '聚焦搜索框' },
      { keys: ['⌘', 'K'], desc: '搜索速查（直达结果）' },
      { keys: ['F'], desc: '打开 / 关闭筛选面板' },
      { keys: ['R'], desc: '随机抽一个词条' },
      { keys: ['?'], desc: '显示这张快捷键表' },
      { keys: ['Esc'], desc: '关闭浮层 / 失焦搜索框' },
    ],
  },
  {
    title: '词条详情内',
    rows: [
      { keys: ['←'], desc: '上一条（按当前筛选与排序）' },
      { keys: ['→'], desc: '下一条' },
      { keys: ['F'], desc: '收藏 / 取消收藏' },
      { keys: ['Esc'], desc: '关闭详情' },
    ],
  },
  {
    title: '搜索',
    rows: [
      { keys: ['↑', '↓'], desc: '在速查结果里移动' },
      { keys: ['↵'], desc: '打开选中的词条' },
    ],
  },
] as const
</script>

<template>
  <BaseModal title="快捷键" size="md" @close="emit('close')">
    <div class="v3-sc-body">
      <section v-for="g in GROUPS" :key="g.title" class="v3-sc-group">
        <h3 class="v3-sc-h">{{ g.title }}</h3>
        <dl class="v3-sc-list">
          <template v-for="r in g.rows" :key="r.desc">
            <dt class="v3-sc-keys">
              <template v-for="(k, i) in r.keys" :key="i">
                <span v-if="i > 0" class="v3-sc-plus" aria-hidden="true">+</span>
                <kbd class="v3-sc-kbd">{{ k }}</kbd>
              </template>
            </dt>
            <dd class="v3-sc-desc">{{ r.desc }}</dd>
          </template>
        </dl>
      </section>
    </div>
  </BaseModal>
</template>

<style scoped>
.v3-sc-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.v3-sc-group { display: flex; flex-direction: column; gap: 0.5rem; }
.v3-sc-group + .v3-sc-group {
  padding-top: 0.875rem;
  border-top: 1px solid var(--white-05);
}
.v3-sc-h {
  margin: 0;
  font-size: var(--font-tiny);
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--white-30);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.v3-sc-h::before {
  content: '';
  width: 3px; height: 3px;
  border-radius: 50%;
  background: var(--color-accent);
  flex: none;
}
.v3-sc-list {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.45rem 0.875rem;
  margin: 0;
  align-items: center;
}
.v3-sc-keys { display: flex; align-items: center; gap: 0.25rem; }
.v3-sc-kbd {
  display: inline-block;
  min-width: 1.6em;
  padding: 0.125rem 0.4rem;
  border: 1px solid var(--white-15);
  border-radius: 5px;
  background: var(--white-05);
  font-family: ui-monospace, monospace;
  font-size: var(--font-tiny);
  color: var(--white-85);
  text-align: center;
}
.v3-sc-plus { color: var(--white-20); font-size: var(--font-micro); }
.v3-sc-desc {
  margin: 0;
  font-size: var(--font-xs);
  color: var(--white-60);
}
</style>
