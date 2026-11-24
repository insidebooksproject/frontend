import type {
  DeliveryLatencyFilters,
  DeliveryLatencyResponse,
  RequestMetricsResponse,
  MetricsFilters,
} from '@/types';
import { apiGet } from './client';

export async function getRequestMetrics(
  filters: Partial<MetricsFilters>
): Promise<RequestMetricsResponse> {
  const params = new URLSearchParams();

  if (filters.unitJurisdiction) params.append('unit_jurisdiction', filters.unitJurisdiction);
  if (filters.unitName) params.append('unit_name', filters.unitName);
  if (filters.jurisdiction && filters.jurisdiction !== 'All') {
    params.append('jurisdiction', filters.jurisdiction);
  }
  if (filters.action && filters.action !== 'All') {
    params.append('action', filters.action);
  }
  if (filters.dateRange) params.append('date_range', filters.dateRange);

  const queryString = params.toString();
  const path = `/metrics/requests${queryString ? `?${queryString}` : ''}`;

  return apiGet<RequestMetricsResponse>(path);
}

export async function getDeliveryLatency(
  filters: DeliveryLatencyFilters
): Promise<DeliveryLatencyResponse> {
  const params = new URLSearchParams({ method: filters.method, date_range: filters.dateRange });
  return apiGet<DeliveryLatencyResponse>(`/metrics/delivery-latency?${params.toString()}`);
}
