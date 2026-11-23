// What a book's barcode number is: an ISBN, or the retail UPC some
// mass-market paperbacks carry instead. Ported from the Book Portal
// extension's scan.js (`upcValid`, `parseUpc`, `classifyScan`); ISBNs go
// through `normalizeIsbn`, which mirrors the backend.
import { normalizeIsbn } from './isbn';

export type BookBarcode =
  /** `isbn` is the ISBN-13 (an ISBN-10 converted, an 18-digit scan trimmed). */
  | { kind: 'isbn'; isbn: string }
  /**
   * `code` is what IBP looks the UPC up by: the 12-digit UPC-A plus its
   * add-on (`addon` is '' or its 2 or 5 digits), without a leading EAN 0.
   */
  | { kind: 'upc'; upc: string; addon: string; code: string };

function isbn13Valid(digits: string): boolean {
  return /^97[89]\d{10}$/.test(digits) && normalizeIsbn(digits) === digits;
}

/** Whether a 12-digit UPC-A's check digit is right (weights 3,1,3,1...). */
export function upcValid(digits: string): boolean {
  if (!/^\d{12}$/.test(digits)) return false;
  const total = [...digits].reduce((sum, d, i) => sum + Number(d) * (i % 2 ? 1 : 3), 0);
  return total % 10 === 0;
}

/**
 * A UPC-A, maybe sent as an EAN-13 (a leading 0), maybe with a 2- or 5-digit
 * add-on; null otherwise. ISBN-13s start 978/979, so this can't match one.
 */
export function parseUpc(digits: string): Extract<BookBarcode, { kind: 'upc' }> | null {
  for (const core of [digits.startsWith('0') ? digits.slice(1) : null, digits]) {
    if (core === null) continue;
    const addon = core.slice(12);
    const upc = core.slice(0, 12);
    if ([0, 2, 5].includes(addon.length) && upcValid(upc)) {
      return { kind: 'upc', upc, addon, code: upc + addon };
    }
  }
  return null;
}

/**
 * Classify a scanned or typed barcode number, or null if it's neither an
 * ISBN nor a UPC. `scanned` is true when it came as a scanner's burst: a
 * 12-digit number starting 978/979 typed by hand is an ISBN-13 missing a
 * digit, even if it happens to pass the UPC check.
 */
export function classifyBarcode(raw: string, { scanned = false } = {}): BookBarcode | null {
  const compact = raw.toUpperCase().replace(/[\s-]/g, '');
  if (!compact) return null;
  if (!scanned && /^97[89]\d{9}$/.test(compact)) return null;
  if (/^\d+$/.test(compact) && !isbn13Valid(compact.slice(0, 13))) {
    const upc = parseUpc(compact);
    if (upc) return upc;
  }
  const isbn = normalizeIsbn(raw);
  return isbn ? { kind: 'isbn', isbn } : null;
}

/** A UPC without its add-on: shared by many titles, so it names no one book. */
export function isBareUpc(code: BookBarcode | null): boolean {
  return code?.kind === 'upc' && code.addon === '';
}
