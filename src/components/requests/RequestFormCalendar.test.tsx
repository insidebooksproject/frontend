import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { format } from 'date-fns';
import { QueryWrapper } from '@/test/utils';
import { RequestForm } from './RequestForm';
import * as serverConfigApi from '@/lib/api/serverConfig';
import { ApiError } from '@/lib/api/client';

// RequestForm with the real calendar (RequestForm.test.tsx mocks it).
vi.mock('@/lib/api/requests');
vi.mock('@/lib/api/serverConfig');
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// 9:30 pm in Chicago (CST, UTC-6) on Thursday 2026-01-15: already the 16th in
// UTC, and in Tokyo.
vi.setSystemTime(new Date('2026-01-16T03:30:00Z'));

function day(label: string) {
  return page.getByRole('button', { name: new RegExp(`January ${label}, 2026`) });
}

async function renderForm() {
  await render(
    <QueryWrapper>
      <RequestForm jurisdiction="Texas" inmateId={12345} />
    </QueryWrapper>
  );
}

function clearCookies() {
  document.cookie.split(';').forEach((c) => {
    document.cookie = c
      .replace(/^ +/, '')
      .replace(/=.*/, '=;expires=' + new Date(0).toUTCString() + ';path=/');
  });
}

describe('RequestForm calendar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCookies();
  });

  it('disables days after today in Central time, though UTC is a day ahead', async () => {
    vi.mocked(serverConfigApi.getServerConfig).mockResolvedValue({
      timezone: 'America/Chicago',
    });
    await renderForm();

    await expect.poll(() => serverConfigApi.getServerConfig).toHaveBeenCalled();
    await expect.element(day('15th')).toBeEnabled();
    await expect.element(day('14th')).toBeEnabled();
    await expect.element(day('16th')).toBeDisabled();
    await expect.element(day('31st')).toBeDisabled();
    // Today is the Central date, and the calendar does not page past its month.
    await expect
      .element(page.getByRole('button', { name: /^Today, / }))
      .toHaveAccessibleName(/January 15th, 2026/);
    await expect.element(page.getByRole('button', { name: /next month/i })).toBeDisabled();
  });

  it('selects today, which stays selectable', async () => {
    vi.mocked(serverConfigApi.getServerConfig).mockResolvedValue({
      timezone: 'America/Chicago',
    });
    await renderForm();

    await day('15th').click();
    await expect.element(page.getByText('2026-01-15')).toBeInTheDocument();
    await expect.element(page.getByRole('button', { name: 'Fill', exact: true })).toBeEnabled();
  });

  it("follows the server's zone rather than a fixed one", async () => {
    vi.mocked(serverConfigApi.getServerConfig).mockResolvedValue({ timezone: 'Asia/Tokyo' });
    await renderForm();

    await expect.element(day('16th')).toBeEnabled();
    await expect.element(day('17th')).toBeDisabled();
  });

  it('uses Central time when the config request fails', async () => {
    vi.mocked(serverConfigApi.getServerConfig).mockRejectedValue(new ApiError(404, 'Not Found'));
    await renderForm();

    await expect.poll(() => serverConfigApi.getServerConfig).toHaveBeenCalled();
    await expect.element(day('15th')).toBeEnabled();
    await expect.element(day('16th')).toBeDisabled();
  });

  it('does not restore a remembered postmark date after today', async () => {
    vi.mocked(serverConfigApi.getServerConfig).mockResolvedValue({
      timezone: 'America/Chicago',
    });
    // Saved "today" (by the browser's clock, as the form checks) but for the
    // 16th, which is still tomorrow in Chicago.
    const savedOn = format(new Date(), 'yyyy-MM-dd');
    const future = new Date(2026, 0, 16).toISOString();
    document.cookie =
      'ibp_last_postmark_date=' + encodeURIComponent(`${future}|${savedOn}`) + ';path=/';

    await renderForm();

    await expect.element(page.getByRole('button', { name: /pick a date/i })).toBeInTheDocument();
  });

  it('restores a remembered postmark date of today', async () => {
    vi.mocked(serverConfigApi.getServerConfig).mockResolvedValue({
      timezone: 'America/Chicago',
    });
    const savedOn = format(new Date(), 'yyyy-MM-dd');
    const today = new Date(2026, 0, 15).toISOString();
    document.cookie =
      'ibp_last_postmark_date=' + encodeURIComponent(`${today}|${savedOn}`) + ';path=/';

    await renderForm();

    await expect.element(page.getByText('2026-01-15')).toBeInTheDocument();
  });
});
