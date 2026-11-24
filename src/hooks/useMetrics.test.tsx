import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { createWrapper } from '@/test/utils';
import { deliveryLatencyMonths, jsonResponse } from '@/test/deliveryLatency';
import { useDeliveryLatency } from './useMetrics';
import type { DeliveryLatencyFilters } from '@/types';

const mockFetch = vi.fn();
window.fetch = mockFetch;

function LatencyTest({ filters }: { filters: DeliveryLatencyFilters }) {
  const { data, isError } = useDeliveryLatency(filters);
  if (isError) return <div data-testid="months">error</div>;
  return <div data-testid="months">{data?.data.map((month) => month.month).join(',')}</div>;
}

describe('useDeliveryLatency', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('fetches the months for the method and date range', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        data: deliveryLatencyMonths,
        settle_days: 90,
        filters_applied: { method: 'bulk' },
      })
    );

    const Wrapper = createWrapper();
    await render(
      <Wrapper>
        <LatencyTest filters={{ method: 'bulk', dateRange: '6months' }} />
      </Wrapper>
    );

    await expect.element(page.getByTestId('months')).toHaveTextContent('2026-01,2026-02');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain('/metrics/delivery-latency?');
    expect(url).toContain('method=bulk');
    expect(url).toContain('date_range=6months');
  });

  it('reports a failed request', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ detail: 'boom' }, 500));

    const Wrapper = createWrapper();
    await render(
      <Wrapper>
        <LatencyTest filters={{ method: 'all', dateRange: 'all' }} />
      </Wrapper>
    );

    await expect.element(page.getByTestId('months')).toHaveTextContent('error');
  });
});
