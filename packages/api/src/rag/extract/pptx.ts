import JSZip from 'jszip';
import type { Page } from './index';
import { paragraphs } from './xml';
import { LIMITS, checkZip } from './limits';

export async function pptxPages(buf: Buffer): Promise<Page[]> {
  const zip = await JSZip.loadAsync(buf);
  checkZip(zip);
  const slides = Object.keys(zip.files)
    .map((name) => ({ name, n: Number(/^ppt\/slides\/slide(\d+)\.xml$/.exec(name)?.[1]) }))
    .filter((s) => s.n)
    .sort((a, b) => a.n - b.n);
  if (slides.length > LIMITS.slides) throw new Error(`too many slides (${slides.length}; the limit is ${LIMITS.slides})`);
  const pages: Page[] = [];
  for (const s of slides) {
    const lines = paragraphs(await zip.file(s.name)!.async('string'), 'a:p', 'a:t');
    if (lines.length) pages.push({ page: s.n, text: lines.join('\n'), heading: lines[0] });
  }
  return pages;
}
