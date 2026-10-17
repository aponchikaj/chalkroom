// Tiny helpers for Office XML: we only need the text runs, so no XML parser.
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m);

/** Text of every `<tag>` element, per paragraph (`<para>`), runs joined. */
export function paragraphs(xml: string, para: string, run: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(new RegExp(`<${para}[\\s>][\\s\\S]*?</${para}>`, 'g'))) {
    const body = m[0];
    const text = [...body.matchAll(new RegExp(`<${run}(?:\\s[^>]*)?>([\\s\\S]*?)</${run}>`, 'g'))].map((m) => decode(m[1])).join('');
    if (text.trim()) out.push(text.trim());
  }
  return out;
}
