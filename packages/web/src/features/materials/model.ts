// AM: pure helpers for class materials: words for kinds and statuses, and the upload check.
import type { SourceFileType, SourceRow } from '@chalk/schema';
import type { StampTone } from '../../ui/Stamp';

export const MAX_BYTES = 52_428_800;

const BY_EXT: Record<string, SourceFileType> = {
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
};

export const ACCEPT = ['.pdf', '.pptx', '.docx', '.txt', '.md', ...new Set(Object.values(BY_EXT))].join(',');

const ext = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');

/** The upload's content type, or the reason it cannot be added. */
export function checkFile(f: { name: string; size: number; type: string }): { type: SourceFileType } | { error: string } {
  const type = BY_EXT[ext(f.name)] ?? (Object.values(BY_EXT) as string[]).find((t) => t === f.type) as SourceFileType | undefined;
  if (!type) return { error: `${f.name} is not a type the tutors can read. Use PDF, PowerPoint (.pptx), Word (.docx), text or Markdown.` };
  if (f.size === 0) return { error: `${f.name} is empty.` };
  if (f.size > MAX_BYTES) return { error: `${f.name} is ${(f.size / 1_048_576).toFixed(1)} MB. Files can be up to 50 MB.` };
  return { type };
}

/** File name without its extension, as the source title. */
export const titleOf = (name: string) => (name.replace(/\.[^.]+$/, '').trim() || name).slice(0, 200);

const FILE_KIND: Record<string, string> = {
  'application/pdf': 'PDF document',
  [BY_EXT.pptx]: 'Slides',
  [BY_EXT.docx]: 'Word document',
  'text/plain': 'Text file',
  'text/markdown': 'Markdown file',
};

export function kindWords(s: Pick<SourceRow, 'kind' | 'mime'>): string {
  switch (s.kind) {
    case 'file': return FILE_KIND[s.mime ?? ''] ?? 'Document';
    case 'url': return 'Web page';
    case 'syllabus': return 'Course syllabus';
    case 'notes': return 'Class notes';
    case 'faq': return 'Questions and answers';
    case 'transcript': return 'Class transcript';
  }
}

export function statusWords(s: Pick<SourceRow, 'kind' | 'status'>): { word: string; tone: StampTone } {
  switch (s.status) {
    case 'pending': return { word: 'Waiting', tone: 'pending' };
    case 'processing': return { word: s.kind === 'url' ? 'Reading the page' : 'Reading the document', tone: 'ink' };
    case 'ready': return { word: 'Ready', tone: 'ok' };
    case 'failed': return { word: 'Could not read it', tone: 'errata' };
  }
}

export const isBusy = (s: Pick<SourceRow, 'status'>) => s.status === 'pending' || s.status === 'processing';

/** "17 Oct" this year, "17 Oct 2025" otherwise. */
export function dateWords(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) });
}

/** http(s) links only, so a stored uri can never become a script link. */
export const safeUrl = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);
