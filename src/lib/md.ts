// 极简 Markdown → HTML 渲染器（支持标题、段落、列表、粗斜体、链接、行内代码）
export function renderMd(src: string): string {
  const lines = src.split('\n')
  const out: string[] = []
  let inList = false

  function escape(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

  function inline(s: string): string {
    s = escape(s)
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>')
    s = s.replace(/`(.+?)`/g, '<code>$1</code>')
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
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

// 提取 h2/h3 标题生成目录
export function extractToc(src: string): { id: string; text: string; level: 2 | 3 }[] {
  const toc: { id: string; text: string; level: 2 | 3 }[] = []
  for (const line of src.split('\n')) {
    const h2 = line.match(/^## (.+)$/)
    if (h2) { toc.push({ id: h2[1].trim().toLowerCase().replace(/\s+/g, '-').replace(/[·・]/g, ''), text: h2[1].trim(), level: 2 }); continue }
    const h3 = line.match(/^### (.+)$/)
    if (h3) { toc.push({ id: h3[1].trim().toLowerCase().replace(/\s+/g, '-').replace(/[·・]/g, ''), text: h3[1].trim(), level: 3 }) }
  }
  return toc
}
