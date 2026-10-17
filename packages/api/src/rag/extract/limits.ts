// Caps that keep one upload from exhausting the API's memory or CPU. Checked before inflating
// or parsing: a 50 MB zip can inflate to tens of GB, a PDF can have thousands of pages.
import type JSZip from 'jszip';

export const LIMITS = {
  /** total uncompressed bytes of an Office file's entries */
  officeBytes: 50 * 1024 * 1024,
  pdfPages: 500,
  slides: 500,
  /** characters of text per source, after extraction */
  textChars: 5_000_000,
} as const;

/** Throws when the zip's entries would inflate past the cap (sizes from the central directory). */
export function checkZip(zip: JSZip) {
  let total = 0;
  for (const f of Object.values(zip.files)) total += (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
  if (total > LIMITS.officeBytes) throw new Error(`the file is too large once unpacked (${Math.round(total / 1048576)} MB; the limit is 50 MB)`);
}
