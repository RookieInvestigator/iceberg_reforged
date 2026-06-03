<script setup lang="ts">
import csvRaw from '../data/on-this-day.csv?raw'
import { parseCSV } from '../lib/csv'
import OnThisDayApp from '../components/calendar/OnThisDayApp.vue'

const allEvents = JSON.stringify(parseCSV(csvRaw))
</script>

<template>
  <div class="relative w-full min-h-screen bg-black flex flex-col items-center">
    <OnThisDayApp :allEvents="allEvents" />
  </div>
</template>

