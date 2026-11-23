import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { QueryWrapper } from '@/test/utils';
import { RequestForm } from './RequestForm';
import * as api from '@/lib/api/requests';
import * as serverConfigApi from '@/lib/api/serverConfig';

// Mock API calls
vi.mock('@/lib/api/requests');
vi.mock('@/lib/api/serverConfig');
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock UI components to avoid Radix/React conflicts in test
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// The real calendar disables days after today (RequestFormCalendar.test.tsx);
// "Select Future Date" stands in for a future date reaching the form's state
// some other way, which Fill and Toss must still refuse.
vi.mock('@/components/ui/calendar', () => ({
  Calendar: ({ onSelect }: { onSelect: (date: Date) => void }) => (
    <>
      <button onClick={() => onSelect(new Date('2024-12-25T12:00:00Z'))}>Select Date</button>
      <button onClick={() => onSelect(new Date(2024, 11, 26))}>Select Future Date</button>
    </>
  ),
}));

// Mock current date for consistent cookie testing
const MOCK_DATE = new Date('2024-12-25T12:00:00Z');
vi.setSystemTime(MOCK_DATE);

describe('RequestForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(serverConfigApi.getServerConfig).mockResolvedValue({
      timezone: 'America/Chicago',
    });
    // Clear cookies
    document.cookie.split(';').forEach((c) => {
      document.cookie = c
        .replace(/^ +/, '')
        .replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
    });
  });

  it('should render form elements', async () => {
    await render(
      <QueryWrapper>
        <RequestForm jurisdiction="Texas" inmateId={12345} />
      </QueryWrapper>
    );

    const title = page.getByText(/usps postmark date/i);
    await expect.element(title).toBeInTheDocument();

    const datePicker = page.getByRole('button', { name: /pick a date/i });
    await expect.element(datePicker).toBeInTheDocument();

    const fillButton = page.getByRole('button', { name: /fill/i });
    await expect.element(fillButton).toBeInTheDocument();
    await expect.element(fillButton).toBeDisabled();

    const tossButton = page.getByRole('button', { name: /toss/i });
    await expect.element(tossButton).toBeInTheDocument();
    await expect.element(tossButton).toBeDisabled();
  });

  it('should enable buttons when date is selected', async () => {
    await render(
      <QueryWrapper>
        <RequestForm jurisdiction="Texas" inmateId={12345} />
      </QueryWrapper>
    );

    // Open date picker
    const datePicker = page.getByRole('button', { name: /pick a date/i });
    await datePicker.click();

    // Select a date using the mock
    const selectDate = page.getByText('Select Date');
    await selectDate.click();

    const fillButton = page.getByRole('button', { name: /fill/i });
    await expect.element(fillButton).not.toBeDisabled();

    const tossButton = page.getByRole('button', { name: /toss/i });
    await expect.element(tossButton).not.toBeDisabled();
  });

  it('should pre-fill postmark date remembered earlier today', async () => {
    // Saved date with a save-day marker of "today" (system time is mocked)
    document.cookie =
      'ibp_last_postmark_date=' + encodeURIComponent('2024-12-24T18:00:00Z|2024-12-25') + ';path=/';

    await render(
      <QueryWrapper>
        <RequestForm jurisdiction="Texas" inmateId={12345} />
      </QueryWrapper>
    );

    const datePicker = page.getByText('2024-12-24');
    await expect.element(datePicker).toBeInTheDocument();
  });

  it('should not pre-fill postmark date remembered on a previous day', async () => {
    document.cookie =
      'ibp_last_postmark_date=' + encodeURIComponent('2024-12-20T18:00:00Z|2024-12-20') + ';path=/';

    await render(
      <QueryWrapper>
        <RequestForm jurisdiction="Texas" inmateId={12345} />
      </QueryWrapper>
    );

    const datePicker = page.getByRole('button', { name: /pick a date/i });
    await expect.element(datePicker).toBeInTheDocument();
  });

  it('should ignore a legacy cookie without a save-day marker', async () => {
    document.cookie = 'ibp_last_postmark_date=2024-12-24T18:00:00Z;path=/';

    await render(
      <QueryWrapper>
        <RequestForm jurisdiction="Texas" inmateId={12345} />
      </QueryWrapper>
    );

    const datePicker = page.getByRole('button', { name: /pick a date/i });
    await expect.element(datePicker).toBeInTheDocument();
  });

  it('should show validation warnings when filling', async () => {
    // Mock validation to return warnings
    vi.mocked(api.validateRequest).mockResolvedValue({
      entry_age: 'Inmate entered unit too recently',
      release: undefined,
      postmarkdate: undefined,
    });

    await render(
      <QueryWrapper>
        <RequestForm jurisdiction="Texas" inmateId={12345} />
      </QueryWrapper>
    );

    // Select date
    const datePicker = page.getByRole('button', { name: /pick a date/i });
    await datePicker.click();
    await page.getByText('Select Date').click();

    // Click Fill
    const fillButton = page.getByRole('button', { name: /fill/i });
    await fillButton.click();

    // Verify dialog appears
    const dialogTitle = page.getByText(/warnings detected/i);
    await expect.element(dialogTitle).toBeInTheDocument();

    const warningText = page.getByText(/inmate entered unit too recently/i);
    await expect.element(warningText).toBeInTheDocument();
  });

  it.each(['Fill', 'Toss'])('should refuse to %s with a future postmark date', async (name) => {
    await render(
      <QueryWrapper>
        <RequestForm jurisdiction="Texas" inmateId={12345} />
      </QueryWrapper>
    );

    await page.getByRole('button', { name: /pick a date/i }).click();
    await page.getByText('Select Future Date').click();
    await page.getByRole('button', { name, exact: true }).click();

    await expect
      .element(page.getByText("The postmark date can't be in the future."))
      .toBeInTheDocument();
    expect(api.validateRequest).not.toHaveBeenCalled();
    expect(api.createRequest).not.toHaveBeenCalled();
    // Nothing is remembered for the next request either.
    expect(document.cookie).not.toContain('ibp_last_postmark_date');

    // Picking a valid date clears the message.
    await page.getByText('Select Date', { exact: true }).click();
    await expect
      .element(page.getByText("The postmark date can't be in the future."))
      .not.toBeInTheDocument();
  });
});
