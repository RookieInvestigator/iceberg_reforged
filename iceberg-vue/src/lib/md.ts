// YAML frontmatter 解析（供 FeaturesView / FeatureDetailView 共用，P1-43）
// 支持单行键值（含冒号的值保留整行剩余部分）与列表值（- 开头行）
export function parseFM(yaml: string): Record<string, any> {
  const fm: Record<string, any> = {}
  const lines = yaml.split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const sep = line.indexOf(':')
    if (sep === -1) { i++; continue }
    const key = line.slice(0, sep).trim()
    let val: any = line.slice(sep + 1).trim()
    if (val === '' || val === '[]') {
      const list: string[] = []
      while (i + 1 < lines.length && /^\s+-\s+/.test(lines[i + 1])) { i++; list.push(lines[i].replace(/^\s+-\s+/, '').replace(/^['"]|['"]$/g, '').trim()) }
      if (list.length > 0) val = list
    }
    fm[key] = val
    i++
  }
  return fm
}

// 极简 Markdown → HTML 渲染器（支持标题、段落、列表、粗斜体、链接、行内代码）
export function renderMd(src: string): string {
  const lines = src.split('\n')
  const out: string[] = []
  let inList = false

  function escape(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }

  function inline(s: string): string {
    s = escape(s)
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>')
    s = s.replace(/`(.+?)`/g, '<code>$1</code>')
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
      const safe = /^(https?:|\/|\.\/|\.\.\/|#)/i.test(url) ? url : '#'
      return '<a href="' + escape(safe) + '" target="_blank" rel="noopener">' + text + '</a>'
    })
    return s
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    if (raw.trim() === '') {
      if (inList) { out.push('</ul>'); inList = false }
      continue
    }
    let m = raw.match(/^### (.+)$/)
    if (m) { if (inList) { out.push('</ul>'); inList = false }; out.push(`<h3>${inline(m[1].trim())}</h3>`); continue }
    m = raw.match(/^## (.+)$/)
    if (m) { if (inList) { out.push('</ul>'); inList = false }; out.push(`<h2>${inline(m[1].trim())}</h2>`); continue }
    m = raw.match(/^# (.+)$/)
    if (m) { if (inList) { out.push('</ul>'); inList = false }; out.push(`<h1>${inline(m[1].trim())}</h1>`); continue }
    m = raw.match(/^- (.+)$/)
    if (m) { if (!inList) { out.push('<ul>'); inList = true }; out.push(`<li>${inline(m[1].trim())}</li>`); continue }
    if (inList) { out.push('</ul>'); inList = false }
    out.push(`<p>${inline(raw.trim())}</p>`)
  }
  if (inList) out.push('</ul>')
  return out.join('\n')
}
