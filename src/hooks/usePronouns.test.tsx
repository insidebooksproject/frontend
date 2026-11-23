import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useClearPronouns, useSetPronouns } from './usePronouns';
import * as api from '@/lib/api';

vi.mock('@/lib/api', () => ({
  setPronouns: vi.fn(),
  clearPronouns: vi.fn(),
  recordLookup: vi.fn(),
}));

function SetTest() {
  const mutation = useSetPronouns('Texas', 12345);
  return (
    <div>
      <button onClick={() => mutation.mutate({ pronouns: 'she/her', set_by: 'QZ' })}>Set</button>
      {mutation.isSuccess && <div>Success</div>}
    </div>
  );
}

function ClearTest() {
  const mutation = useClearPronouns('Texas', 12345);
  return (
    <div>
      <button onClick={() => mutation.mutate({ set_by: 'QZ' })}>Clear</button>
      {mutation.isSuccess && <div>Success</div>}
    </div>
  );
}

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { Wrapper, invalidateSpy };
}

describe('usePronouns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets pronouns and refreshes the read-only inmate query', async () => {
    vi.mocked(api.setPronouns).mockResolvedValue({
      pronouns: 'she/her',
      set_by: 'QZ',
      set_at: '2026-11-23T10:00:00+00:00',
    });
    const { Wrapper, invalidateSpy } = setup();
    await render(<SetTest />, { wrapper: Wrapper });

    await page.getByRole('button', { name: 'Set' }).click();
    await expect.element(page.getByText('Success')).toBeInTheDocument();

    expect(api.setPronouns).toHaveBeenCalledWith('Texas', 12345, {
      pronouns: 'she/her',
      set_by: 'QZ',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inmates', 'Texas', 12345] });
    expect(api.recordLookup).not.toHaveBeenCalled();
  });

  it('clears pronouns and refreshes the read-only inmate query', async () => {
    vi.mocked(api.clearPronouns).mockResolvedValue(undefined);
    const { Wrapper, invalidateSpy } = setup();
    await render(<ClearTest />, { wrapper: Wrapper });

    await page.getByRole('button', { name: 'Clear' }).click();
    await expect.element(page.getByText('Success')).toBeInTheDocument();

    expect(api.clearPronouns).toHaveBeenCalledWith('Texas', 12345, { set_by: 'QZ' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inmates', 'Texas', 12345] });
    expect(api.recordLookup).not.toHaveBeenCalled();
  });
});
