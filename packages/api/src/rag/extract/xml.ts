// Tiny helpers for Office XML: we only need the text runs, so no XML parser. Scans with indexOf,
// so the time is linear in the XML even with unclosed tags.
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m);

/** Bodies of every `<tag ...>…</tag>` in `xml`, in order; stops at the first unclosed one. */
function elements(xml: string, tag: string): string[] {
  const out: string[] = [];
  const open = `<${tag}`, close = `</${tag}>`;
  let at = 0;
  for (;;) {
    let start = xml.indexOf(open, at);
    // skip longer tag names that share the prefix (<w:pPr> for <w:p>)
    while (start >= 0 && !/[\s>/]/.test(xml[start + open.length] ?? '')) start = xml.indexOf(open, start + 1);
    if (start < 0) return out;
    const gt = xml.indexOf('>', start);
    if (gt < 0) return out;
    if (xml[gt - 1] === '/') { at = gt + 1; continue; } // self-closing: no text
    const end = xml.indexOf(close, gt);
    if (end < 0) return out;
    out.push(xml.slice(gt + 1, end));
    at = end + close.length;
  }
}

/** Text of every `<run>` element, per paragraph (`<para>`), runs joined. */
export function paragraphs(xml: string, para: string, run: string): string[] {
  const out: string[] = [];
  for (const body of elements(xml, para)) {
    const text = elements(body, run).map(decode).join('');
    if (text.trim()) out.push(text.trim());
  }
  return out;
}
