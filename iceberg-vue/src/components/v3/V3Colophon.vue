<script setup lang="ts">
import { computed, defineAsyncComponent, inject, onMounted, ref } from 'vue'
import { TriangleAlert } from '@lucide/vue'
import { useI18n } from '../../lib/useI18n'
import { SITE_HOST, SITE_ORIGIN, fetchRemoteVersion, hasNewerData, isOnCanonicalOrigin } from '../../lib/site'
import { loadBulletins, type Bulletin } from '../../lib/bulletins'
import { V3_CTX_KEY } from '../../lib/v3/keys'
import ExportImageButton from '../items/ExportImageButton.vue'

const BulletinModal = defineAsyncComponent(() => import('../modals/BulletinModal.vue'))
const AboutModal = defineAsyncComponent(() => import('../modals/AboutModal.vue'))
const CopyrightModal = defineAsyncComponent(() => import('../modals/CopyrightModal.vue'))
const ContactModal = defineAsyncComponent(() => import('../modals/ContactModal.vue'))
const TermsModal = defineAsyncComponent(() => import('../modals/TermsModal.vue'))

const props = withDefaults(defineProps<{
  buildDate?: string
  entryCount?: number
  tierCount?: number
  catCount?: number
  introText?: string
  bulletins?: Bulletin[]
}>(), {
  buildDate: '',
  entryCount: 0,
  tierCount: 0,
  catCount: 0,
  introText: '',
  bulletins: () => [],
})

const emit = defineEmits<{ shortcuts: [] }>()

const { t } = useI18n()
const v3Ctx = inject(V3_CTX_KEY, null)
const resolvedBuildDate = computed(() => v3Ctx?.buildDate.value ?? props.buildDate)
const resolvedEntryCount = computed(() => (v3Ctx ? v3Ctx.dataset.value.items.length : props.entryCount))
const resolvedTierCount = computed(() => (v3Ctx ? v3Ctx.dataset.value.tierOrder.length : props.tierCount))
const resolvedCatCount = computed(() => (v3Ctx ? Object.keys(v3Ctx.dataset.value.categoryColors).length : props.catCount))
const resolvedIntroText = computed(() => (v3Ctx ? v3Ctx.dataset.value.introText : props.introText))
const resolvedBulletins = computed(() => (props.bulletins.length ? props.bulletins : loadBulletins()))

const showBulletin = ref(false)
const showAbout = ref(false)
const showCopyright = ref(false)
const showContact = ref(false)
const showTerms = ref(false)

const newerCount = ref(0)
onMounted(async () => {
  const remote = await fetchRemoteVersion()
  if (hasNewerData(remote)) newerCount.value = remote?.total || 0
})
const staleHint = computed(() =>
  newerCount.value ? t('newerData').replace('{count}', String(newerCount.value)) : '',
)
const showLink = computed(() => !isOnCanonicalOrigin())

const GITHUB_URL = 'https://github.com/RookieInvestigator/iceberg_reforged'
const SOURCE_URL = 'https://icebergthreads.com/zh/iceberg/fel4BTCqlMAGSa2gelRJ'
const CC_URL = 'https://creativecommons.org/licenses/by-sa/4.0/deed.zh-hans'
</script>

