<script setup lang="ts">
</script>

<template>
  <div class="notfound-page">
    <div class="notfound-card">
      <h1>404</h1>
      <p>你试图进入的页面不存在。</p>
      <router-link to="/">返回主界面</router-link>
    </div>
  </div>
</template>

<style scoped>
.notfound-page {
  position: fixed; inset: 0; background: #020408;
  display: flex; align-items: center; justify-content: center;
  font-family: system-ui, -apple-system, sans-serif;
}
.notfound-card { text-align: center; padding: 2rem; }
h1 { font-size: 6rem; font-weight: 900; color: #ffffff08; line-height: 1; margin: 0 0 1rem; }
p { color: #ffffff25; font-size: 0.9rem; margin-bottom: 2rem; }
a {
  display: inline-block; padding: 0.6rem 2rem;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 8px; color: #ffffff40; text-decoration: none;
  font-size: 0.8rem; transition: all 0.2s;
}
a:hover { background: rgba(255,255,255,0.05); color: #ffffff99; border-color: rgba(255,255,255,0.25); }
</style>
