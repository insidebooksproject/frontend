import { useQuery } from '@tanstack/react-query';
import { getServerConfig } from '@/lib/api';
import { resolveTimeZone } from '@/lib/serverDate';

export function useServerConfig() {
  return useQuery({
    queryKey: ['server-config'],
    queryFn: getServerConfig,
    // The config file changes only with a server restart.
    staleTime: Infinity,
  });
}

/**
 * The server's time zone. Until the config arrives, or if the request fails
 * (e.g. an older backend without `/server-config`), it is America/Chicago, so
 * nothing waits on it.
 */
export function useServerTimeZone(): string {
  const { data } = useServerConfig();
  return resolveTimeZone(data?.timezone);
}
