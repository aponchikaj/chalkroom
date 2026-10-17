import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { extract } from '../src/rag/extract';

/** A minimal valid PDF with one line of text per page. */
function makePdf(pages: string[]): Buffer {
  const objs: string[] = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((text, i) => {
    const stream = `BT /F1 12 Tf 72 720 Td (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`;
    objs[4 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`;
    objs[5 + i * 2] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let out = '%PDF-1.4\n';
  const offs: number[] = [];
  for (let i = 1; i < objs.length; i++) { offs[i] = out.length; out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n${offs.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

async function makeZip(files: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, body] of Object.entries(files)) zip.file(name, body);
  return zip.generateAsync({ type: 'nodebuffer' });
}

const PDF = 'application/pdf';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('extract', () => {
  it('reads a PDF page by page', async () => {
    const pages = await extract(makePdf(['Accounts hold data.', 'A PDA has no private key.', 'invoke_signed lets the program sign.']), PDF);
    expect(pages.map((p) => p.page)).toEqual([1, 2, 3]);
    expect(pages[1].text).toContain('A PDA has no private key.');
  });

  it('reads PPTX slides in order, one page per slide', async () => {
    const slide = (t: string[]) => `<p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree>${t.map((x) => `<p:sp><p:txBody><a:p><a:r><a:t>${x}</a:t></a:r></a:p></p:txBody></p:sp>`).join('')}</p:spTree></p:cSld></p:sld>`;
    const buf = await makeZip({ 'ppt/slides/slide2.xml': slide(['Bumps', 'Start at 255']), 'ppt/slides/slide1.xml': slide(['PDAs &amp; seeds']), 'ppt/slides/slide10.xml': slide(['Last']) });
    const pages = await extract(buf, PPTX);
    expect(pages).toEqual([
      { page: 1, text: 'PDAs & seeds', heading: 'PDAs & seeds' },
      { page: 2, text: 'Bumps\nStart at 255', heading: 'Bumps' },
      { page: 10, text: 'Last', heading: 'Last' },
    ]);
  });

  it('reads DOCX paragraphs', async () => {
    const p = (t: string) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
    const buf = await makeZip({ 'word/document.xml': `<w:document xmlns:w="w"><w:body>${p('Program Derived Addresses')}${p('They have no private key.')}<w:p><w:r><w:t xml:space="preserve">Split </w:t></w:r><w:r><w:t>run.</w:t></w:r></w:p></w:body></w:document>` });
    const pages = await extract(buf, DOCX);
    expect(pages).toEqual([{ page: null, text: 'Program Derived Addresses\nThey have no private key.\nSplit run.', heading: '' }]);
  });

  it('reads the article of a web page, not its navigation', async () => {
    const html = `<html><head><title>PDAs explained</title></head><body><nav>Home About Login</nav><article><h1>PDAs explained</h1>${'<p>A program derived address is derived from seeds and the program id, and no private key exists for it. </p>'.repeat(6)}</article><footer>Copyright</footer></body></html>`;
    const pages = await extract(Buffer.from(html), 'text/html');
    expect(pages[0].heading).toBe('PDAs explained');
    expect(pages[0].text).toContain('no private key exists');
    expect(pages[0].text).not.toContain('Login');
  });

  it('keeps plain text and Markdown as they are', async () => {
    expect(await extract(Buffer.from('# Notes\n\nSeeds and bumps.'), 'text/markdown')).toEqual([{ page: null, text: '# Notes\n\nSeeds and bumps.', heading: '' }]);
  });

  it('refuses other types', async () => {
    await expect(extract(Buffer.from('x'), 'image/png')).rejects.toThrow(/unsupported/);
  });
});
