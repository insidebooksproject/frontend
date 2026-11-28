import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { reportQueryError } from './errorReporting';

/** A QueryClient with the app's settings (tests use it to match production). */
export function createQueryClient() {
  return new QueryClient({
    // Report 5xx answers and unparseable responses (see errorReporting.ts);
    // each query and mutation still handles its own error as before.
    queryCache: new QueryCache({ onError: (error) => reportQueryError('query', error) }),
    mutationCache: new MutationCache({
      onError: (error) => reportQueryError('mutation', error),
    }),
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export const queryClient = createQueryClient();
