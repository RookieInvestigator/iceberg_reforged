<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from '../../lib/useI18n';
import AboutModal from '../modals/AboutModal.vue';
import ContactModal from '../modals/ContactModal.vue';
import BulletinModal from '../modals/BulletinModal.vue';

interface Bulletin {
  title: string;
  date: string;
  author: string;
  content: string;
}

const props = defineProps<{
  buildDate?: string;
  entryCount?: number;
  bulletins?: Bulletin[];
}>();

const { t } = useI18n();

const showAbout = ref(false);
const showContact = ref(false);
const showBulletin = ref(false);
</script>

<template>
  <footer class="relative z-10 w-full pt-4 pb-2 text-center">
    
    <p class="mb-1.5 text-xs tracking-widest text-white/20 select-none">
      中文兔子洞冰山图 · 社区共建
    </p>
    
    <div class="flex flex-col sm:flex-row items-center justify-center text-xs tracking-widest text-white/20">
      
      <span class="select-none">Chinese Oddities Iceberg · Community Curated</span>
      
      <span class="ft-sep hidden sm:inline">|</span>
      
      <div class="flex items-center mt-2 sm:mt-0">
        <button class="ft-btn" @click="showBulletin = true">{{ t('bulletinLink') }}</button>
        <span class="ft-sep">|</span>
        <button class="ft-btn" @click="showAbout = true">{{ t('aboutLink') }}</button>
        <span class="ft-sep">|</span>
        <button class="ft-btn" @click="showContact = true">{{ t('contactLink') }}</button>
      </div>

    </div>

    <img
      src="https://count.moeyy.cn/@icebergreforged?name=icebergreforged&theme=moebooru&padding=7&offset=0&align=top&scale=1&pixelated=1&darkmode=auto"
      alt=""
      style="display:block;margin:0.75rem auto 0"
    />

    <BulletinModal v-if="showBulletin" :bulletins="props.bulletins" @close="showBulletin = false" />
    <AboutModal v-if="showAbout" :buildDate="props.buildDate" :entryCount="props.entryCount" @close="showAbout = false" />
    <ContactModal v-if="showContact" @close="showContact = false" />
  </footer>
</template>