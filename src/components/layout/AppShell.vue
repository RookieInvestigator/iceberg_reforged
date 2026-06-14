<script setup lang="ts">
import { onMounted } from 'vue'

onMounted(() => {
  // Scroll management
  window.scrollTo(0, 0)
  if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'

  // Shield logic — cold start vs revisit
  const shield = document.getElementById('app-shield')
  if (!shield) return

  let shieldHidden = false
  function hideShield() {
    if (shieldHidden) return
    shieldHidden = true
    shield!.classList.add('hidden')
    setTimeout(() => shield?.remove(), 600)
  }

  const heroDone = (() => { try { return sessionStorage.getItem('iceberg_hero_done') === '1' } catch { return false } })()

  let hasHero = false
  function showShield() {
    shieldHidden = false
    shield!.classList.remove('hidden')
  }

  if (heroDone) {
    document.addEventListener('vue-ready', () => setTimeout(hideShield, 200), { once: true })
    setTimeout(hideShield, 2500)
  } else {
    document.addEventListener('hero-ready', () => {
      hasHero = true
      setTimeout(hideShield, 800)
      document.addEventListener('hero-exit', () => {
        showShield()
        setTimeout(hideShield, 800)
      }, { once: true })
    }, { once: true })
    document.addEventListener('vue-ready', () => {
      if (!hasHero) setTimeout(hideShield, 200)
    }, { once: true })
    setTimeout(() => { if (!hasHero) hideShield() }, 5000)
  }

  // Page transition: show shield on navigation
  let isFirstPage = !heroDone || !sessionStorage.getItem('iceberg_page_loaded')
  try { sessionStorage.setItem('iceberg_page_loaded', '1') } catch {}

  document.addEventListener('click', (e) => {
    if (isFirstPage) { isFirstPage = false; return }
    const a = (e.target as HTMLElement).closest('a')
    if (!a || !(a as HTMLAnchorElement).href) return
    try {
      const u = new URL((a as HTMLAnchorElement).href)
      if (u.origin !== location.origin) return
      if (u.pathname === location.pathname && !u.hash) return
    } catch { return }
    shield.classList.remove('hidden')
  })

  window.addEventListener('pageshow', () => {
    setTimeout(() => { if (!shield.classList.contains('hidden')) hideShield() }, 800)
  })
})
</script>

<template>
  <div id="app-shield" class="app-shield">
    <svg class="shield-icon" viewBox="0 0 175 171.19"><path d="M159.82,50.81,146,106.87l-25.11,23.6-15.45,40.72L46.88,138.64,35.41,101.19,18.76,86.55,13.1,50.81,0,43.15H21.25l35-22.21L66.46,28.6,100,0l53.57,43.15H175ZM56.25,30.87,37.5,43.15H52.74ZM100,10.47,62.5,43.15h56.25l-2.57-12.81L97.07,24.86Z" fill="currentColor"/></svg>
    <div class="shield-text">
      <div class="shield-title">中文兔子洞冰山图</div>
      <div class="shield-sub">Chinese Oddities Iceberg</div>
    </div>
    <div class="shield-dots"><i></i><i></i><i></i></div>
  </div>
  <slot />
</template>

<style>
.app-shield {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: #0a0e14; gap: 22px;
  transition: opacity 1s ease-out;
}
.app-shield.hidden { opacity: 0; pointer-events: none; }
.shield-icon {
  width: 56px; height: 56px; opacity: 0;
  color: white;
  animation: sh-fade-in 0.4s ease-out 0.05s forwards;
}
.shield-text { text-align: center; opacity: 0; animation: sh-fade-in 0.4s ease-out 0.1s forwards; }
.shield-title {
  font-size: 1.35rem; font-weight: 700; letter-spacing: 0.12em;
  color: rgba(255,255,255,0.7);
}
.shield-sub {
  font-size: 0.68rem; font-weight: 300; letter-spacing: 0.32em;
  text-transform: uppercase; color: rgba(255,255,255,0.22);
  margin-top: 5px;
}
.shield-dots { display: flex; gap: 6px; opacity: 0; animation: sh-fade-in 0.4s ease-out 0.15s forwards; }
.shield-dots i {
  display: block; width: 5px; height: 5px; border-radius: 50%;
  background: rgba(255,255,255,0.28);
  animation: shield-dot 1.2s ease-in-out infinite;
}
.shield-dots i:nth-child(2) { animation-delay: 0.15s; }
.shield-dots i:nth-child(3) { animation-delay: 0.3s; }
@keyframes sh-fade-in { to { opacity: 1 } }
@keyframes shield-dot {
  0%,100% { opacity: 0.18; transform: scale(0.75); }
  50% { opacity: 0.65; transform: scale(1); }
}
</style>
