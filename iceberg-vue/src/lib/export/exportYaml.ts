/**
 * exportYaml —— 当前可见词条导出 YAML（数据快照，非布局）。
 * 手写极简 dumper（只处理 string/number/boolean/数组/扁平对象），零依赖；
 * 标量一律 JSON 引号风格（合法 YAML），多行/特殊字符安全。
 */

export interface YamlEntry {
  id: string
  title: string
  tier: string
  category: string
  tags: string[]
  desc: string
  link: string
}

function scalar(v: unknown): string {
  if (v == null) return "''";
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(String(v));
}

/** 词条数组 → YAML 文本（- id/title/tier/category/tags/desc/link）。 */
export function dumpEntriesYaml(entries: YamlEntry[]): string {
  const out: string[] = ['# 冰山图词条快照（可见集合，字段见下）'];
  for (const e of entries) {
    out.push(`- id: ${scalar(e.id)}`);
    out.push(`  title: ${scalar(e.title)}`);
    out.push(`  tier: ${scalar(e.tier)}`);
    out.push(`  category: ${scalar(e.category)}`);
    if (e.tags.length) {
      out.push('  tags:');
      for (const t of e.tags) out.push(`    - ${scalar(t)}`);
    } else {
      out.push('  tags: []');
    }
    out.push(`  desc: ${scalar(e.desc)}`);
    out.push(`  link: ${scalar(e.link)}`);
  }
  out.push('');
  return out.join('\n');
}

/** RenderItem 子集（调用方直接传过滤后的 RenderItem[]，无需 getter）。 */
export interface YamlSource {
  id: string
  title: string
  tier: string
  category: string
  tags: string[]
  desc: string
  link: string
}

/** 可见词条 → YamlEntry（字段直取）。 */
export function toYamlEntries(items: YamlSource[]): YamlEntry[] {
  return items.map((it) => ({
    id: it.id,
    title: it.title,
    tier: it.tier,
    category: it.category,
    tags: [...it.tags],
    desc: it.desc,
    link: it.link,
  }));
}
