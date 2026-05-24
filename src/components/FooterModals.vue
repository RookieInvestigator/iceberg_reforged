<script setup>
import { ref } from 'vue';
import { useI18n } from '../lib/useI18n';
import AboutModal from './AboutModal.vue';
import ContactModal from './ContactModal.vue';

const props = defineProps({
  buildDate: { type: String, default: '' },
  entryCount: { type: Number, default: 0 },
});

const { t } = useI18n();

const showAbout = ref(false);
const showContact = ref(false);
</script>

<template>
  <p>
    Chinese Oddities Iceberg · Community Curated
    <span class="mx-2.5 text-white/10">|</span>
    <button @click="showAbout = true" class="hover:text-white/50 transition-colors cursor-pointer">
      {{ t('aboutLink') }}
    </button>
    <span class="mx-2.5 text-white/10">|</span>
    <button @click="showContact = true" class="hover:text-white/50 transition-colors cursor-pointer">
      {{ t('contactLink') }}
    </button>
  </p>

  <AboutModal v-if="showAbout" :buildDate="props.buildDate" :entryCount="props.entryCount" @close="showAbout = false" />
  <ContactModal v-if="showContact" @close="showContact = false" />
</template>
