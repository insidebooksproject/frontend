export interface MonthlyMetricPoint {
  month: string; // "YYYY-MM"
  filled_count: number;
  tossed_count: number;
  total_count: number;
  /** The month ended under `settle_days` ago: its letters are still being
   * answered, so its counts will rise. */
  provisional?: boolean;
}

export interface RequestMetricsResponse {
  data: MonthlyMetricPoint[];
  /** How long a postmark month's counts take to settle, in days. */
  settle_days: number;
  filters_applied: Record<string, unknown>;
}

export type DateRangePreset = '6months' | '12months' | 'all';

export interface MetricsFilters {
  unitJurisdiction?: string;
  unitName?: string;
  jurisdiction: 'Texas' | 'Federal' | 'All';
  action: 'Filled' | 'Tossed' | 'All';
  dateRange: DateRangePreset;
}

/** Which links the delivery latency counts (see GET /metrics/delivery-latency). */
export type DeliveryMethod = 'all' | 'individual' | 'bulk';

/** For a bulk package split across boxes: the first or the last box's delivery. */
export type DeliveryBound = 'earliest' | 'latest';

/** Days from postmark to delivery for one bound, over a month's delivered requests. */
export interface LatencyQuartiles {
  p25: number;
  median: number;
  p75: number;
  /** Median days from label purchase to delivery. */
  median_transit: number;
}

/**
 * Postmark-to-delivery latency of the Filled requests postmarked in one month.
 * `delivered` counts only the requests in the statistics; `excluded` ones had
 * an impossible latency (a bad postmark). The rest of `linked` are still in
 * the mail. Latency fields are null when `delivered` is 0.
 */
export interface DeliveryLatencyMonth {
  month: string; // "YYYY-MM"
  filled: number;
  linked: number;
  delivered: number;
  returned: number;
  excluded: number;
  earliest: LatencyQuartiles | null;
  latest: LatencyQuartiles | null;
  median_handling: number | null;
  median_waiting: number | null;
  /** The month ended under `settle_days` ago: its letters are still being
   * answered, so its figures will rise. */
  provisional: boolean;
}

export interface DeliveryLatencyResponse {
  data: DeliveryLatencyMonth[];
  /** How long a postmark month takes to settle, in days. */
  settle_days: number;
  filters_applied: Record<string, unknown>;
}

export interface DeliveryLatencyFilters {
  method: DeliveryMethod;
  dateRange: DateRangePreset;
}
