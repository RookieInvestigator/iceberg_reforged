<script setup lang="ts">
// V2Colophon：版本跋 —— 统计行 + 发丝线 + 许可/来源/导航 + 公告入口。
import { computed, onMounted, ref } from 'vue';
import { TriangleAlert } from '@lucide/vue';
import { useI18n } from '../../lib/useI18n';
import { SITE_HOST, SITE_ORIGIN, fetchRemoteVersion, hasNewerData, isOnCanonicalOrigin } from '../../lib/site';
import BulletinModal from '../modals/BulletinModal.vue';
import AboutModal from '../modals/AboutModal.vue';
import CopyrightModal from '../modals/CopyrightModal.vue';
import ContactModal from '../modals/ContactModal.vue';
import TermsModal from '../modals/TermsModal.vue';
import ExportImageButton from '../items/ExportImageButton.vue';
import type { Bulletin } from '../../lib/bulletins';

const props = defineProps({
  buildDate: { type: String, default: '' },
  /** 数据快照时间（秒级 Unix）；新鲜度提示据此判定，任何部署一视同仁 */
  generatedAt: { type: Number, default: 0 },
  entryCount: { type: Number, default: 0 },
  tierCount: { type: Number, default: 0 },
  catCount: { type: Number, default: 0 },
  introText: { type: String, default: '' },
  bulletins: { type: Array as () => Bulletin[], default: () => [] },
});

const { t } = useI18n();
const showBulletin = ref(false);
const showAbout = ref(false);
const showCopyright = ref(false);
const showContact = ref(false);
const showTerms = ref(false);

// 只比内容指纹：远端真有新数据才提示（数据可能几十天不变，按天数判会一直误报）
const newerCount = ref(0);
onMounted(async () => {
  const remote = await fetchRemoteVersion();
  if (hasNewerData(remote)) newerCount.value = remote?.total || 0;
});
const staleHint = computed(() =>
  newerCount.value ? t('newerData').replace('{count}', String(newerCount.value)) : '',
);
// 已经在站点域名上就不必再链回自己
const showLink = computed(() => !isOnCanonicalOrigin());

const GITHUB_URL = 'https://github.com/RookieInvestigator/iceberg_reforged';
const SOURCE_URL = 'https://icebergthreads.com/zh/iceberg/fel4BTCqlMAGSa2gelRJ';
const CC_URL = 'https://creativecommons.org/licenses/by-sa/4.0/deed.zh-hans';
</script>

<template>
  <footer class="v2colo" id="v2-colophon">
    <p class="v2colo-stats">{{ t('homeStats').replace('{count}', String(entryCount)).replace('{tiers}', String(tierCount)).replace('{cats}', String(catCount)) }} · {{ buildDate }}</p>
    <!-- 数据旧了才提示：不看域名，任何部署（含本项目自己的）都按同一把尺子 -->
    <p v-if="staleHint" class="v2colo-stale">
      <TriangleAlert :size="12" :stroke-width="2.2" aria-hidden="true" />
      <span>{{ staleHint }}</span>
      <a v-if="showLink" :href="SITE_ORIGIN">{{ SITE_HOST }}</a>
    </p>
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
/* 数据过期提示：与统计行同处一栏，弱化但不隐形（危险色只给图标） */
.v2colo-stale {
  margin: 0.5rem auto 0; display: inline-flex; align-items: center; gap: 0.35rem;
  padding: 0.25rem 0.6rem; border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--color-danger) 32%, transparent);
  background: color-mix(in srgb, var(--color-danger) 8%, transparent);
  font-size: var(--font-tiny); letter-spacing: 0.04em; color: var(--white-65);
}
.v2colo-stale a { color: var(--white-65); text-decoration: none; border-bottom: 1px solid color-mix(in srgb, var(--color-danger) 45%, transparent); transition: color 0.15s; }
.v2colo-stale a:hover { color: var(--white-90); }
.v2colo-note { margin: 1rem auto 0; max-width: 620px; font-size: var(--font-xs); line-height: 1.9; color: var(--white-40); }
.v2colo-nav { margin-top: 1.4rem; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0.4rem 1.2rem; font-size: var(--font-xs); letter-spacing: 0.08em; }
.v2colo-ext { margin-top: 0.7rem; }
.v2colo-nav a { color: var(--white-40); text-decoration: none; transition: color 0.15s; }
.v2colo-nav a:hover, .v2colo-linklike:hover { color: var(--white-85); }
.v2colo-linklike { background: none; border: none; cursor: pointer; padding: 0; font: inherit; color: var(--white-40); transition: color 0.15s; }
.v2colo-copy { margin: 1.4rem 0 0; font-size: 11px; letter-spacing: 0.2em; color: var(--white-25); }
</style>
