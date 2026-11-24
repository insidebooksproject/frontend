import type { DeliveryLatencyMonth } from '@/types';

/** Invented delivery latency months: January mostly delivered, February still in the mail. */
export const deliveryLatencyMonths: DeliveryLatencyMonth[] = [
  {
    month: '2026-01',
    filled: 10,
    linked: 8,
    delivered: 7,
    returned: 1,
    excluded: 0,
    earliest: { p25: 11, median: 14, p75: 18, median_transit: 4 },
    latest: { p25: 12, median: 15, p75: 19.5, median_transit: 5 },
    median_handling: 6,
    median_waiting: 3,
    provisional: false,
  },
  {
    month: '2026-02',
    filled: 10,
    linked: 8,
    delivered: 2,
    returned: 0,
    excluded: 1,
    earliest: { p25: 9, median: 10, p75: 11, median_transit: 3 },
    latest: { p25: 9, median: 10, p75: 11, median_transit: 3 },
    median_handling: 5,
    median_waiting: 2,
    provisional: false,
  },
];

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
