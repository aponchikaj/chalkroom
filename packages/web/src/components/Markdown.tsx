// Markdown from the tutor: sanitised, with KaTeX math and citation chips.
// AM: a chip [[res:<id>#p<page>]] names its source when the title is known (features/materials
// cache) and, pressed, asks the materials list on screen to show that source.
import { useMemo, type MouseEvent } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import katex from 'katex';
import { openSource, useMaterials } from '../features/materials/store';
import '../features/materials/materials.css';

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
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex) => keep(katex.renderToString(tex, { displayMode: true, throwOnError: false })))
    .replace(/(^|[^\\$])\$([^$\n]+?)\$/g, (_m, pre, tex) => pre + keep(katex.renderToString(tex, { throwOnError: false })))
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
  const html = useMemo(() => renderMarkdown(text, titles), [text, titles]);
  return (
    <div
      className={`md ${className}`}
      onClick={onCite}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
