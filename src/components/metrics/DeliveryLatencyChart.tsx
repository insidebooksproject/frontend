import { useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDeliveryLatency } from '@/hooks';
import type { DateRangePreset, DeliveryBound, DeliveryLatencyMonth, DeliveryMethod } from '@/types';

/** A month with fewer of its requests delivered than this is marked. */
const COMPLETE_COVERAGE = 0.5;

const COLOR = 'var(--chart-2)';
/** Provisional months are drawn grey and dashed. */
const PROVISIONAL_COLOR = 'var(--muted-foreground)';

const METHODS: { value: DeliveryMethod; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'individual', label: 'Individual' },
  { value: 'bulk', label: 'Bulk' },
];

const BOUNDS: { value: DeliveryBound; label: string }[] = [
  { value: 'earliest', label: 'Earliest box' },
  { value: 'latest', label: 'Latest box' },
];

/** Whether half a month's requests are delivered; `none` when the selected
 * method linked none of them. */
type Coverage = 'complete' | 'under' | 'none';

interface ChartRow {
  month: string;
  /** Settled months only. */
  median: number | null;
  band: [number, number] | null;
  /** Provisional months, and the last settled one so the lines join. */
  provisionalMedian: number | null;
  provisionalBand: [number, number] | null;
  coverage: Coverage;
  provisional: boolean;
  source: DeliveryLatencyMonth;
}

const days = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

function formatDays(value: number | null): string {
  return value === null ? '–' : `${days.format(value)} d`;
}

/** The requests a month's coverage is out of: every Filled request, or for one
 * method only those linked by it (an unlinked request has no method). */
function coverageBase(month: DeliveryLatencyMonth, method: DeliveryMethod): number {
  return method === 'all' ? month.filled : month.linked;
}

/** Every delivered request, including those left out of the latency for a bad
 * postmark (`delivered` counts only the requests in the statistics). */
function deliveredCount(month: DeliveryLatencyMonth): number {
  return month.delivered + month.excluded;
}

function coverageOf(month: DeliveryLatencyMonth, method: DeliveryMethod): Coverage {
  const base = coverageBase(month, method);
  if (base === 0) return 'none';
  return deliveredCount(month) / base >= COMPLETE_COVERAGE ? 'complete' : 'under';
}

function sampleText(month: DeliveryLatencyMonth): string {
  const based = `Based on ${month.delivered} ${month.delivered === 1 ? 'delivery' : 'deliveries'}`;
  return month.excluded > 0 ? `${based}; ${month.excluded} left out for a bad postmark` : based;
}

function coverageText(month: DeliveryLatencyMonth, method: DeliveryMethod): string {
  if (method === 'all') {
    return `${deliveredCount(month)} of ${month.filled} filled requests delivered`;
  }
  const which = method === 'individual' ? 'with their own label' : 'sent in bulk boxes';
  if (month.linked === 0) return `No requests ${which} (${month.filled} filled in all)`;
  return `${deliveredCount(month)} of ${month.linked} ${which} delivered (${month.filled} filled in all)`;
}

const PROVISIONAL_TEXT =
  'Letters from this month are still being answered, so this figure will rise.';

function toRows(
  months: DeliveryLatencyMonth[],
  method: DeliveryMethod,
  bound: DeliveryBound
): ChartRow[] {
  return months.map((month, index) => {
    const quartiles = month[bound];
    const median = quartiles?.median ?? null;
    const band: [number, number] | null = quartiles ? [quartiles.p25, quartiles.p75] : null;
    // The last settled month starts the dashed line too, so the two join.
    const joinsProvisional = !month.provisional && months[index + 1]?.provisional === true;
    const onProvisionalLine = month.provisional || joinsProvisional;
    return {
      month: month.month,
      median: month.provisional ? null : median,
      band: month.provisional ? null : band,
      provisionalMedian: onProvisionalLine ? median : null,
      provisionalBand: onProvisionalLine ? band : null,
      coverage: coverageOf(month, method),
      provisional: month.provisional,
      source: month,
    };
  });
}

interface TooltipProps {
  active?: boolean;
  payload?: { payload: ChartRow }[];
  method: DeliveryMethod;
  bound: DeliveryBound;
}

