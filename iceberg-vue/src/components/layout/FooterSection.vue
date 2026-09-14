<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from '../../lib/useI18n';
import AboutModal from '../modals/AboutModal.vue';
import CopyrightModal from '../modals/CopyrightModal.vue';
import ContactModal from '../modals/ContactModal.vue';
import BulletinModal from '../modals/BulletinModal.vue';
import TermsModal from '../modals/TermsModal.vue';
import ExportImageButton from '../items/ExportImageButton.vue';

interface Bulletin {
  title: string;
  date: string;
  author: string;
  content: string;
}

const props = defineProps<{
  buildDate?: string;
  entryCount?: number;
  introText?: string;
  bulletins?: Bulletin[];
}>();

const { t } = useI18n();

const showAbout = ref(false);
const showCopyright = ref(false);
const showContact = ref(false);
const showBulletin = ref(false);
const showTerms = ref(false);
</script>

<template>
  <footer class="relative z-10 w-full pt-4 pb-2 text-center">
    
    <p class="mb-1.5 text-xs tracking-widest text-white-40 select-none">
      中文兔子洞冰山图 · 社区共建
    </p>

    <p class="mb-1.5 text-xs tracking-widest text-white-25 select-none">
      © 2026 中文兔子洞冰山图贡献者 ·
      <a href="https://github.com/RookieInvestigator/iceberg_reforged/blob/master/LICENSE" target="_blank" rel="noopener noreferrer" class="text-white-25 hover:text-white-60 transition-colors">AGPLv3</a>
      ·
      <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans" target="_blank" rel="noopener noreferrer" class="text-white-25 hover:text-white-60 transition-colors">CC BY-NC-SA 4.0</a>
    </p>
    
    <div class="flex flex-col sm:flex-row items-center justify-center text-xs tracking-widest text-white-40">
      
      <span class="select-none">Chinese Oddities Iceberg · Community Curated</span>
      
      <span class="ft-sep hidden sm:inline">|</span>
      
      <div class="flex items-center mt-2 sm:mt-0">
        <button class="ft-btn" @click="showBulletin = true">{{ t('bulletinLink') }}</button>
        <span class="ft-sep">|</span>
        <button class="ft-btn" @click="showAbout = true">{{ t('aboutLink') }}</button>
        <span class="ft-sep">|</span>
        <button class="ft-btn" @click="showCopyright = true">{{ t('copyrightLink') }}</button>
        <span class="ft-sep">|</span>
        <button class="ft-btn" @click="showContact = true">{{ t('contactLink') }}</button>
        <span class="ft-sep">|</span>
        <button class="ft-btn" @click="showTerms = true">{{ t('termsLink') }}</button>
        <span class="ft-sep">|</span>
        <ExportImageButton linklike class="ft-btn" :coverTitle="t('siteTitle')" :coverMeta="`${props.buildDate || ''} · ${props.entryCount || 0} ${t('entries')}`" :coverIntro="props.introText || ''" />
      </div>

    </div>

    <img
      src="https://count.moeyy.cn/@icebergreforged?name=icebergreforged&theme=moebooru&padding=7&offset=0&align=top&scale=1&pixelated=1&darkmode=auto"
      alt=""
      style="display:block;margin:0.75rem auto 0"
    />

    <BulletinModal v-if="showBulletin" :bulletins="props.bulletins" @close="showBulletin = false" />
    <AboutModal v-if="showAbout" :buildDate="props.buildDate" :entryCount="props.entryCount" @close="showAbout = false" @open-copyright="showAbout = false; showCopyright = true" />
    <CopyrightModal v-if="showCopyright" @close="showCopyright = false" />
    <ContactModal v-if="showContact" @close="showContact = false" />
    <TermsModal v-if="showTerms" @close="showTerms = false" />
  </footer>
</template>