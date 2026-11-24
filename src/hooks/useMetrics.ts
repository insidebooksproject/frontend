import { useQuery } from '@tanstack/react-query';
import { getDeliveryLatency, getRequestMetrics } from '@/lib/api';
import type { DeliveryLatencyFilters, MetricsFilters } from '@/types';

export function useRequestMetrics(filters: Partial<MetricsFilters>) {
  return useQuery({
    queryKey: ['metrics', 'requests', filters],
    queryFn: () => getRequestMetrics(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useDeliveryLatency(filters: DeliveryLatencyFilters) {
  return useQuery({
    queryKey: ['metrics', 'delivery-latency', filters],
    queryFn: () => getDeliveryLatency(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
