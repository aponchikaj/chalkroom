// Text per page from an upload or a fetched page. Each extractor returns pages in reading order;
// `page` is the PDF page or slide number, null when the format has no pages.
import { pdfPages } from './pdf';
import { pptxPages } from './pptx';
import { docxPages } from './docx';
import { htmlPages } from './html';

export interface Page { page: number | null; text: string; heading: string }

import { LIMITS } from './limits';

export async function extract(buf: Buffer, mime: string): Promise<Page[]> {
  const pages = await extractPages(buf, mime);
  const chars = pages.reduce((n, p) => n + p.text.length, 0);
  if (chars > LIMITS.textChars) throw new Error(`the file has too much text (${chars} characters; the limit is ${LIMITS.textChars})`);
  return pages;
}

async function extractPages(buf: Buffer, mime: string): Promise<Page[]> {
  switch (mime) {
    case 'application/pdf': return pdfPages(buf);
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation': return pptxPages(buf);
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': return docxPages(buf);
    case 'text/html': return htmlPages(buf.toString('utf8'));
    case 'text/plain':
    case 'text/markdown': return [{ page: null, text: buf.toString('utf8').trim(), heading: '' }];
    default: throw new Error(`unsupported file type: ${mime}`);
  }
}
