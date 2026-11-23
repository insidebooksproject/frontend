import type { Jurisdiction } from './common';
import type { Unit } from './unit';
import type { Request } from './request';
import type { Comment } from './comment';

export interface Lookup {
  datetime_created: string;
}

export interface InmateBase {
  jurisdiction: Jurisdiction;
  id: number;
  first_name: string | null;
  last_name: string | null;
  race: string | null;
  sex: string | null;
  release: string | null;
  url: string | null;
}

export interface Inmate extends InmateBase {
  datetime_fetched: string | null;
  unit: Unit | null;
  requests: Request[];
  comments: Comment[];
  lookups: Lookup[];
  /** Pronouns the person stated in a letter; null (or absent) when none were
   *  stated. Never inferred from `sex`, and never printed on a label. */
  pronouns?: string | null;
  /** Initials of the volunteer who recorded `pronouns`. */
  pronouns_set_by?: string | null;
  /** When `pronouns` were recorded (ISO 8601, UTC). */
  pronouns_set_at?: string | null;
}

export interface InmateSearchResult extends InmateBase {
  /** Set when this result came from the legacy request ID searched for
   *  (an old package label), not from the inmate ID search. */
  via_request?: number;
}

export interface InmateSearchResults {
  inmates: InmateSearchResult[];
  /** Name-search matches set aside as stale: old data for someone their
   *  provider, asked just now, did not return (most likely released). */
  stale_inmates?: InmateSearchResult[];
  errors: string[];
  /** Set (by the frontend) when a single result must not be auto-redirected
   *  to, because a lookup that could have found someone else failed. */
  noAutoRedirect?: boolean;
}
