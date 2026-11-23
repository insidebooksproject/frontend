import type { InmatePronouns, Jurisdiction, PronounsClear, PronounsSet } from '@/types';
import { apiPost, apiPut } from './client';

function pronounsPath(jurisdiction: Jurisdiction, inmateId: number): string {
  return `/inmates/${encodeURIComponent(jurisdiction)}/${inmateId}/pronouns`;
}

export async function setPronouns(
  jurisdiction: Jurisdiction,
  inmateId: number,
  data: PronounsSet
): Promise<InmatePronouns> {
  return apiPut<InmatePronouns>(pronounsPath(jurisdiction, inmateId), data);
}

/** A POST with a body, not a DELETE: initials are required to clear. */
export async function clearPronouns(
  jurisdiction: Jurisdiction,
  inmateId: number,
  data: PronounsClear
): Promise<void> {
  return apiPost<void>(`${pronounsPath(jurisdiction, inmateId)}/clear`, data);
}
