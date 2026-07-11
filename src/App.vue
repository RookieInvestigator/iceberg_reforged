<script setup>
import AppShell from './components/layout/AppShell.vue'
</script>

<template>
  <AppShell>
    <router-view v-slot="{ Component, route }">
      <div style="min-height: 100vh">
        <transition name="page-fade" mode="out-in">
          <keep-alive>
            <component :is="Component" :key="route.path" />
          </keep-alive>
        </transition>
      </div>
    </router-view>
  </AppShell>
</template>
