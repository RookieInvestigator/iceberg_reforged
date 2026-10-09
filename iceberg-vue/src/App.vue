<script setup>
import AppShell from './components/layout/AppShell.vue'

// 路由过渡完全结束（新页面已进入）后再通知 AppShell 隐藏加载遮罩，
// 避免遮罩提前消失、露出旧页面退出的中间态。
function onPageAfterEnter() {
  document.dispatchEvent(new CustomEvent('route-ready'))
}
</script>

<template>
  <AppShell>
    <router-view v-slot="{ Component, route }">
      <div style="min-height: 100vh">
        <transition name="page-fade" mode="out-in" @after-enter="onPageAfterEnter">
          <!-- 有界缓存：限制常驻页面数；古籍/3D/Home 每次进入重建（资源清理依赖卸载触发 / 避免 GPU 资源常驻）；
               深潜巡游同样排除（WebGL 上下文与常驻页面互斥）。
               v1（IndexView）已归档（2026-10-09，见 data/archive/legacy-v1-2026-10/），排除项随之移除 -->
          <keep-alive :max="3" :exclude="['AncientBookView', 'Iceberg3DView', 'HomeView', 'SubmarineDiveView']">
            <component :is="Component" :key="route.path" />
          </keep-alive>
        </transition>
      </div>
    </router-view>
  </AppShell>
</template>
