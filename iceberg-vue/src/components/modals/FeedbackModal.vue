<script setup lang="ts">
// FeedbackModal：反馈表单（整条预填 + 一条说明；必须登录，匿名不可提交）。
// 未登录显示登录引导（内嵌懒加载 UserModal，父级零接线）。
// 成功态常驻"已发送"（不自动关，给用户确认感）。
import { computed, defineAsyncComponent, inject, ref } from 'vue';
import { useStore } from '@nanostores/vue';
import BaseModal from './BaseModal.vue';
import { useI18n } from '../../lib/useI18n';
import { user as userAtom } from '../../lib/userState';
import { CATEGORY_COLORS_KEY, TAG_MAP_KEY } from '../../lib/injectionKeys';
import { diffFeedback, postFeedback } from '../../lib/feedbackData';

const UserModal = defineAsyncComponent(() => import('./UserModal.vue'));

export interface FeedbackSource {
  id: string
  title: string
  desc: string
  category: string
  tags?: string[]
  link?: string
}

const props = defineProps<{ item: FeedbackSource }>();
const emit = defineEmits(['close']);

const { t } = useI18n();
const u = useStore(userAtom);
const showLogin = ref(false);

// 分类下拉 / 标签多选的数据源（弹窗挂在词条视图树内，inject 必中；缺省空对象降级）
const categoryColors = inject(CATEGORY_COLORS_KEY, {} as Record<string, string>);
const tagMap = inject(TAG_MAP_KEY, {} as Record<string, string>);
const categoryOpts = computed(() => {
  const names = Object.keys(categoryColors || {});
  if (props.item.category && !names.includes(props.item.category)) return [props.item.category, ...names];
  return names;
});
const tagOpts = computed(() => Object.entries(tagMap || {}));

const fTitle = ref(props.item.title);
const fDesc = ref(props.item.desc);
const fCategory = ref(props.item.category);
const fTags = ref<string[]>([...(props.item.tags || [])]);
function toggleFTag(name: string) {
  fTags.value = fTags.value.includes(name)
    ? fTags.value.filter((e) => e !== name)
    : [...fTags.value, name];
}
const fLink = ref(props.item.link || '');
const note = ref('');
const sending = ref(false);
const sent = ref(false);
const errorMsg = ref('');

const changedCount = computed(() => Object.keys(diffFeedback(
  {
    title: props.item.title, desc: props.item.desc, link: props.item.link || '',
    category: props.item.category, tags: props.item.tags || [],
  },
  {
    title: fTitle.value, desc: fDesc.value, link: fLink.value.trim(),
    category: fCategory.value, tags: [...fTags.value],
  },
)).length);

async function submit() {
  errorMsg.value = '';
  if (!note.value.trim()) { errorMsg.value = t('feedbackNoteRequired'); return; }
  sending.value = true;
  try {
    await postFeedback(props.item.id, diffFeedback(
      {
        title: props.item.title, desc: props.item.desc, link: props.item.link || '',
        category: props.item.category, tags: props.item.tags || [],
      },
      {
        title: fTitle.value, desc: fDesc.value, link: fLink.value.trim(),
        category: fCategory.value, tags: [...fTags.value],
      },
    ), note.value);
    sent.value = true;
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : String(e);
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <BaseModal :title="t('feedbackTitle')" size="md" @close="emit('close')">
    <!-- 未登录：引导登录（无匿名分支） -->
    <template v-if="!u">
      <p class="text-sm text-white-55 leading-relaxed text-center py-2">{{ t('feedbackLogin') }}</p>
      <button @click="showLogin = true"
        class="mt-3 w-full py-2 rounded-md text-xs font-medium bg-white text-black hover:bg-white/85 transition-colors cursor-pointer">
        {{ t('login') }}
      </button>
      <UserModal v-if="showLogin" @close="showLogin = false" />
    </template>

    <!-- 已发送 -->
    <template v-else-if="sent">
      <p class="text-sm text-white-85 text-center py-4">{{ t('feedbackSent') }}</p>
      <button @click="emit('close')"
        class="w-full py-2 rounded-md text-xs font-medium bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer">
        {{ t('close') }}
      </button>
    </template>

    <!-- 表单：整条预填 + 说明 -->
    <template v-else>
      <div class="space-y-3">
        <label class="block">
          <span class="fb-label">{{ t('feedbackFieldTitle') }}</span>
          <input v-model="fTitle" class="fb-input" />
        </label>
        <label class="block">
          <span class="fb-label">{{ t('feedbackFieldDesc') }}</span>
          <textarea v-model="fDesc" rows="4" class="fb-input resize-y"></textarea>
        </label>
        <div class="grid grid-cols-2 gap-2">
          <label class="block">
            <span class="fb-label">{{ t('feedbackFieldCategory') }}</span>
            <select v-model="fCategory" class="fb-input">
              <option v-for="c in categoryOpts" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>
          <label class="block">
            <span class="fb-label">{{ t('feedbackFieldLink') }}</span>
            <input v-model="fLink" placeholder="https://" class="fb-input" />
          </label>
        </div>
        <div>
          <span class="fb-label">{{ t('feedbackFieldTags') }}</span>
          <div class="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto no-scrollbar">
            <button v-for="[emoji, name] in tagOpts" :key="emoji" type="button" @click="toggleFTag(name)"
              :class="['inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border transition-colors cursor-pointer',
                fTags.includes(name)
                  ? 'bg-white text-black border-transparent'
                  : 'bg-transparent text-white/60 border-white/10 hover:text-white/90 hover:bg-white/5']">
              <span>{{ emoji }}</span><span>{{ name }}</span>
            </button>
          </div>
        </div>
        <label class="block">
          <span class="fb-label">{{ t('feedbackNote') }} · {{ t('required') }}</span>
          <textarea v-model="note" rows="3" :placeholder="t('feedbackNoteHint')" class="fb-input resize-y"></textarea>
        </label>
        <p v-if="changedCount === 0" class="text-xs text-white-30">{{ t('feedbackNoteOnly') }}</p>
        <p v-if="errorMsg" class="text-xs text-danger" role="alert">{{ errorMsg }}</p>
        <button @click="submit" :disabled="sending"
          class="w-full py-2 rounded-md text-xs font-medium bg-white text-black hover:bg-white/85 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
          {{ sending ? t('feedbackSending') : t('feedbackSubmit') }}
        </button>
      </div>
    </template>
  </BaseModal>
</template>

<style scoped>
.fb-label {
  display: block; margin-bottom: 6px;
  font-size: var(--font-micro); font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.12em; color: var(--white-45);
}
.fb-input {
  width: 100%; padding: 8px 10px; font-size: var(--font-sm);
  background: var(--white-03); border: 1px solid var(--white-10); border-radius: 8px;
  color: var(--white-85);
}
.fb-input:focus { outline: none; border-color: var(--white-30); background: var(--white-05); }
.fb-input::placeholder { color: var(--white-25); }
</style>
