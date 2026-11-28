import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError } from './api/client';
import {
  installErrorReporting,
  reportError,
  reportQueryError,
  resetErrorReporting,
  shouldReportQueryError,
  REPEAT_INTERVAL_MS,
} from './errorReporting';
import { createQueryClient } from './queryClient';

const fetchSpy = vi.fn();

function sentBodies(): Record<string, unknown>[] {
  return fetchSpy.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
}

describe('errorReporting', () => {
  const realFetch = window.fetch;

  beforeEach(() => {
    resetErrorReporting();
    fetchSpy.mockReset();
    fetchSpy.mockResolvedValue(new Response(null, { status: 204 }));
    window.fetch = fetchSpy;
  });

  afterEach(() => {
    window.fetch = realFetch;
    vi.useRealTimers();
  });

  it('posts one event in the shared format with keepalive', () => {
    reportError({ logger: 'test', msg: 'Error: boom', exc: 'Error: boom\n at f', data: { a: 1 } });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/client-errors');
    expect(init).toMatchObject({ method: 'POST', keepalive: true });
    const body = sentBodies()[0];
    expect(body).toEqual({
      level: 'ERROR',
      app: 'frontend',
      version: 'dev',
      logger: 'test',
      msg: 'Error: boom',
      exc: 'Error: boom\n at f',
      data: { a: 1, url: window.location.pathname },
    });
    expect(body).not.toHaveProperty('ts');
    expect(body).not.toHaveProperty('host');
  });

  it('sends the page path without the query string', () => {
    const before = window.location.href;
    window.history.replaceState(null, '', '/search?query=jane+doe#x');
    try {
      reportError({ logger: 'test', msg: 'm' });
    } finally {
      window.history.replaceState(null, '', before);
    }
    expect((sentBodies()[0].data as { url: string }).url).toBe('/search');
  });

  it('sends the same message at most once a minute', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-28T10:00:00Z'));
    reportError({ logger: 'a', msg: 'same' });
    reportError({ logger: 'b', msg: 'same' });
    reportError({ logger: 'a', msg: 'other' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    vi.setSystemTime(Date.now() + REPEAT_INTERVAL_MS - 1);
    reportError({ logger: 'a', msg: 'same' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    vi.setSystemTime(Date.now() + 1);
    reportError({ logger: 'a', msg: 'same' });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('never throws when the report fails', async () => {
    fetchSpy.mockImplementation(() => {
      throw new TypeError('NetworkError');
    });
    expect(() => reportError({ logger: 't', msg: 'sync throw' })).not.toThrow();

    fetchSpy.mockRejectedValue(new TypeError('NetworkError'));
    expect(() => reportError({ logger: 't', msg: 'rejects' })).not.toThrow();

    fetchSpy.mockReturnValue(undefined);
    expect(() => reportError({ logger: 't', msg: 'no promise' })).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('keeps the body under the 16 KiB limit', () => {
    reportError({ logger: 't', msg: 'x'.repeat(50_000), exc: 'y'.repeat(50_000) });
    const [, init] = fetchSpy.mock.calls[0];
    const size = new TextEncoder().encode((init as RequestInit).body as string).length;
    expect(size).toBeLessThan(16 * 1024);
  });

  describe('React Query errors', () => {
    it('reports 5xx answers and parse failures only', () => {
      expect(shouldReportQueryError(new ApiError(500, 'Internal Server Error'))).toBe(true);
      expect(shouldReportQueryError(new ApiError(503, 'Database unavailable'))).toBe(true);
      expect(shouldReportQueryError(new SyntaxError('JSON.parse: unexpected character'))).toBe(
        true
      );
      expect(shouldReportQueryError(new ApiError(404, 'Not Found'))).toBe(false);
      expect(shouldReportQueryError(new ApiError(422, '[]'))).toBe(false);
      expect(shouldReportQueryError(new TypeError('NetworkError when attempting to fetch'))).toBe(
        false
      );
    });

    it('sends the status with a 5xx', () => {
      reportQueryError('mutation', new ApiError(500, 'Internal Server Error'));
      reportQueryError('query', new ApiError(404, 'Not Found'));
      expect(sentBodies()).toEqual([
        expect.objectContaining({
          logger: 'react-query.mutation',
          msg: 'ApiError: Internal Server Error',
          data: { status: 500, url: window.location.pathname },
        }),
      ]);
    });

    it('is wired into the app query client', async () => {
      const client = createQueryClient();
      await client
        .fetchQuery({
          queryKey: ['t500'],
          queryFn: () => Promise.reject(new ApiError(500, 'Internal Server Error')),
          retry: false,
        })
        .catch(() => {});
      await client
        .fetchQuery({
          queryKey: ['t404'],
          queryFn: () => Promise.reject(new ApiError(404, 'Not Found')),
          retry: false,
        })
        .catch(() => {});
      await client
        .getMutationCache()
        .build(client, {
          mutationFn: () => Promise.reject(new SyntaxError('bad json')),
        })
        .execute(undefined)
        .catch(() => {});
      expect(sentBodies().map((body) => body.logger)).toEqual([
        'react-query.query',
        'react-query.mutation',
      ]);
    });
  });

  describe('global handlers', () => {
    it('reports uncaught errors and unhandled rejections, and can be removed', () => {
      const target = new EventTarget() as unknown as Window;
      const uninstall = installErrorReporting(target);

      const error = new Error('uncaught');
      target.dispatchEvent(new ErrorEvent('error', { error, message: 'Uncaught Error: uncaught' }));
      const reason = new Error('rejected');
      const rejection = new Event('unhandledrejection') as PromiseRejectionEvent;
      Object.defineProperty(rejection, 'reason', { value: reason });
      target.dispatchEvent(rejection);
      // A cross-origin script error has nothing to report.
      target.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }));

      expect(sentBodies().map((body) => [body.logger, body.msg])).toEqual([
        ['window.onerror', 'Error: uncaught'],
        ['unhandledrejection', 'Error: rejected'],
      ]);

      uninstall();
      target.dispatchEvent(new ErrorEvent('error', { error: new Error('after') }));
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });
});
