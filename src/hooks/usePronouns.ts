import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clearPronouns, setPronouns } from '@/lib/api';
import type { Jurisdiction, PronounsClear, PronounsSet } from '@/types';

// Both refresh the read-only inmate query (`useInmate`), which records no
// lookup, so the profile shows the change without counting another view.

export function useSetPronouns(jurisdiction: Jurisdiction, inmateId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PronounsSet) => setPronouns(jurisdiction, inmateId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inmates', jurisdiction, inmateId] });
    },
  });
}

export function useClearPronouns(jurisdiction: Jurisdiction, inmateId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PronounsClear) => clearPronouns(jurisdiction, inmateId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inmates', jurisdiction, inmateId] });
    },
  });
}
