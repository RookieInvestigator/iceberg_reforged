<script setup lang="ts">
/**
 * IcebergBg —— 冰山图页面背景（bgMode 分发）。
 * 'static'（冰山）/'black'：纯静态 SVG 场景（2026-08-19 取消全部动态，
 * 云层/波动/光晕动画已移除；black 模式由 IndexView 的 v-if 整体卸载）；
 * 'liquid'：挂 LiquidBg（WebGL 液态渐变 + 滚动沉海）。
 * bgMode 来自 settingsStore 的 storedAtom（legacy 'dynamic' 由设置面板归一为 static）。
 */
import { useStore } from '@nanostores/vue'
import { bgMode } from '../../lib/settingsStore'
import LiquidBg from './LiquidBg.vue'

const mode = useStore(bgMode)
</script>

<template>
  <div id="iceberg-bg" class="bg-root">
    <div class="bg-wrap" v-show="mode !== 'liquid'">
      <div class="bg-sky"></div>
      <div class="bg-glow"></div>
      <div class="bg-water-bg">
        <div class="bg-water-wave-bg">
          <svg viewBox="0 0 2880 160" preserveAspectRatio="none">
            <path d="M0,60 C240,40 480,40 720,60 C960,80 1200,80 1440,60 C1680,40 1920,40 2160,60 C2400,80 2640,80 2880,60 L2880,160 L0,160 Z" fill="#0C3866"/>
          </svg>
        </div>
        <div class="bg-water-body-bg"></div>
      </div>
      <div class="bg-iceberg">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" opacity=".88" aria-hidden="true" focusable="false">
          <defs>
            <!-- 仅使用矢量渐变与路径，不引入滤镜，保证长页面背景的合成性能。 -->
            <linearGradient id="iceberg-snow" x1="27" y1="9" x2="72" y2="30" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="#ffe1c7" stop-opacity=".9"/>
              <stop offset=".2" stop-color="#e8f4f8" stop-opacity=".86"/>
              <stop offset=".5" stop-color="#b9def1" stop-opacity=".82"/>
              <stop offset="1" stop-color="#669dcc" stop-opacity=".78"/>
            </linearGradient>
            <linearGradient id="iceberg-sunset-reflection" x1="20" y1="17" x2="53" y2="28" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="#ff8a42" stop-opacity=".24"/>
              <stop offset=".48" stop-color="#ffb36f" stop-opacity=".1"/>
              <stop offset="1" stop-color="#ffbd7b" stop-opacity="0"/>
            </linearGradient>
            <linearGradient id="iceberg-cold-face" x1="42" y1="10" x2="68" y2="31" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="#d8effc"/>
              <stop offset="1" stop-color="#487fb1"/>
            </linearGradient>
            <linearGradient id="iceberg-shadow-face" x1="58" y1="12" x2="84" y2="31" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="#7db5dc"/>
              <stop offset="1" stop-color="#285984"/>
            </linearGradient>
            <linearGradient id="iceberg-underwater" x1="50" y1="29" x2="50" y2="96" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="#3e96c2" stop-opacity=".8"/>
              <stop offset=".42" stop-color="#15537d" stop-opacity=".72"/>
              <stop offset="1" stop-color="#03162a" stop-opacity=".38"/>
            </linearGradient>
            <linearGradient id="iceberg-underwater-light" x1="18" y1="31" x2="62" y2="88" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="#65b8d6" stop-opacity=".52"/>
              <stop offset="1" stop-color="#0b375b" stop-opacity=".12"/>
            </linearGradient>
            <linearGradient id="iceberg-underwater-shadow" x1="56" y1="31" x2="86" y2="83" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="#1e6f9d" stop-opacity=".5"/>
              <stop offset="1" stop-color="#020e20" stop-opacity=".2"/>
            </linearGradient>
          </defs>

          <!-- 连续底形消除多边形接缝；水面固定在 y=30，与既有波浪层精确衔接。 -->
          <path d="M8 30 15 26 22 23 29 16 35 18 43 10 49 7 56 13 62 11 69 19 77 21 84 27 92 30 95 44 91 59 83 72 73 82 61 91 50 96 37 89 25 80 15 68 8 51Z" fill="url(#iceberg-underwater)" style="--fc:#3e96c2"/>

          <!-- 水上：非对称双峰与错落山脊，避免旧版规则三角形观感。
               水面线（y≈30）为微弱倾斜折线（±0.2 打破平齐、几乎水平）：
               8,30 16,29.8 24,30.2 31,30 36,30.2 41,30 46,29.8 51,30 54,30.2 58,30
               62,29.8 67,30 67.5,30.2 68,30 76,29.8 84,30.2 92,30 ——
               水上底边与水下顶边共享同一组折点，无水平边、无接缝。 -->
          <path d="M8 30 15 26 22 23 29 16 35 18 43 10 49 7 56 13 62 11 69 19 77 21 84 27 92 30 84 30.2 76 29.8 68 30 67.5 30.2 67 30 62 29.8 58 30 54 30.2 51 30 46 29.8 41 30 36 30.2 31 30 24 30.2 16 29.8Z" fill="url(#iceberg-snow)" style="--fc:#b9def1"/>
          <path d="M15 26 22 23 29 16 35 18 30 24 41 30 36 30.2 31 30 24 30.2 16 29.8 8 30Z" fill="#d9effb" fill-opacity=".66" style="--fc:#d9effb"/>
          <path d="M29 16 35 18 43 10 49 7 46 18 41 30 30 24Z" fill="#edf9ff" fill-opacity=".78" style="--fc:#edf9ff"/>
          <path d="M8 30 15 26 22 23 29 16 35 18 30 24 41 30 36 30.2 31 30 24 30.2 16 29.8Z" fill="url(#iceberg-sunset-reflection)" style="--fc:#ffb36f"/>
          <path d="M49 7 56 13 54 21 46 18Z" fill="url(#iceberg-cold-face)" fill-opacity=".84" style="--fc:#8fc1e3"/>
          <path d="M43 10 46 18 41 30 54 21 58 30 62 29.8 67 30 62 11 56 13 49 7Z" fill="#8fc1e3" fill-opacity=".54" style="--fc:#8fc1e3"/>
          <path d="M62 11 69 19 67 30 62 29.8 58 30 54 21Z" fill="url(#iceberg-shadow-face)" fill-opacity=".82" style="--fc:#5d91bc"/>
          <path d="M69 19 77 21 72 26 67 30Z" fill="#5d91bc" fill-opacity=".82" style="--fc:#5d91bc"/>
          <path d="M77 21 84 27 92 30 84 30.2 76 29.8 68 30 67.5 30.2 67 30 72 26Z" fill="#35698f" fill-opacity=".78" style="--fc:#35698f"/>
          <path d="M35 18 43 12 46 18 41 30 30 24Z" fill="#b7daee" fill-opacity=".7" style="--fc:#b7daee"/>
          <path d="M46 18 54 21 58 30 54 30.2 51 30 46 29.8 41 30Z" fill="#71a8cf" fill-opacity=".7" style="--fc:#71a8cf"/>

          <!-- 前景凸脊：从主峰左前方骑出轮廓线的亮面，形成朝屏幕的层次。 -->
          <path d="M43 10 40 15 36 21 41 26 46 18Z" fill="#f2faff" fill-opacity=".85" style="--fc:#f2faff"/>
          <!-- 橙色日落反光：薄三角沿凸脊受光边（43,10→40,15）与雪顶左轮廓边（43,10→49,7），顶点严格落在边上 -->
          <path d="M43 10 40 15 41 12Z" fill="#ffa45c" fill-opacity=".32" style="--fc:#ffa45c"/>
          <path d="M43 10 49 7 45 9Z" fill="#ffb36f" fill-opacity=".25" style="--fc:#ffb36f"/>

          <!-- 水下：上宽下收的偏心体量与长切面，形成真实的沉重感和纵深。顶边共享水面折线 -->
          <path d="M8 30 16 29.8 24 30.2 31 30 40 42 27 55 15 68 8 51Z" fill="url(#iceberg-underwater-light)" style="--fc:#65b8d6"/>
          <path d="M31 30 36 30.2 41 30 46 29.8 51 30 40 42 27 55 39 68 25 80 15 68Z" fill="#287ca6" fill-opacity=".46" style="--fc:#287ca6"/>
          <path d="M51 30 54 30.2 58 30 62 29.8 67 30 67.5 30.2 68 30 61 45 40 42Z" fill="#1e6c98" fill-opacity=".52" style="--fc:#1e6c98"/>
          <path d="M40 42 61 45 53 60 39 68 27 55Z" fill="#165b86" fill-opacity=".48" style="--fc:#165b86"/>
          <path d="M68 30 76 29.8 84 30.2 92 30 95 44 79 49 61 45Z" fill="url(#iceberg-underwater-shadow)" style="--fc:#1e6f9d"/>
          <path d="M61 45 79 49 70 64 53 60Z" fill="#0b456e" fill-opacity=".48" style="--fc:#0b456e"/>
          <path d="M79 49 95 44 91 59 83 72 70 64Z" fill="#082e52" fill-opacity=".48" style="--fc:#082e52"/>
          <path d="M39 68 53 60 59 76 50 96 37 89 25 80Z" fill="#0b3e66" fill-opacity=".42" style="--fc:#0b3e66"/>
          <path d="M53 60 70 64 73 82 61 91 50 96 59 76Z" fill="#072b4d" fill-opacity=".43" style="--fc:#072b4d"/>
          <path d="M70 64 83 72 73 82 59 76Z" fill="#041d38" fill-opacity=".42" style="--fc:#041d38"/>
        </svg>
      </div>
      <div class="bg-water">
        <div class="bg-water-wave">
          <svg viewBox="0 0 2880 160" preserveAspectRatio="none">
            <path d="M0,50 C240,20 480,20 720,50 C960,80 1200,80 1440,50 C1680,20 1920,20 2160,50 C2400,80 2640,80 2880,50 L2880,160 L0,160 Z" fill="#0a5a99"/>
          </svg>
        </div>
        <div class="bg-water-body"></div>
      </div>
      <div class="bg-mask"></div>
    </div>

    <!-- 液态模式：独立背景组件（fixed 铺满视口 + 滚动沉海），见 LiquidBg.vue -->
    <LiquidBg v-if="mode === 'liquid'" />
    <div class="bg-top-glow" v-show="mode !== 'liquid'"></div>
  </div>
</template>

<style scoped>
/* 填充面同色描边：覆盖半透明填充在共享边上的抗锯齿混合线（"缝隙"观感）。
   冰山 svg 的直接子 path 均为填充面（defs 不匹配；冰裂脊线已删除）。 */
.bg-iceberg svg > path {
  stroke: var(--fc, currentColor);
  stroke-opacity: 1;
  stroke-width: 0.75;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}
</style>
