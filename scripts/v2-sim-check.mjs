import fs from 'node:fs'
import path from 'node:path'

const SRC = path.resolve('src')

function sim(a, b) {
  const A = fs.readFileSync(path.join(SRC, a), 'utf8').split(/\r?\n/)
  const B = fs.readFileSync(path.join(SRC, b), 'utf8').split(/\r?\n/)
  const n = A.length, m = B.length
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = A[i - 1] === B[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  const lcs = dp[n][m]
  return { la: n, lb: m, lcs, pct: (2 * lcs / (n + m) * 100).toFixed(1) }
}

const pairs = [
  ['components/items/V2Interactivity.vue', 'components/items/ItemInteractivity.vue'],
  ['components/items/V2Tooltip.vue', 'components/items/ItemTooltip.vue'],
  ['components/items/V2Sheet.vue', 'components/items/MobileSheet.vue'],
  ['components/items/V2EntryCard.vue', 'components/items/EntryDetailCardNext.vue'],
  ['views/IndexNextView.vue', 'views/IndexView.vue'],
  ['components/iceberg/V2Header.vue', 'components/iceberg/Header.vue'],
  ['components/iceberg/V2Wall.vue', 'components/iceberg/TierNav.vue'],
  ['components/iceberg/V2FilterBar.vue', 'components/iceberg/IcebergApp.vue'],
  ['components/iceberg/V2Colophon.vue', 'components/layout/FooterSection.vue'],
  ['components/iceberg/V2TierChapter.vue', 'views/IndexView.vue'],
]

for (const [a, b] of pairs) {
  const r = sim(a, b)
  const nameA = a.split('/').pop()
  const nameB = b.split('/').pop()
  console.log(
    nameA.padEnd(26) + ' vs ' + nameB.padEnd(26) +
    String(r.la).padStart(5) + '/' + String(r.lb).padStart(5) +
    '   相同行 ' + String(r.lcs).padStart(4) +
    '   相似度 ' + r.pct + '%'
  )
}
