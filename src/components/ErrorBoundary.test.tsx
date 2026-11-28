import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { ErrorBoundary } from './ErrorBoundary';
import { resetErrorReporting } from '@/lib/errorReporting';

// Component that throws an error
function Bomb() {
  throw new Error('Boom!');
  return null;
}

describe('ErrorBoundary', () => {
  it('should catch errors and display fallback UI', async () => {
    // Prevent console.error from cluttering output
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    const title = page.getByText(/something went wrong/i);
    await expect.element(title).toBeInTheDocument();

    const tryAgainButton = page.getByRole('button', { name: /try again/i });
    await expect.element(tryAgainButton).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('reports the error it caught to the backend', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const realFetch = window.fetch;
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    window.fetch = fetchSpy;
    resetErrorReporting();
    try {
      await render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      );
      await expect.element(page.getByText(/something went wrong/i)).toBeInTheDocument();

      const reports = fetchSpy.mock.calls.filter(([url]) => url === '/api/client-errors');
      expect(reports).toHaveLength(1);
      const body = JSON.parse(reports[0][1].body);
      expect(body).toMatchObject({
        app: 'frontend',
        level: 'ERROR',
        logger: 'ErrorBoundary',
        msg: 'Error: Boom!',
      });
      expect(body.exc).toContain('Boom!');
      expect(body.data.componentStack).toContain('Bomb');
    } finally {
      window.fetch = realFetch;
      consoleSpy.mockRestore();
    }
  });

  it('should render children when no error occurs', async () => {
    await render(
      <ErrorBoundary>
        <div>Safe Content</div>
      </ErrorBoundary>
    );

    const content = page.getByText('Safe Content');
    await expect.element(content).toBeInTheDocument();
  });
});
