import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addPackageItem, deletePackageItem, getPackageItems, updatePackageItem } from './items';
import { getPackage } from './packages';
import { getBook, getBookByUpc, getBookSuggestion } from './books';
import { ApiError } from './client';

const mockFetch = vi.fn();
window.fetch = mockFetch;

function jsonResponse(body: unknown, status = 200) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Package, item and book API', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('gets a package by its code as scanned, encoded', async () => {
    mockFetch.mockImplementation(async () => jsonResponse({ items: [] }));
    await getPackage('tex-1234567-2');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/requests\/tex-1234567-2$/),
      expect.objectContaining({ method: 'GET' })
    );

    await getPackage('a/b c');
    expect(mockFetch.mock.calls[1][0]).toMatch(/\/requests\/a%2Fb%20c$/);
  });

  it('turns a 409 for a tossed request into an ApiError', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ detail: 'Request was tossed, so it has no package.' }, 409)
    );
    const error = await getPackage('TEX-1-0').catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.message).toBe('Request was tossed, so it has no package.');
  });

  it('lists items', async () => {
    mockFetch.mockResolvedValue(jsonResponse([]));
    expect(await getPackageItems('TEX-1-0')).toEqual([]);
    expect(mockFetch.mock.calls[0][0]).toMatch(/\/requests\/TEX-1-0\/items$/);
  });

  it('posts a new item', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ id: 1, previously_sent: [] }, 201));
    const data = {
      isbn: '9780140449136',
      title: 'The Odyssey',
      author: 'Homer',
      source: 'isbn' as const,
    };
    await addPackageItem('TEX-1-0', data);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/requests\/TEX-1-0\/items$/),
      expect.objectContaining({ method: 'POST', body: JSON.stringify(data) })
    );
  });

  it('puts an item edit', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ id: 7 }));
    const data = {
      isbn: null,
      title: 'Dune',
      author: 'Frank Herbert',
      revision: 2,
      update_cache: false,
    };
    await updatePackageItem('TEX-1-0', 7, data);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/requests\/TEX-1-0\/items\/7$/),
      expect.objectContaining({ method: 'PUT', body: JSON.stringify(data) })
    );
  });

  it('deletes an item, confirming a registered one only when asked', async () => {
    mockFetch.mockImplementation(async () => new Response(null, { status: 204 }));
    await deletePackageItem('TEX-1-0', 7);
    await deletePackageItem('TEX-1-0', 8, { confirmRegistered: true });
    expect(mockFetch.mock.calls[0][0]).toMatch(/\/requests\/TEX-1-0\/items\/7$/);
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    expect(mockFetch.mock.calls[1][0]).toMatch(/\/items\/8\?confirm_registered=true$/);
  });

  it('looks up a book', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ detail: 'Book not found.' }, 404));
    const error = await getBook('978 0140449136').catch((e) => e);
    expect(mockFetch.mock.calls[0][0]).toMatch(/\/books\/978%200140449136$/);
    expect(error.status).toBe(404);
    expect(error.message).toBe('Book not found.');
  });

  describe('getBookByUpc', () => {
    const book = {
      isbn: '9780441172719',
      title: 'Dune',
      author: 'Frank Herbert',
      source: 'claude',
      confidence: 'high',
      upc_source: 'volunteer',
    };

    it('returns the book a UPC maps to', async () => {
      mockFetch.mockResolvedValue(jsonResponse(book));
      expect(await getBookByUpc('03600029145200799')).toEqual({ status: 'found', book });
      expect(mockFetch.mock.calls[0][0]).toMatch(/\/books\/upc\/03600029145200799$/);
    });

    it('reads a 404 with no ISBN known as an answer', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ detail: 'No ISBN known for this UPC.', reason: 'no_isbn' }, 404)
      );
      expect(await getBookByUpc('036000291452')).toEqual({ status: 'no_isbn' });
    });

    it('reads a 404 with an ISBN but no title as an answer', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ detail: 'Book not found.', reason: 'no_book', isbn: book.isbn }, 404)
      );
      expect(await getBookByUpc('03600029145200799')).toEqual({
        status: 'no_book',
        isbn: book.isbn,
      });
    });

    it('throws for an invalid code', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ detail: 'Not a valid UPC.' }, 422));
      const error = await getBookByUpc('123').catch((e) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error.status).toBe(422);
      expect(error.body).toEqual({ detail: 'Not a valid UPC.' });
    });
  });

  describe('getBookSuggestion', () => {
    const suggestion = {
      title: 'Moby-Dick',
      author: 'Herman Melville',
      confidence: 'high',
      notes: 'Misspelled title.',
    };

    it('asks with the title and author encoded, and returns the suggestion', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ suggestion }));
      expect(await getBookSuggestion('Moby Dik & co', 'Herman Melvile')).toEqual(suggestion);
      expect(mockFetch.mock.calls[0][0]).toMatch(
        /\/book-suggestions\?title=Moby\+Dik\+%26\+co&author=Herman\+Melvile$/
      );
      expect(mockFetch.mock.calls[0][1].method).toBe('GET');
    });

    it('returns null when there is none', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ suggestion: null }));
      expect(await getBookSuggestion('Moby-Dick', 'Herman Melville')).toBeNull();
    });

    it('reads a 404 (an older backend) and a 422 as no suggestion', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ detail: 'Not Found' }, 404));
      expect(await getBookSuggestion('Moby Dik', 'Herman Melvile')).toBeNull();
      mockFetch.mockResolvedValueOnce(jsonResponse({ detail: [] }, 422));
      expect(await getBookSuggestion('Mo', 'Herman Melvile')).toBeNull();
    });

    it('throws for a server error', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ detail: 'Oops' }, 500));
      const error = await getBookSuggestion('Moby Dik', 'Herman Melvile').catch((e) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error.status).toBe(500);
    });
  });
});
