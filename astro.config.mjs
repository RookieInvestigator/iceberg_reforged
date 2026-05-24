import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  integrations: [vue(), tailwind()],
  output: 'static',
  site: 'https://walonpratibha938.github.io',
  base: '/iceberg_reforged',
});
