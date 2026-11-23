import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearPronouns, setPronouns } from './pronouns';

const mockFetch = vi.fn();
window.fetch = mockFetch;

describe('Pronouns API', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('sets pronouns with a PUT of the value and initials', async () => {
    const recorded = { pronouns: 'they/them', set_by: 'QZ', set_at: '2026-11-23T10:00:00+00:00' };
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(recorded), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await setPronouns('Texas', 12345, { pronouns: 'they/them', set_by: 'QZ' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/inmates/Texas/12345/pronouns'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ pronouns: 'they/them', set_by: 'QZ' }),
      })
    );
    expect(result).toEqual(recorded);
  });

  it('clears pronouns with a POST of the initials', async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 204 }));

    const result = await clearPronouns('Texas', 12345, { set_by: 'QZ' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/inmates/Texas/12345/pronouns/clear'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ set_by: 'QZ' }) })
    );
    expect(result).toBeUndefined();
  });

  it('rejects with the server error', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Inmate not found.' }), { status: 404 })
    );

    await expect(clearPronouns('Texas', 99999, { set_by: 'QZ' })).rejects.toThrow(
      'Inmate not found.'
    );
  });
});
