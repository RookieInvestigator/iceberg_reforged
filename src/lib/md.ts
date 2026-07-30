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