function DeliveryTooltip({ active, payload, method, bound }: TooltipProps) {
  // Rendered with filterNull off, so a month without latencies (only requests
  // in the mail or returned) still shows its counts.
  const row = payload?.find((item) => item?.payload)?.payload;
  if (!active || !row) return null;
  const month = row.source;
  const quartiles = month[bound];
  const inTheMail = month.linked - month.delivered - month.returned - month.excluded;

  return (
    <div className="bg-popover text-popover-foreground max-w-72 rounded-md border p-3 text-sm shadow-md">
      <p className="font-medium">Postmarked {month.month}</p>
      {quartiles ? (
        <p>
          Median {formatDays(quartiles.median)} (middle half {formatDays(quartiles.p25)} to{' '}
          {formatDays(quartiles.p75)})
        </p>
      ) : (
        <p>No delivery times yet</p>
      )}
      <p className="text-muted-foreground">{coverageText(month, method)}</p>
      {deliveredCount(month) > 0 && <p className="text-muted-foreground">{sampleText(month)}</p>}
      {row.provisional ? (
        <p className="mt-1">{PROVISIONAL_TEXT}</p>
      ) : (
        row.coverage === 'under' && (
          <p className="text-muted-foreground">Under half delivered so far</p>
        )
      )}
      {quartiles && (
        <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3">
          <dt className="text-muted-foreground col-span-2">Median of each stage</dt>
          <dt>Handling</dt>
          <dd className="text-right">{formatDays(month.median_handling)}</dd>
          <dt>Waiting to ship</dt>
          <dd className="text-right">{formatDays(month.median_waiting)}</dd>
          <dt>In transit</dt>
          <dd className="text-right">{formatDays(quartiles.median_transit)}</dd>
        </dl>
      )}
      {(inTheMail > 0 || month.returned > 0) && (
        <p className="text-muted-foreground mt-1">
          {[
            inTheMail > 0 && `${inTheMail} in the mail`,
            month.returned > 0 && `${month.returned} returned`,
          ]
            .filter(Boolean)
            .join(', ')}
        </p>
      )}
    </div>
  );
}

interface DotProps {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: ChartRow;
}

/** A filled point for a settled month, a hollow one for a settled month under
 * half delivered. */
function MonthDot({ cx, cy, index, payload }: DotProps) {
  if (cx === undefined || cy === undefined || !payload || payload.median === null) {
    return <g key={index} />;
  }
  const complete = payload.coverage === 'complete';
  return (
    <circle
      key={index}
      cx={cx}
      cy={cy}
      r={complete ? 3 : 4}
      stroke={COLOR}
      strokeWidth={2}
      fill={complete ? COLOR : 'var(--card)'}
      aria-label={complete ? payload.month : `${payload.month}: under half delivered so far`}
      data-complete={complete}
    />
  );
}

/** A grey hollow point for a provisional month. */
function ProvisionalDot({ cx, cy, index, payload }: DotProps) {
  if (
    cx === undefined ||
    cy === undefined ||
    !payload?.provisional ||
    payload.provisionalMedian === null
  ) {
    return <g key={index} />;
  }
  return (
    <circle
      key={index}
      cx={cx}
      cy={cy}
      r={4}
      stroke={PROVISIONAL_COLOR}
      strokeWidth={2}
      fill="var(--card)"
      aria-label={`${payload.month}: provisional, still being answered`}
      data-provisional
    />
  );
}

function Summary({
  rows,
  method,
  bound,
  settleDays,
}: {
  rows: ChartRow[];
  method: DeliveryMethod;
  bound: DeliveryBound;
  settleDays: number;
}) {
  // The latest settled month at least half delivered, whether or not any of
  // its deliveries has a usable time (all may be left out for a bad postmark).
  const last = [...rows].reverse().find((row) => !row.provisional && row.coverage === 'complete');
  if (!last) {
    return (
      <p className="text-muted-foreground text-sm" data-testid="delivery-latency-summary">
        {rows.every((row) => row.provisional)
          ? `Every month shown is provisional: letters from the last ${settleDays} days are still being answered.`
          : 'No settled month has half its requests delivered yet.'}
      </p>
    );
  }
  const quartiles = last.source[bound];
  return (
    <p className="text-sm" data-testid="delivery-latency-summary">
      Latest settled month at least half delivered, {last.month}:{' '}
      {quartiles ? (
        <>
          median {formatDays(quartiles.median)} (middle half {formatDays(quartiles.p25)} to{' '}
          {formatDays(quartiles.p75)}); {coverageText(last.source, method)}.
        </>
      ) : (
        <>{coverageText(last.source, method)}; no usable delivery times.</>
      )}
    </p>
  );
}

