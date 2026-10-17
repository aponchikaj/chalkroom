import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { extract } from '../src/rag/extract';
import { makePdf } from './fixtures';

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

describe('extract limits', () => {
  it('refuses an Office file that inflates past the cap (zip bomb)', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', `<w:document><w:body>${'<w:p><w:r><w:t>a</w:t></w:r></w:p>'.repeat(1)}${' '.repeat(60 * 1024 * 1024)}</w:body></w:document>`);
    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    expect(buf.length).toBeLessThan(1024 * 1024);
    await expect(extract(buf, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).rejects.toThrow(/too large/);
  });

  it('reads unclosed paragraph tags in linear time', async () => {
    const { paragraphs } = await import('../src/rag/extract/xml');
    const xml = '<w:p>'.repeat(200_000);
    const t0 = Date.now();
    paragraphs(xml, 'w:p', 'w:t');
    expect(Date.now() - t0).toBeLessThan(500);
  });
});
