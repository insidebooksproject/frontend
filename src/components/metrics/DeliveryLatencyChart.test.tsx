import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { createWrapper } from '@/test/utils';
import { deliveryLatencyMonths, jsonResponse } from '@/test/deliveryLatency';
import { DeliveryLatencySection } from './DeliveryLatencyChart';

const mockFetch = vi.fn();
window.fetch = mockFetch;

function respondWith(data: unknown[]) {
  mockFetch.mockImplementation(async () => jsonResponse({ data, filters_applied: {} }));
}

function requestedUrls(): string[] {
  return mockFetch.mock.calls.map((call) => String(call[0]));
}

describe('DeliveryLatencySection', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('shows the latest complete month and marks the incomplete one', async () => {
    respondWith(deliveryLatencyMonths);

    await render(<DeliveryLatencySection dateRange="12months" />, { wrapper: createWrapper() });

    await expect.element(page.getByText('Postmark to delivery')).toBeInTheDocument();
    await expect
      .element(page.getByTestId('delivery-latency-summary'))
      .toHaveTextContent(
        'Latest complete month, 2026-01: median 15 d (middle half 12 d to 19.5 d); 7 of 10 filled requests delivered.'
      );
    await expect.element(page.getByText('Median, latest box')).toBeInTheDocument();
    await expect
      .element(page.getByRole('button', { name: 'Latest box' }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect.element(page.getByText(/delivered to the unit's mailroom/)).toBeInTheDocument();
    await expect
      .poll(() => document.querySelectorAll('circle[data-complete="false"]').length)
      .toBe(1);
    expect(document.querySelectorAll('circle[data-complete="true"]').length).toBe(1);
    expect(requestedUrls()[0]).toContain('method=all');
    expect(requestedUrls()[0]).toContain('date_range=12months');
  });

  it('switches to the earliest box', async () => {
    respondWith(deliveryLatencyMonths);

    await render(<DeliveryLatencySection dateRange="12months" />, { wrapper: createWrapper() });
    await page.getByRole('button', { name: 'Earliest box' }).click();

    await expect
      .element(page.getByTestId('delivery-latency-summary'))
      .toHaveTextContent('median 14 d (middle half 11 d to 18 d)');
    await expect.element(page.getByText('Median, earliest box')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('switches the method and counts coverage among its own links', async () => {
    respondWith(deliveryLatencyMonths);

    await render(<DeliveryLatencySection dateRange="12months" />, { wrapper: createWrapper() });
    await expect.element(page.getByTestId('delivery-latency-summary')).toBeInTheDocument();
    await page.getByRole('button', { name: 'Bulk' }).click();

    await expect.poll(() => requestedUrls().some((url) => url.includes('method=bulk'))).toBe(true);
    await expect
      .element(page.getByTestId('delivery-latency-summary'))
      .toHaveTextContent('7 of 8 sent in bulk boxes delivered (10 filled in all)');
    await expect
      .element(page.getByRole('button', { name: 'Bulk' }))
      .toHaveAttribute('aria-pressed', 'true');
  });

  it('says when there is no shipment data yet', async () => {
    respondWith([
      { ...deliveryLatencyMonths[0], linked: 0, delivered: 0, returned: 0, excluded: 0 },
    ]);

    await render(<DeliveryLatencySection dateRange="12months" />, { wrapper: createWrapper() });

    await expect.element(page.getByText(/No shipment data yet/)).toBeInTheDocument();
  });

  it('says when no month is complete', async () => {
    respondWith([deliveryLatencyMonths[1]]);

    await render(<DeliveryLatencySection dateRange="12months" />, { wrapper: createWrapper() });

    await expect
      .element(page.getByText('No month has half its requests delivered yet.'))
      .toBeInTheDocument();
  });

  it('shows an error', async () => {
    mockFetch.mockImplementation(async () => jsonResponse({ detail: 'Database unavailable' }, 503));

    await render(<DeliveryLatencySection dateRange="12months" />, { wrapper: createWrapper() });

    await expect.element(page.getByText('Database unavailable')).toBeInTheDocument();
  });

  it('shows loading', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    await render(<DeliveryLatencySection dateRange="12months" />, { wrapper: createWrapper() });

    await expect.element(page.getByText('Loading chart...')).toBeInTheDocument();
  });
});
