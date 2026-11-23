import { useCallback } from 'react';
import { isCancelledError, queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { getBook, getBookByUpc, getBookSuggestion } from '@/lib/api';
import type { Book, BookSuggestion, UpcLookup } from '@/types';
import { normalizeIsbn } from '@/lib/isbn';
import { cleanPortalText, isPortalLength } from '@/lib/portalText';

/**
 * The query key of a book lookup: by ISBN-13 when the ISBN is valid, so the
 * ISBN-10 and ISBN-13 scans of a book share one answer (and one invalidation).
 */
export function bookQueryKey(isbn: string) {
  return ['books', normalizeIsbn(isbn) ?? isbn.trim()] as const;
}

/**
 * A function looking up a book by ISBN, for the packing station's scans.
 * Answers are cached for the session's usual stale time, so rescanning the
 * same book doesn't ask the backend again; failures aren't retried (a 404 or
 * 422 won't change, and the packer can type the book in). A cancelled lookup
 * is asked again rather than failing.
 */
export function useLookupBook() {
  const queryClient = useQueryClient();

  return useCallback(
    async (isbn: string): Promise<Book> => {
      for (;;) {
        try {
          return await queryClient.fetchQuery({
            queryKey: bookQueryKey(isbn),
            queryFn: () => getBook(isbn),
            retry: false,
          });
        } catch (error) {
          // Cancelled because the answer changed (a title fixed for future
          // scans, which caches the fix): ask again, getting the fix.
          if (!isCancelledError(error)) throw error;
        }
      }
    },
    [queryClient]
  );
}

/** The query key of a UPC lookup, by the code (UPC plus any add-on). */
export function upcQueryKey(code: string) {
  return ['books', 'upc', code] as const;
}

/**
 * A function looking up a book by its UPC code. A book found is cached like
 * an ISBN lookup; a miss isn't, so a code saved meanwhile (here or at another
 * station) is found next time.
 */
export function useLookupUpc() {
  const queryClient = useQueryClient();

  return useCallback(
    async (code: string): Promise<UpcLookup> => {
      const queryKey = upcQueryKey(code);
      const result = await queryClient.fetchQuery({
        queryKey,
        queryFn: () => getBookByUpc(code),
        retry: false,
      });
      if (result.status !== 'found') queryClient.removeQueries({ queryKey, exact: true });
      return result;
    },
    [queryClient]
  );
}

/** How a typed title or author is compared: cleaned as saved, and case-folded. */
function foldText(text: string): string {
  return cleanPortalText(text).toLowerCase();
}

/**
 * The query key of a spelling suggestion: by the cleaned, case-folded title
 * and author, so retyping the same text (in any case) asks nothing new.
 */
export function bookSuggestionQueryKey(title: string, author: string) {
  return ['book-suggestions', foldText(title), foldText(author)] as const;
}

/** True when the portal would take both (3 to 100 characters each), as the route needs. */
export function canSuggestFor(title: string, author: string): boolean {
  return isPortalLength(title) && isPortalLength(author);
}

/**
 * A suggestion lookup. Answers keep for the session (the server caches them
 * for weeks too) and aren't retried: a fresh one can take 10 s or more, and
 * a failure just means no suggestion. A suggestion the portal wouldn't take
 * is no suggestion.
 */
function bookSuggestionOptions(title: string, author: string) {
  return queryOptions({
    queryKey: bookSuggestionQueryKey(title, author),
    queryFn: async (): Promise<BookSuggestion | null> => {
      const suggestion = await getBookSuggestion(cleanPortalText(title), cleanPortalText(author));
      if (!suggestion || !canSuggestFor(suggestion.title, suggestion.author)) return null;
      return {
        ...suggestion,
        title: cleanPortalText(suggestion.title),
        author: cleanPortalText(suggestion.author),
      };
    },
    retry: false,
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/**
 * The spelling suggestion for a typed title and author, while `enabled`.
 * `data` is null when there is none; a failed lookup is no suggestion either.
 */
export function useBookSuggestion(title: string, author: string, enabled: boolean) {
  return useQuery({
    ...bookSuggestionOptions(title, author),
    enabled: enabled && canSuggestFor(title, author),
  });
}

/**
 * A function getting the spelling suggestion for a title and author (one
 * already being looked up is waited for, not asked again). Rejects when the
 * lookup fails.
 */
export function useFetchBookSuggestion() {
  const queryClient = useQueryClient();

  return useCallback(
    (title: string, author: string): Promise<BookSuggestion | null> =>
      queryClient.fetchQuery(bookSuggestionOptions(title, author)),
    [queryClient]
  );
}
