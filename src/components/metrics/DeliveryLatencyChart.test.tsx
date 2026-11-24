import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { createWrapper } from '@/test/utils';
import { deliveryLatencyMonths, jsonResponse } from '@/test/deliveryLatency';
import { DeliveryLatencySection } from './DeliveryLatencyChart';

const mockFetch = vi.fn();
window.fetch = mockFetch;

function respondWith(data: unknown[]) {
  mockFetch.mockImplementation(async () =>
    jsonResponse({ data, settle_days: 75, filters_applied: {} })
  );
}

/** Move the mouse over the chart, ``fraction`` of the way across. */
async function hoverChart(fraction: number) {
  await expect.poll(() => document.querySelector('.recharts-wrapper')).toBeTruthy();
  const chart = document.querySelector('.recharts-wrapper')!;
  const box = chart.getBoundingClientRect();
  const init = {
    bubbles: true,
    clientX: box.left + box.width * fraction,
    clientY: box.top + box.height / 3,
  };
  for (const type of ['mouseenter', 'mouseover', 'mousemove']) {
    chart.dispatchEvent(new MouseEvent(type, init));
  }
}

function requestedUrls(): string[] {
  return mockFetch.mock.calls.map((call) => String(call[0]));
}

/** A month with 6 of 10 filled requests delivered, every one left out of the
 * latency for a bad postmark, and 4 in the mail. */
