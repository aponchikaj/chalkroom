import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import type { Page } from './index';

/** The readable article of a web page (no navigation, footers or scripts). */
export function htmlPages(html: string): Page[] {
  const { document } = parseHTML(html);
  const article = new Readability(document as unknown as ConstructorParameters<typeof Readability>[0]).parse();
  const text = (article?.textContent ?? document.body?.textContent ?? '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
  return text ? [{ page: null, text, heading: (article?.title ?? document.title ?? '').trim() }] : [];
}
