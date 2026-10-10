<script setup lang="ts">
// V2Colophon：版本跋 —— 统计行 + 发丝线 + 许可/来源/导航 + 公告入口。
// 不新增 i18n key（复用 homeStats / licenseNote 等）。
import { ref } from 'vue';
import { TriangleAlert } from '@lucide/vue';
import { useI18n } from '../../lib/useI18n';
import { SITE_HOST, SITE_ORIGIN, isProjectHost } from '../../lib/site';
import BulletinModal from '../modals/BulletinModal.vue';
import AboutModal from '../modals/AboutModal.vue';
import CopyrightModal from '../modals/CopyrightModal.vue';
import ContactModal from '../modals/ContactModal.vue';
import TermsModal from '../modals/TermsModal.vue';
import ExportImageButton from '../items/ExportImageButton.vue';
import type { Bulletin } from '../../lib/bulletins';

defineProps({
  buildDate: { type: String, default: '' },
  entryCount: { type: Number, default: 0 },
  tierCount: { type: Number, default: 0 },
  catCount: { type: Number, default: 0 },
  introText: { type: String, default: '' },
  bulletins: { type: Array as () => Bulletin[], default: () => [] },
});

const { t } = useI18n();
/** 别人部署的副本 → 提示数据可能落后 */
const isCopy = !isProjectHost();
const showBulletin = ref(false);
const showAbout = ref(false);
const showCopyright = ref(false);
const showContact = ref(false);
const showTerms = ref(false);

const GITHUB_URL = 'https://github.com/RookieInvestigator/iceberg_reforged';
const SOURCE_URL = 'https://icebergthreads.com/zh/iceberg/fel4BTCqlMAGSa2gelRJ';
const CC_URL = 'https://creativecommons.org/licenses/by-sa/4.0/deed.zh-hans';
</script>

<template>
  <footer class="v2colo" id="v2-colophon">
    <p class="v2colo-stats">{{ t('homeStats').replace('{count}', String(entryCount)).replace('{tiers}', String(tierCount)).replace('{cats}', String(catCount)) }} · {{ buildDate }}</p>
    <!-- 别人部署的副本：在统计行下方提示数据可能落后 -->
    <a v-if="isCopy" class="v2colo-copyhint" :href="SITE_ORIGIN">
      <TriangleAlert :size="12" :stroke-width="2.2" aria-hidden="true" />
      <span>{{ t('copyStaleHint').replace('{origin}', SITE_HOST) }}</span>
    </a>
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
      <ExportImageButton linklike class="v2colo-linklike" :coverTitle="t('siteTitle')" :coverMeta="`${buildDate} · ${entryCount} ${t('entries')}`" :coverIntro="introText" />
    </nav>
    <nav class="v2colo-nav v2colo-ext">
      <a :href="SOURCE_URL" target="_blank" rel="noopener noreferrer">IcebergThreads</a>
      <a :href="GITHUB_URL" target="_blank" rel="noopener noreferrer">{{ t('aboutRepo') }}</a>
      <a :href="CC_URL" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>
    </nav>
    <p class="v2colo-copy">{{ t('copyrightLine').replace('{year}', String(new Date().getFullYear())) }}</p>
    <img
      src="https://count.moeyy.cn/@icebergreforged?name=icebergreforged&theme=moebooru&padding=7&offset=0&align=top&scale=1&pixelated=1&darkmode=auto"
      alt=""
      style="display:block;margin:0.75rem auto 0"
    />
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
/* 副本提示：与统计行同处一栏，弱化但不隐形（危险色只给图标，文字走常规可读层级） */
.v2colo-copyhint {
  margin: 0.5rem auto 0; display: inline-flex; align-items: center; gap: 0.35rem;
  padding: 0.25rem 0.6rem; border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--color-danger) 32%, transparent);
  background: color-mix(in srgb, var(--color-danger) 8%, transparent);
  font-size: var(--font-tiny); letter-spacing: 0.04em; color: var(--white-65);
  text-decoration: none; transition: color 0.15s, border-color 0.15s, background-color 0.15s;
}
.v2colo-copyhint:hover { color: var(--white-90); border-color: color-mix(in srgb, var(--color-danger) 55%, transparent); background: color-mix(in srgb, var(--color-danger) 14%, transparent); }
.v2colo-note { margin: 1rem auto 0; max-width: 620px; font-size: var(--font-xs); line-height: 1.9; color: var(--white-40); }
.v2colo-nav { margin-top: 1.4rem; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0.4rem 1.2rem; font-size: var(--font-xs); letter-spacing: 0.08em; }
.v2colo-ext { margin-top: 0.7rem; }
.v2colo-nav a { color: var(--white-40); text-decoration: none; transition: color 0.15s; }
.v2colo-nav a:hover, .v2colo-linklike:hover { color: var(--white-85); }
.v2colo-linklike { background: none; border: none; cursor: pointer; padding: 0; font: inherit; color: var(--white-40); transition: color 0.15s; }
.v2colo-copy { margin: 1.4rem 0 0; font-size: 11px; letter-spacing: 0.2em; color: var(--white-25); }
</style>