const noTimes = {
  month: '2026-03',
  filled: 10,
  linked: 10,
  delivered: 0,
  returned: 0,
  excluded: 6,
  earliest: null,
  latest: null,
  median_handling: null,
  median_waiting: null,
  provisional: false,
};

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
        'Latest settled month at least half delivered, 2026-01: median 15 d (middle half 12 d to 19.5 d); 7 of 10 filled requests delivered.'
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
    expect(
      document.querySelector('circle[aria-label="2026-02: under half delivered so far"]')
    ).not.toBeNull();
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

  it('says there is no shipment data yet when an open range lists no months', async () => {
    // With no start and nothing linked, the backend returns no months at all.
    respondWith([]);

    await render(<DeliveryLatencySection dateRange="all" />, { wrapper: createWrapper() });

    await expect
      .element(page.getByText('No shipment data yet for the selected filters.'))
      .toBeInTheDocument();
    expect(document.querySelector('.recharts-wrapper')).toBeNull();
  });

  it('says when no month is complete', async () => {
    respondWith([deliveryLatencyMonths[1]]);

    await render(<DeliveryLatencySection dateRange="12months" />, { wrapper: createWrapper() });

    await expect
      .element(page.getByText('No settled month has half its requests delivered yet.'))
      .toBeInTheDocument();
  });

  it('counts deliveries left out for a bad postmark as delivered', async () => {
    respondWith([
      {
        ...deliveryLatencyMonths[0],
        filled: 10,
        linked: 10,
        delivered: 4,
        returned: 0,
        excluded: 2,
      },
    ]);

    await render(<DeliveryLatencySection dateRange="12months" />, { wrapper: createWrapper() });

    // Only a complete month is summarized: 6 of 10 is not under half.
    await expect
      .element(page.getByTestId('delivery-latency-summary'))
      .toHaveTextContent('6 of 10 filled requests delivered');
    await expect
      .poll(() => document.querySelectorAll('circle[data-complete="true"]').length)
      .toBe(1);
    await hoverChart(0.5);
    await expect
      .element(page.getByText('Based on 4 deliveries; 2 left out for a bad postmark'))
      .toBeInTheDocument();
    await expect.element(page.getByText('4 in the mail')).toBeInTheDocument();
  });

  it('shows the counts of a month with no delivery times', async () => {
    respondWith([
      deliveryLatencyMonths[0],
      {
        month: '2026-02',
        filled: 8,
        linked: 5,
        delivered: 0,
        returned: 1,
        excluded: 0,
        earliest: null,
        latest: null,
        median_handling: null,
        median_waiting: null,
        provisional: false,
      },
    ]);

    await render(<DeliveryLatencySection dateRange="12months" />, { wrapper: createWrapper() });
    await expect.element(page.getByTestId('delivery-latency-summary')).toBeInTheDocument();
    await hoverChart(0.95);

    await expect.element(page.getByText('Postmarked 2026-02')).toBeInTheDocument();
    await expect.element(page.getByText('No delivery times yet')).toBeInTheDocument();
    await expect.element(page.getByText('0 of 8 filled requests delivered')).toBeInTheDocument();
    await expect.element(page.getByText('4 in the mail, 1 returned')).toBeInTheDocument();
  });

  it('summarizes a month half delivered even with no usable delivery times', async () => {
    respondWith([{ ...noTimes, month: '2026-03' }]);

    await render(<DeliveryLatencySection dateRange="12months" />, { wrapper: createWrapper() });

    await expect
      .element(page.getByTestId('delivery-latency-summary'))
      .toHaveTextContent(
        'Latest settled month at least half delivered, 2026-03: 6 of 10 filled requests delivered; no usable delivery times.'
      );
  });

  it('summarizes the latest month half delivered, not an older one with times', async () => {
    respondWith([deliveryLatencyMonths[0], { ...noTimes, month: '2026-02' }]);

    await render(<DeliveryLatencySection dateRange="12months" />, { wrapper: createWrapper() });

    await expect
      .element(page.getByTestId('delivery-latency-summary'))
      .toHaveTextContent('Latest settled month at least half delivered, 2026-02:');
    await expect
      .element(page.getByTestId('delivery-latency-summary'))
      .not.toHaveTextContent('2026-01');
  });

  it('marks a month under half delivered without calling returns in the mail', async () => {
    respondWith([
      deliveryLatencyMonths[0],
      { ...noTimes, month: '2026-02', linked: 10, excluded: 0, returned: 10 },
    ]);

    await render(<DeliveryLatencySection dateRange="12months" />, { wrapper: createWrapper() });
    await expect.element(page.getByTestId('delivery-latency-summary')).toBeInTheDocument();
    await hoverChart(0.95);

    await expect.element(page.getByText('Postmarked 2026-02')).toBeInTheDocument();
    await expect.element(page.getByText('Under half delivered so far')).toBeInTheDocument();
    await expect.element(page.getByText('10 returned')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('in the mail');
  });

  it('draws provisional months apart and leaves them out of the summary', async () => {
    const [january, february] = deliveryLatencyMonths;
    // February is half delivered, but too recent to have settled.
    respondWith([january, { ...february, delivered: 8, excluded: 0, provisional: true }]);

    await render(<DeliveryLatencySection dateRange="12months" />, { wrapper: createWrapper() });

    await expect
      .element(page.getByTestId('delivery-latency-summary'))
      .toHaveTextContent('Latest settled month at least half delivered, 2026-01:');
    await expect.poll(() => document.querySelectorAll('circle[data-provisional]').length).toBe(1);
    expect(
      document.querySelector('circle[aria-label="2026-02: provisional, still being answered"]')
    ).not.toBeNull();
    expect(document.querySelectorAll('circle[data-complete]').length).toBe(1);
    await expect.element(page.getByText('Provisional, still being answered')).toBeInTheDocument();
    await expect
      .element(page.getByText(/Months in the last 75 days are provisional/))
      .toBeInTheDocument();

    await hoverChart(0.95);
    await expect
      .element(
        page.getByText(
          'Letters from this month are still being answered, so this figure will rise.'
        )
      )
      .toBeInTheDocument();
  });

  it('shows the provisional message, not the under-half one, for a month that is both', async () => {
    const [january, february] = deliveryLatencyMonths;
    respondWith([january, { ...february, provisional: true }]);

    await render(<DeliveryLatencySection dateRange="12months" />, { wrapper: createWrapper() });
    await expect.element(page.getByTestId('delivery-latency-summary')).toBeInTheDocument();
    await hoverChart(0.95);

    await expect.element(page.getByText('Postmarked 2026-02')).toBeInTheDocument();
    await expect
      .element(page.getByText(/still being answered, so this figure will rise/))
      .toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Under half delivered so far');
  });

  it('says when every month is provisional', async () => {
    respondWith(deliveryLatencyMonths.map((month) => ({ ...month, provisional: true })));

    await render(<DeliveryLatencySection dateRange="6months" />, { wrapper: createWrapper() });

    await expect
      .element(page.getByTestId('delivery-latency-summary'))
      .toHaveTextContent(
        'Every month shown is provisional: letters from the last 75 days are still being answered.'
      );
    await expect.poll(() => document.querySelectorAll('circle[data-provisional]').length).toBe(2);
    expect(document.querySelectorAll('circle[data-complete]').length).toBe(0);
  });

  it('says a month has no requests of the method instead of 0 of 0', async () => {
    respondWith([
      deliveryLatencyMonths[0],
      { ...noTimes, month: '2026-02', linked: 0, excluded: 0 },
    ]);

    await render(<DeliveryLatencySection dateRange="12months" />, { wrapper: createWrapper() });
    await page.getByRole('button', { name: 'Bulk' }).click();
    await expect
      .element(page.getByRole('button', { name: 'Bulk' }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect.element(page.getByTestId('delivery-latency-summary')).toBeInTheDocument();
    await hoverChart(0.95);

    await expect.element(page.getByText('Postmarked 2026-02')).toBeInTheDocument();
    await expect
      .element(page.getByText('No requests sent in bulk boxes (10 filled in all)'))
      .toBeInTheDocument();
    expect(document.body.textContent).not.toContain('0 of 0');
    expect(document.body.textContent).not.toContain('Under half delivered so far');
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