<template>
  <footer class="v3-colo" id="v3-colophon">
    <p class="v3-colo-stats">
      {{ t('homeStats').replace('{count}', String(resolvedEntryCount)).replace('{tiers}', String(resolvedTierCount)).replace('{cats}', String(resolvedCatCount)) }} · {{ resolvedBuildDate }}
    </p>
    <p v-if="staleHint" class="v3-colo-stale">
      <TriangleAlert :size="12" :stroke-width="2.2" aria-hidden="true" />
      <span>{{ staleHint }}</span>
      <a v-if="showLink" :href="SITE_ORIGIN">{{ SITE_HOST }}</a>
    </p>
    <p class="v3-colo-note">{{ t('licenseNote') }}</p>
    <nav class="v3-colo-nav">
      <RouterLink to="/">{{ t('navIceberg') }}</RouterLink>
      <RouterLink to="/home">{{ t('navHome') }}</RouterLink>
      <RouterLink to="/handbook">{{ t('handbookTitle') }}</RouterLink>
      <RouterLink to="/on-this-day">{{ t('navOnThisDay') }}</RouterLink>
      <button type="button" class="v3-colo-linklike" @click="showBulletin = true">{{ t('bulletinLink') }}</button>
      <button type="button" class="v3-colo-linklike" @click="showAbout = true">{{ t('aboutLink') }}</button>
      <button type="button" class="v3-colo-linklike" @click="showCopyright = true">{{ t('copyrightLink') }}</button>
      <button type="button" class="v3-colo-linklike" @click="showContact = true">{{ t('contactLink') }}</button>
      <button type="button" class="v3-colo-linklike" @click="showTerms = true">{{ t('termsLink') }}</button>
      <ExportImageButton
        linklike
        class="v3-colo-linklike"
        :coverTitle="t('siteTitle')"
        :coverMeta="`${resolvedBuildDate} · ${resolvedEntryCount} ${t('entries')}`"
        :coverIntro="resolvedIntroText"
      />
      <button type="button" class="v3-colo-linklike" @click="v3Ctx ? v3Ctx.openShortcuts() : emit('shortcuts')">快捷键 (?)</button>
    </nav>
    <nav class="v3-colo-nav v3-colo-ext">
      <a :href="SOURCE_URL" target="_blank" rel="noopener noreferrer">IcebergThreads</a>
      <a :href="GITHUB_URL" target="_blank" rel="noopener noreferrer">{{ t('aboutRepo') }}</a>
      <a :href="CC_URL" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>
    </nav>
    <p class="v3-colo-copy">{{ t('copyrightLine').replace('{year}', String(new Date().getFullYear())) }}</p>
    <img
      src="https://count.moeyy.cn/@icebergreforged?name=icebergreforged&theme=moebooru&padding=7&offset=0&align=top&scale=1&pixelated=1&darkmode=auto"
      alt=""
      style="display:block;margin:0.75rem auto 0"
    />
    <BulletinModal v-if="showBulletin" :bulletins="resolvedBulletins" @close="showBulletin = false" />
    <AboutModal v-if="showAbout" :buildDate="resolvedBuildDate" :entryCount="resolvedEntryCount" @close="showAbout = false" @open-copyright="showAbout = false; showCopyright = true" />
    <CopyrightModal v-if="showCopyright" @close="showCopyright = false" />
    <ContactModal v-if="showContact" @close="showContact = false" />
    <TermsModal v-if="showTerms" @close="showTerms = false" />
  </footer>
</template>

<style scoped>
.v3-colo { text-align: center; padding: 4rem var(--header-padding-x) 3rem; }
.v3-colo-stats { margin: 0; font-size: var(--font-sm); font-weight: 700; letter-spacing: 0.12em; color: var(--white-70); }
.v3-colo-stale {
  margin: 0.5rem auto 0; display: inline-flex; align-items: center; gap: 0.35rem;
  padding: 0.25rem 0.6rem; border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--color-danger) 32%, transparent);
  background: color-mix(in srgb, var(--color-danger) 8%, transparent);
  font-size: var(--font-tiny); letter-spacing: 0.04em; color: var(--white-65);
}
.v3-colo-stale a { color: var(--white-65); text-decoration: none; border-bottom: 1px solid color-mix(in srgb, var(--color-danger) 45%, transparent); transition: color 0.15s; }
.v3-colo-stale a:hover { color: var(--white-90); }
.v3-colo-note { margin: 1rem auto 0; max-width: 620px; font-size: var(--font-xs); line-height: 1.9; color: var(--white-40); }
.v3-colo-nav { margin-top: 1.4rem; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0.4rem 1.2rem; font-size: var(--font-xs); letter-spacing: 0.08em; }
.v3-colo-ext { margin-top: 0.7rem; }
.v3-colo-nav a { color: var(--white-40); text-decoration: none; transition: color 0.15s; }
.v3-colo-nav a:hover, .v3-colo-linklike:hover { color: var(--white-85); }
.v3-colo-linklike { background: none; border: none; cursor: pointer; padding: 0; font: inherit; color: var(--white-40); transition: color 0.15s; }
.v3-colo-copy { margin: 1.4rem 0 0; font-size: 11px; letter-spacing: 0.2em; color: var(--white-25); }
</style>
