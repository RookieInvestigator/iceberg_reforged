<script setup>
import AppShell from './components/layout/AppShell.vue'
</script>

<template>
  <AppShell>
    <router-view v-slot="{ Component, route }">
      <transition name="page-fade" mode="out-in">
        <keep-alive>
          <component :is="Component" :key="route.path" />
        </keep-alive>
      </transition>
    </router-view>
  </AppShell>
</template>
