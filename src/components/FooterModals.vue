<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from '../lib/useI18n';
import AboutModal from './AboutModal.vue';
import ContactModal from './ContactModal.vue';
import BulletinModal from './BulletinModal.vue';

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
  <p>
    Chinese Oddities Iceberg · Community Curated
    <span class="mx-2.5 text-white/10">|</span>
    <button @click="showBulletin = true" class="hover:text-white/50 transition-colors cursor-pointer">
      {{ t('bulletinLink') }}
    </button>
    <span class="mx-2.5 text-white/10">|</span>
    <button @click="showAbout = true" class="hover:text-white/50 transition-colors cursor-pointer">
      {{ t('aboutLink') }}
    </button>
    <span class="mx-2.5 text-white/10">|</span>
    <button @click="showContact = true" class="hover:text-white/50 transition-colors cursor-pointer">
      {{ t('contactLink') }}
    </button>
  </p>

  <BulletinModal v-if="showBulletin" :bulletins="props.bulletins" @close="showBulletin = false" />
  <AboutModal v-if="showAbout" :buildDate="props.buildDate" :entryCount="props.entryCount" @close="showAbout = false" />
  <ContactModal v-if="showContact" @close="showContact = false" />
</template>
