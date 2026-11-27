<script setup lang="ts">
import csvRaw from '../data/on-this-day.csv?raw'
import { parseCSV } from '../lib/csv'
import { normalizeOnThisDayEvents } from '../lib/onThisDay'
import OnThisDayApp from '../components/calendar/OnThisDayApp.vue'

const allEvents = normalizeOnThisDayEvents(parseCSV(csvRaw))
</script>

<template>
  <OnThisDayApp :allEvents="allEvents" />
</template>
