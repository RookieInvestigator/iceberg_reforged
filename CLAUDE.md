# CLAUDE.md

## Project overview

"Chinese Oddities Iceberg" (中文兔子洞冰山图 / iceberg_reforged) — a community-curated iceberg chart cataloging Chinese internet oddities, urban legends, paranormal phenomena, true crime, conspiracy theories, and obscure knowledge. ~1343 entries across 8 tiers.

Built with **Astro + Vue 3**, deployed via GitHub Pages.

## Build & run

```bash
npm install
npm run dev      # Dev server
npm run build    # Production build → dist/
npm run preview  # Preview production build
```

### Data pipeline

```bash
# From repo root: rebuild iceberg.html → data.js + iceberg.json
cd .. && python build_data.py && cp iceberg-astro/public/data/iceberg.json iceberg-astro/public/data/
```

`build_data.py` (in parent directory) reads `iceberg.html` (SingleFile export from icebergthreads.com), cross-references `iceberg_database.csv`, resolves cross-references, preserves timestamps, and outputs:
- `public/data/iceberg.json` — consumed by Astro build
- `public/data/data.js` — legacy format

Dependencies: `beautifulsoup4`.

## Architecture

### Astro static generation

Three pages rendered at build time (`src/pages/`):
- **index.astro** — main page: HeroSection → Header → IcebergApp → 1343 static HTML items → Footer
- **minimal.astro** — no hero/animation, native scrollbar
- **on-this-day.astro** — historical events calendar

All 1343 items are pre-rendered as static `<span>` elements with `data-*` attributes for client-side filtering.

### Vue client islands (`client:only="vue"`)

Each page has its own set of Vue islands. They are **separate Vue apps** (not a single SPA):

| Component | Page(s) | Size | Purpose |
|---|---|---|---|
| **IcebergApp.vue** | main, minimal | 54 kB | Sidebar, filter chips, font size, i18n, event delegation glue |
| **ItemInteractivity.vue** | main, minimal | (bundled in IcebergApp) | Tooltip, hover/click delegation, filter execution, hash navigation |
| **ItemTooltip.vue** | main, minimal | (bundled) | Teleport + CSS transition tooltip |
| **FloatingButtons.vue** | main, minimal | (bundled) | Settings toggle, back-to-top, random entry |
| **SettingsPanel.vue** | main, minimal | (bundled) | Font size, float mode, filter mode, language, etc. |
| **AboutModal.vue** | main, minimal | (bundled in FooterModals) | Project info modal |
| **ContactModal.vue** | main, minimal | (bundled in FooterModals) | Contact info modal |
| **FooterModals.vue** | main, minimal | 4.8 kB | About/Contact buttons + modal state |
| **HeroSection.vue** | main | 4 kB | Full-screen hero with floating text |
| **Header.vue** | main | 3 kB | Staggered fade-in after hero-exit |
| **StaticHeader.vue** | minimal | 1.7 kB | i18n-aware header, no animation |
| **OnThisDayApp.vue** | on-this-day | 6 kB | Calendar + date nav + event list |

### State management

All shared state is in **Nano Stores** atoms (`src/lib/`):
- `filterStore.ts` — `activeCategories`, `activeTags`, `searchQuery`, `tagFilterMode`, `searchMode`, `hiddenCategories`, `hiddenTags`, `specialFilter`
- `settingsStore.ts` — `fontSize`, `floatMode`, `filterMode`, `detailMode`, `immersiveMode`, `showRandomBtn`, `showLinkEmoji`, `showDescEmoji` (all persisted to localStorage via `storedAtom`)
- `i18nStore.ts` — `lang` (persisted to localStorage)

### i18n

`src/lib/i18n/` — three flat-key dictionaries (zh/en/ja, ~80 keys each). Reactive via `useI18n()` composable reading `useStore(lang)`. Language persists via `storedAtom`.

Keys follow flat naming: `aboutLink`, `searchFullText`, `fontXs`, etc.

### Data format

```json
{
  "generatedAt": 1778415088,
  "categoryColors": { "都市传说": "#FFFFFF", ... },
  "tagMap": { "🌎": "母题", ... },
  "tierOrder": ["Tier 1", ...],
  "tiers": { "Tier 1": [...] },
  "defaultColor": "#FFFFFF"
}
```

Items: `id` (8-char hex), `title`, `category`, `tags` (names), `desc`, `link`, `emojis`, `categoryColor`, `modifiedAt`, `related`.

### Background system

`IcebergBackground.astro` + `bg.css` — pure CSS background: sky gradient, clouds, glow, iceberg silhouette, two water wave layers with SVG horizontal scroll, deep currents, mask. Scroll-pause via inline script. No `mix-blend-mode` (removed for GPU perf). All animated layers have `will-change: transform`.

### CSS

- `index.css` — item styles, tooltip, modal, filter chips, font presets, markers (via `::after`)
- `bg.css` — background animations
- `themes/dark.css` — CSS custom properties for theming
- Tailwind utility classes used inline

### Key design decisions

- **MPA not SPA** — each page is a separate Astro route. State shared via Nano Stores + localStorage, not a single Vue app
- **Static items + JS filter** — 1343 items rendered as static HTML, filtered client-side by toggling `display`/`.dimmed`
- **Event delegation** — one `mouseover`/`mouseleave`/`click` listener on `#items-container` for all 1343 items
- **Tooltip Teleport** — tooltip teleports to anchor element, CSS `opacity` transition with `nextTick`-delayed `.show` class
- **Search debounce** — 150ms debounce on `searchQuery.set()`, Fuse.js lazy init on first search
- **CSS containment** — `.iceberg-item { contain: layout style }` to isolate style/layout changes
- **Scroll-pause** — background animations paused during scroll, resumed 200ms after idle

### Deployment

GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`). On push to `master`, the `withastro/action` builds and `actions/deploy-pages` deploys to `https://RookieInvestigator.github.io/iceberg_reforged/`.

`astro.config.mjs` sets `base: '/iceberg_reforged'` and `site: 'https://RookieInvestigator.github.io'`.
