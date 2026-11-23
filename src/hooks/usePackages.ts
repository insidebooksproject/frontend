import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  getPackage,
  addPackageItem,
  updatePackageItem,
  deletePackageItem,
} from '@/lib/api';
import type { QueryClient } from '@tanstack/react-query';
import { bookQueryKey, upcQueryKey } from './useBooks';
import type { Book, PackageItem, PackageItemCreate, PackageItemUpdate } from '@/types';

export function packageQueryKey(code: string) {
  return ['packages', code] as const;
}

/** True for a 4xx from the API: retrying won't change the answer. */
function isClientError(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}

/**
 * A package by its code as scanned. Always refetched on mount: a packer who
 * rescans a label after QC must see the books as they are now.
 */
export function usePackage(code: string) {
  return useQuery({
    queryKey: packageQueryKey(code),
    queryFn: () => getPackage(code),
    staleTime: 0,
    retry: (failureCount, error) => !isClientError(error) && failureCount < 1,
  });
}

// Item writes refetch the package whether they succeed or fail: a 409 means
// the item changed (or was registered) meanwhile, so the page must catch up.

/**
 * An item's title is now the lookup's answer for its ISBN. A lookup still in
 * flight would land with the old answer afterwards, so cancel it (scans
 * retry a cancelled lookup) and cache the item's title.
 */
async function cacheItemTitle(queryClient: QueryClient, item: PackageItem & { isbn: string }) {
  const queryKey = bookQueryKey(item.isbn);
  await queryClient.cancelQueries({ queryKey, exact: true });
  queryClient.setQueryData<Book>(queryKey, {
    isbn: item.isbn,
    title: item.title,
    author: item.author,
    source: 'manual',
    confidence: null,
  });
}

export function useAddPackageItem(code: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PackageItemCreate) => addPackageItem(code, data),
    onSuccess: async (item, data) => {
      // Remembered for the next copy: its lookups must find it from now on.
      const remembered = item.remembered ?? [];
      if (remembered.includes('isbn') && item.isbn)
        await cacheItemTitle(queryClient, { ...item, isbn: item.isbn });
      if (remembered.includes('upc') && data.upc) {
        queryClient.removeQueries({ queryKey: upcQueryKey(data.upc), exact: true });
      }
    },
    // Not awaited: a reload that hangs (offline) mustn't hold back the add's
    // own result, which the package page needs to show a failed add.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: packageQueryKey(code) });
    },
  });
}

export function useUpdatePackageItem(code: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ itemId, data }: { itemId: number; data: PackageItemUpdate }) =>
      updatePackageItem(code, itemId, data),
    onSuccess: async (item, { data }) => {
      // "Fix this title for all future scans" changed the lookup's answer.
      if (data.update_cache && item.isbn)
        await cacheItemTitle(queryClient, { ...item, isbn: item.isbn });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: packageQueryKey(code) }),
  });
}

export function useDeletePackageItem(code: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ itemId, confirmRegistered }: { itemId: number; confirmRegistered?: boolean }) =>
      deletePackageItem(code, itemId, { confirmRegistered }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: packageQueryKey(code) }),
  });
}
