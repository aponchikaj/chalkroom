import JSZip from 'jszip';
import type { Page } from './index';
import { paragraphs } from './xml';
import { checkZip } from './limits';

export async function docxPages(buf: Buffer): Promise<Page[]> {
  const zip = await JSZip.loadAsync(buf);
  checkZip(zip);
  const doc = zip.file('word/document.xml');
  if (!doc) throw new Error('not a Word document (word/document.xml missing)');
  const text = paragraphs(await doc.async('string'), 'w:p', 'w:t').join('\n');
  return text ? [{ page: null, text, heading: '' }] : [];
}
