/** A book from the ISBN lookup (`GET /books/{isbn}`). */
export interface Book {
  /** ISBN-13, normalized by the backend. */
  isbn: string;
  title: string;
  /** Null when no provider knew the author. */
  author: string | null;
  source: string;
  confidence: string | null;
}

/** A book found by its UPC (`GET /books/upc/{code}`); `isbn` is the ISBN it maps to. */
export interface UpcBook extends Book {
  /** Who mapped the UPC to the ISBN: `volunteer`. */
  upc_source: string;
}

/** The answer to a UPC lookup. */
export type UpcLookup =
  | { status: 'found'; book: UpcBook }
  /** IBP knows no ISBN for the code. */
  | { status: 'no_isbn' }
  /** The code maps to `isbn`, but no title is known for it. */
  | { status: 'no_book'; isbn: string };
