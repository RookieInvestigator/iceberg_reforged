<script setup>
import AppShell from './components/layout/AppShell.vue'
</script>

<template>
  <AppShell>
    <router-view v-slot="{ Component, route }">
      <div style="min-height: 100vh">
        <transition name="page-fade" mode="out-in">
          <!-- 有界缓存：限制常驻页面数；古籍/3D 每次进入重建（资源清理依赖卸载触发 / 避免 GPU 资源常驻） -->
          <keep-alive :max="4" :exclude="['AncientBookView', 'Iceberg3DView']">
            <component :is="Component" :key="route.path" />
          </keep-alive>
        </transition>
      </div>
    </router-view>
  </AppShell>
</template>
