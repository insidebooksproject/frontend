import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerConfig } from './serverConfig';

const mockFetch = vi.fn();
window.fetch = mockFetch;

describe('Server config API', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should fetch the server config', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ timezone: 'America/Chicago' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await getServerConfig();

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/server-config',
      expect.objectContaining({ method: 'GET' })
    );
    expect(result).toEqual({ timezone: 'America/Chicago' });
  });
});
