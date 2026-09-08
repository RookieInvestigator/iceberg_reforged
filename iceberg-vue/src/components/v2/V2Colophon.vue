<script setup lang="ts">
// V2Colophon（/v2 专用）：取代 FooterSection 的版本跋。
// 统计行 + 发丝线 + 许可/来源/导航：零新 i18n key（复用 homeStats / licenseNote 等）。
// 公告入口一并接过来（v1 由 FooterSection 承担，v2 不再挂载它）。
import { ref } from 'vue';
import { useI18n } from '../../lib/useI18n';
import BulletinModal from '../modals/BulletinModal.vue';
import AboutModal from '../modals/AboutModal.vue';
import CopyrightModal from '../modals/CopyrightModal.vue';
import ContactModal from '../modals/ContactModal.vue';
import TermsModal from '../modals/TermsModal.vue';

interface Bulletin {
  title: string;
  date: string;
  author: string;
  content: string;
}

defineProps({
  buildDate: { type: String, default: '' },
  entryCount: { type: Number, default: 0 },
  tierCount: { type: Number, default: 0 },
  catCount: { type: Number, default: 0 },
  bulletins: { type: Array as () => Bulletin[], default: () => [] },
});

const { t } = useI18n();
const showBulletin = ref(false);
const showAbout = ref(false);
const showCopyright = ref(false);
const showContact = ref(false);
const showTerms = ref(false);

const GITHUB_URL = 'https://github.com/RookieInvestigator/iceberg_reforged';
const SOURCE_URL = 'https://icebergthreads.com/zh/iceberg/fel4BTCqlMAGSa2gelRJ';
const CC_URL = 'https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans';
</script>

<template>
  <footer class="v2colo" id="v2-colophon">
    <p class="v2colo-stats">{{ t('homeStats').replace('{count}', String(entryCount)).replace('{tiers}', String(tierCount)).replace('{cats}', String(catCount)) }} · {{ buildDate }}</p>
    <p class="v2colo-note">{{ t('licenseNote') }}</p>
    <nav class="v2colo-nav">
      <router-link to="/">{{ t('navIceberg') }}</router-link>
      <router-link to="/home">{{ t('navHome') }}</router-link>
      <router-link to="/handbook">{{ t('handbookTitle') }}</router-link>
      <router-link to="/on-this-day">{{ t('navOnThisDay') }}</router-link>
      <button type="button" class="v2colo-linklike" @click="showBulletin = true">{{ t('bulletinLink') }}</button>
      <button type="button" class="v2colo-linklike" @click="showAbout = true">{{ t('aboutLink') }}</button>
      <button type="button" class="v2colo-linklike" @click="showCopyright = true">{{ t('copyrightLink') }}</button>
      <button type="button" class="v2colo-linklike" @click="showContact = true">{{ t('contactLink') }}</button>
      <button type="button" class="v2colo-linklike" @click="showTerms = true">{{ t('termsLink') }}</button>
    </nav>
    <nav class="v2colo-nav v2colo-ext">
      <a :href="SOURCE_URL" target="_blank" rel="noopener noreferrer">IcebergThreads</a>
      <a :href="GITHUB_URL" target="_blank" rel="noopener noreferrer">{{ t('aboutRepo') }}</a>
      <a :href="CC_URL" target="_blank" rel="noopener noreferrer">CC BY-NC-SA 4.0</a>
    </nav>
    <p class="v2colo-copy">{{ t('copyrightLine').replace('{year}', String(new Date().getFullYear())) }}</p>
    <BulletinModal v-if="showBulletin" :bulletins="bulletins" @close="showBulletin = false" />
    <AboutModal v-if="showAbout" :buildDate="buildDate" :entryCount="entryCount" @close="showAbout = false" @open-copyright="showAbout = false; showCopyright = true" />
    <CopyrightModal v-if="showCopyright" @close="showCopyright = false" />
    <ContactModal v-if="showContact" @close="showContact = false" />
    <TermsModal v-if="showTerms" @close="showTerms = false" />
  </footer>
</template>

<style scoped>
.v2colo { text-align: center; padding: 4rem var(--header-padding-x) 3rem; }
.v2colo-stats { margin: 0; font-size: var(--font-sm); font-weight: 700; letter-spacing: 0.12em; color: var(--white-70); }
.v2colo-note { margin: 1rem auto 0; max-width: 620px; font-size: var(--font-xs); line-height: 1.9; color: var(--white-40); }
.v2colo-nav { margin-top: 1.4rem; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0.4rem 1.2rem; font-size: var(--font-xs); letter-spacing: 0.08em; }
.v2colo-ext { margin-top: 0.7rem; }
.v2colo-nav a { color: var(--white-40); text-decoration: none; transition: color 0.15s; }
.v2colo-nav a:hover, .v2colo-linklike:hover { color: var(--white-85); }
.v2colo-linklike { background: none; border: none; cursor: pointer; padding: 0; font: inherit; color: var(--white-40); transition: color 0.15s; }
.v2colo-copy { margin: 1.4rem 0 0; font-size: 11px; letter-spacing: 0.2em; color: var(--white-25); }
</style>
