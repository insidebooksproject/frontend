import type { Book, BookSuggestion, UpcLookup, UpcBook } from '@/types';
import { ApiError, apiGet } from './client';

/** Look up a book by ISBN. 422 "Not a valid ISBN.", 404 "Book not found." */
export async function getBook(isbn: string): Promise<Book> {
  return apiGet<Book>(`/books/${encodeURIComponent(isbn)}`);
}

/**
 * Look up a book by the UPC code on its cover (the UPC plus any add-on). The
 * backend's two 404s are answers, not errors: `no_isbn` (IBP knows no ISBN
 * for the code) and `no_book` (it knows the ISBN, but no title for it). 422
 * for a code that isn't a UPC.
 */
export async function getBookByUpc(code: string): Promise<UpcLookup> {
  try {
    const book = await apiGet<UpcBook>(`/books/upc/${encodeURIComponent(code)}`);
    return { status: 'found', book };
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
    const body = error.body as { reason?: string; isbn?: string } | undefined;
    if (body?.reason === 'no_book' && body.isbn) return { status: 'no_book', isbn: body.isbn };
    return { status: 'no_isbn' };
  }
}

/**
 * A better spelling of a title and author typed by hand, or null when the
 * server has no confident one (it answers null for any failure of its own).
 * Null too for a 404 (an older backend without the route) and a 422 (text
 * outside the portal's 3 to 100 characters): neither will change on asking
 * again. Other failures (the network) are thrown.
 */
export async function getBookSuggestion(
  title: string,
  author: string
): Promise<BookSuggestion | null> {
  const query = new URLSearchParams({ title, author });
  try {
    const answer = await apiGet<{ suggestion: BookSuggestion | null }>(
      `/book-suggestions?${query}`
    );
    return answer?.suggestion ?? null;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 422)) return null;
    throw error;
  }
}
