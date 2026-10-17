import { extractText, getDocumentProxy } from 'unpdf';
import type { Page } from './index';
import { LIMITS } from './limits';

export async function pdfPages(buf: Buffer): Promise<Page[]> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  if (pdf.numPages > LIMITS.pdfPages) throw new Error(`too many pages (${pdf.numPages}; the limit is ${LIMITS.pdfPages})`);
  const { text } = await extractText(pdf, { mergePages: false });
  return (text as string[]).map((t, i) => ({ page: i + 1, text: t.trim(), heading: '' }));
}
