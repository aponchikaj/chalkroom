// Markdown from the tutor: sanitised, with KaTeX math and citation chips. KaTeX loads only when
// a text first carries a '$' (plan 8.1): until then the formula shows as its plain source.
// AM: a chip [[res:<id>#p<page>]] names its source when the title is known (features/materials
// cache) and, pressed, asks the materials list on screen to show that source.
import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { openSource, useMaterials } from '../features/materials/store';
import '../features/materials/materials.css';

type Katex = typeof import('katex').default;
let katex: Katex | null = null;
let katexPending: Promise<Katex> | null = null;
/** KaTeX, loaded once on first need (the same chunk the board's formula shapes use). */
export function getKatex(): Promise<Katex> {
  if (!katexPending) {
    katexPending = import('katex').then((m) => (katex = m.default));
    // a failed chunk load (offline, a deploy in between) may be retried by the next formula
    katexPending.catch(() => { katexPending = null; });
  }
  return katexPending;
}

/** A formula: typeset when KaTeX is here, else its source as escaped text. */
const tex = (src: string, displayMode: boolean) => katex
  ? katex.renderToString(src, { displayMode, throwOnError: false })
  : `<span class="math-pending">${esc(displayMode ? `$$${src}$$` : `$${src}$`)}</span>`;

marked.setOptions({ gfm: true, breaks: true });

const CITE = /\[\[res:([\w.-]+)(?:#p(\d+))?\]\]/g;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function chip(id: string, page: string | undefined, titles: Record<string, string>): string {
  const title = titles[id];
  const name = title ? esc(title) : 'Class material';
  const label = `Open in materials: ${name}${page ? `, page ${page}` : ''}`;
  return `<button type="button" class="chip cite" data-res="${esc(id)}"${page ? ` data-page="${page}"` : ''} aria-label="${label}" title="${label}">`
    + `<span class="cite-title">${name}</span>${page ? `<span class="cite-page mono">p${page}</span>` : ''}</button>`;
}

export function renderMarkdown(md: string, titles: Record<string, string> = {}): string {
  // protect math and citations from the Markdown parser
  const stash: string[] = [];
  const keep = (html: string) => `\u0000${stash.push(html) - 1}\u0000`;
  let src = md
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, t) => keep(tex(t, true)))
    .replace(/(^|[^\\$])\$([^$\n]+?)\$/g, (_m, pre, t) => pre + keep(tex(t, false)))
    .replace(CITE, (_m, id, page) => keep(chip(id, page, titles)));
  src = marked.parse(src, { async: false }) as string;
  src = src.replace(/\u0000(\d+)\u0000/g, (_m, i) => stash[Number(i)]);
  return DOMPurify.sanitize(src, { ADD_ATTR: ['data-res', 'data-page'], ADD_TAGS: ['semantics', 'annotation'] });
}

const onCite = (e: MouseEvent<HTMLDivElement>) => {
  const b = (e.target as Element).closest?.('button.cite');
  const id = b?.getAttribute('data-res');
  if (!id) return;
  e.preventDefault();
  e.stopPropagation();
  const p = Number(b!.getAttribute('data-page'));
  openSource(id, Number.isFinite(p) && p > 0 ? p : null);
};

export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  const titles = useMaterials((s) => s.titles);
  const math = text.includes('$');
  const [ready, setReady] = useState(!!katex);
  useEffect(() => {
    if (!math || katex) return;
    let alive = true;
    getKatex().then(() => { if (alive) setReady(true); }, () => { /* the source stays as text */ });
    return () => { alive = false; };
  }, [math]);
  const html = useMemo(() => renderMarkdown(text, titles), [text, titles, ready]);
  return (
    <div
      className={`md ${className}`}
      onClick={onCite}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
