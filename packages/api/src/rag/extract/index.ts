// Text per page from an upload or a fetched page. Each extractor returns pages in reading order;
// `page` is the PDF page or slide number, null when the format has no pages.
import { pdfPages } from './pdf';
import { pptxPages } from './pptx';
import { docxPages } from './docx';
import { htmlPages } from './html';

export interface Page { page: number | null; text: string; heading: string }

export async function extract(buf: Buffer, mime: string): Promise<Page[]> {
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
