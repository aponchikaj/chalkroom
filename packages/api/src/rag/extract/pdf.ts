import { extractText, getDocumentProxy } from 'unpdf';
import type { Page } from './index';

export async function pdfPages(buf: Buffer): Promise<Page[]> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: false });
  return (text as string[]).map((t, i) => ({ page: i + 1, text: t.trim(), heading: '' }));
}
