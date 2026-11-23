import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import type { InmateSearchResult } from '@/types';

interface InmateSearchResultsProps {
  inmates: InmateSearchResult[];
  /** Matches set aside as stale (see `InmateSearchResults.stale_inmates`),
   *  listed only once the volunteer asks for them. */
  staleInmates?: InmateSearchResult[];
  errors: string[];
  /** The search query that produced these results, carried to the detail page
   *  so its "Back to search" link can restore the results. */
  query?: string;
}

function InmateList({ inmates, query }: { inmates: InmateSearchResult[]; query?: string }) {
  return (
    <div className="grid gap-3">
      {inmates.map((inmate) => (
        <Link
          key={`${inmate.jurisdiction}-${inmate.id}`}
          to={`/inmates/${encodeURIComponent(inmate.jurisdiction)}/${inmate.id}`}
          state={query ? { searchQuery: query } : undefined}
        >
          <Card className="transition-colors hover:bg-accent">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">
                  {inmate.last_name}, {inmate.first_name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {inmate.jurisdiction} #{inmate.id.toString().padStart(8, '0')}
                </p>
                {inmate.via_request !== undefined && (
                  <p className="text-sm text-muted-foreground">
                    via request {inmate.via_request} (old package label)
                  </p>
                )}
              </div>
              <div className="text-right text-sm text-muted-foreground">
                {inmate.race && <p>{inmate.race}</p>}
                {inmate.sex && <p>{inmate.sex}</p>}
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export function InmateSearchResults({
  inmates,
  staleInmates = [],
  errors,
  query,
}: InmateSearchResultsProps) {
  const [showStale, setShowStale] = useState(false);
  const staleCount = staleInmates.length;

  return (
    <div className="space-y-4">
      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>
            {errors.length === 1 ? 'Provider Error' : `${errors.length} Provider Errors`}
          </AlertTitle>
          <AlertDescription>
            <p className="mb-2">
              Some providers encountered errors. Search results may be incomplete.
            </p>
            <ul className="list-inside list-disc space-y-1">
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {inmates.length === 0 ? (
        <p className="text-muted-foreground">
          {staleCount > 0
            ? 'No inmates currently listed under that name.'
            : 'No inmates found. Check the spelling, or search by the 8-digit ID number.'}
        </p>
      ) : (
        <InmateList inmates={inmates} query={query} />
      )}

      {staleCount > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {staleCount} older record{staleCount !== 1 ? 's' : ''} not shown (no longer listed by
              TDCJ or the BOP under that name).
            </p>
            <Button variant="outline" size="sm" onClick={() => setShowStale(!showStale)}>
              {showStale ? 'Hide older records' : 'Show older records'}
            </Button>
          </div>
          {showStale && <InmateList inmates={staleInmates} query={query} />}
        </div>
      )}
    </div>
  );
}