interface ToggleGroupProps<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

function ToggleGroup<T extends string>({ label, options, value, onChange }: ToggleGroupProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Button
          key={option.value}
          variant={value === option.value ? 'default' : 'outline'}
          size="sm"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

function Placeholder({ children }: { children: string }) {
  return (
    <div className="h-80 flex items-center justify-center text-center">
      <p className="text-muted-foreground">{children}</p>
    </div>
  );
}

interface DeliveryLatencySectionProps {
  dateRange: DateRangePreset;
}

/** Days from a letter's postmark to its books' delivery, by postmark month. */
export function DeliveryLatencySection({ dateRange }: DeliveryLatencySectionProps) {
  const [method, setMethod] = useState<DeliveryMethod>('all');
  const [bound, setBound] = useState<DeliveryBound>('latest');
  const { data, isLoading, isError, error } = useDeliveryLatency({ method, dateRange });

  const months = data?.data ?? [];
  const settleDays = data?.settle_days ?? 0;
  const rows = toRows(months, method, bound);
  const boundLabel = bound === 'latest' ? 'latest box' : 'earliest box';

  let body;
  if (isLoading) {
    body = <Placeholder>Loading chart...</Placeholder>;
  } else if (isError) {
    body = (
      <Alert variant="destructive">
        <AlertDescription>
          {error instanceof Error ? error.message : 'Failed to load delivery data.'}
        </AlertDescription>
      </Alert>
    );
  } else if (!months.some((month) => month.linked > 0)) {
    body = <Placeholder>No shipment data yet for the selected filters.</Placeholder>;
  } else {
    body = (
      <div className="space-y-3">
        <Summary rows={rows} method={method} bound={bound} settleDays={settleDays} />
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={rows} margin={{ top: 5, right: 8, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="month"
              tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
              stroke="var(--border)"
            />
            <YAxis
              width={40}
              allowDecimals={false}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
              stroke="var(--border)"
              label={{
                value: 'Days',
                angle: -90,
                position: 'insideLeft',
                fill: 'var(--muted-foreground)',
                fontSize: 12,
              }}
            />
            <Tooltip
              filterNull={false}
              content={<DeliveryTooltip method={method} bound={bound} />}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area
              dataKey="band"
              name="Middle half (25th to 75th percentile)"
              legendType="square"
              stroke="none"
              fill={COLOR}
              fillOpacity={0.2}
              isAnimationActive={false}
              activeDot={false}
            />
            <Line
              dataKey="median"
              name={`Median, ${boundLabel}`}
              stroke={COLOR}
              strokeWidth={2}
              dot={MonthDot}
              isAnimationActive={false}
            />
            <Area
              dataKey="provisionalBand"
              legendType="none"
              stroke="none"
              fill={PROVISIONAL_COLOR}
              fillOpacity={0.12}
              isAnimationActive={false}
              activeDot={false}
            />
            <Line
              dataKey="provisionalMedian"
              name="Provisional, still being answered"
              stroke={PROVISIONAL_COLOR}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={ProvisionalDot}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-muted-foreground text-xs">
          Months in the last {settleDays} days are provisional (grey, dashed): their letters are
          still being answered, so their figures will rise. Hollow points: under half the
          month&apos;s requests delivered so far. Bulk packages are matched to the first box sent to
          the unit after they were filled, so a single package&apos;s date can be off by one
          shipping session. &ldquo;Delivered&rdquo; means delivered to the unit&apos;s mailroom.
        </p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Postmark to delivery</CardTitle>
        <CardDescription>
          Days from a letter&apos;s postmark to its books&apos; delivery, for filled requests by
          postmark month. Follows the Date Range filter only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <ToggleGroup
            label="Shipping method"
            options={METHODS}
            value={method}
            onChange={setMethod}
          />
          <ToggleGroup label="Split packages" options={BOUNDS} value={bound} onChange={setBound} />
        </div>
        {body}
      </CardContent>
    </Card>
  );
}
