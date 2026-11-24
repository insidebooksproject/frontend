import { useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart3, LineChart as LineChartIcon } from 'lucide-react';
import type { MonthlyMetricPoint } from '@/types';

const FILLED_COLOR = '#22c55e';
const TOSSED_COLOR = '#ef4444';
/** Provisional months are drawn faded (and dashed, on the line chart). */
const PROVISIONAL_OPACITY = 0.4;
const PROVISIONAL_TEXT = 'Provisional: letters are still being answered, so these will rise.';

interface MetricsChartProps {
  data: MonthlyMetricPoint[];
  /** How long a postmark month's counts take to settle, in days. */
  settleDays?: number;
  isLoading?: boolean;
}

interface ChartRow extends MonthlyMetricPoint {
  /** Settled months only. */
  filled: number | null;
  tossed: number | null;
  /** Provisional months, and the last settled one so the lines join. */
  provisionalFilled: number | null;
  provisionalTossed: number | null;
}

function toRows(data: MonthlyMetricPoint[]): ChartRow[] {
  return data.map((month, index) => {
    const provisional = month.provisional === true;
    const onProvisionalLine = provisional || data[index + 1]?.provisional === true;
    return {
      ...month,
      filled: provisional ? null : month.filled_count,
      tossed: provisional ? null : month.tossed_count,
      provisionalFilled: onProvisionalLine ? month.filled_count : null,
      provisionalTossed: onProvisionalLine ? month.tossed_count : null,
    };
  });
}

interface TooltipProps {
  active?: boolean;
  payload?: { payload?: ChartRow }[];
}

function RequestTooltip({ active, payload }: TooltipProps) {
  const row = payload?.find((item) => item?.payload)?.payload;
  if (!active || !row) return null;
  return (
    <div className="bg-popover text-popover-foreground max-w-72 rounded-md border p-3 text-sm shadow-md">
      <p className="font-medium">Postmarked {row.month}</p>
      <p style={{ color: FILLED_COLOR }}>Filled: {row.filled_count}</p>
      <p style={{ color: TOSSED_COLOR }}>Tossed: {row.tossed_count}</p>
      {row.provisional && <p className="text-muted-foreground mt-1">{PROVISIONAL_TEXT}</p>}
    </div>
  );
}

interface DotProps {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: ChartRow;
}

/** A hollow point for a provisional month; nothing for the settled month the
 * dashed line starts from. */
function provisionalDot(color: string) {
  return function ProvisionalDot({ cx, cy, index, payload }: DotProps) {
    if (cx === undefined || cy === undefined || !payload?.provisional) return <g key={index} />;
    return (
      <circle
        key={index}
        cx={cx}
        cy={cy}
        r={3}
        stroke={color}
        strokeOpacity={PROVISIONAL_OPACITY}
        strokeWidth={2}
        fill="var(--card)"
        aria-label={`${payload.month}: provisional, still being answered`}
        data-provisional
      />
    );
  };
}

const FilledProvisionalDot = provisionalDot(FILLED_COLOR);
const TossedProvisionalDot = provisionalDot(TOSSED_COLOR);

export function MetricsChart({ data, settleDays, isLoading }: MetricsChartProps) {
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');

  if (isLoading) {
    return (
      <Card>
        <CardContent className="h-96 flex items-center justify-center">
          <p className="text-muted-foreground">Loading chart...</p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="h-96 flex items-center justify-center">
          <p className="text-muted-foreground">No data available for selected filters.</p>
        </CardContent>
      </Card>
    );
  }

  const ChartComponent = chartType === 'line' ? LineChart : BarChart;
  const rows = toRows(data);
  const anyProvisional = rows.some((row) => row.provisional);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Request Trends Over Time</CardTitle>
          <div className="flex gap-2">
            <Button
              variant={chartType === 'line' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setChartType('line')}
            >
              <LineChartIcon className="h-4 w-4 mr-2" />
              Line
            </Button>
            <Button
              variant={chartType === 'bar' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setChartType('bar')}
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              Bar
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <ChartComponent data={rows} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip content={<RequestTooltip />} filterNull={false} />
            <Legend />
            {chartType === 'line' ? (
              <>
                <Line
                  type="monotone"
                  dataKey="filled"
                  stroke={FILLED_COLOR}
                  name="Filled"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="tossed"
                  stroke={TOSSED_COLOR}
                  name="Tossed"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="provisionalFilled"
                  stroke={FILLED_COLOR}
                  strokeOpacity={PROVISIONAL_OPACITY}
                  strokeDasharray="5 4"
                  strokeWidth={2}
                  legendType="none"
                  dot={FilledProvisionalDot}
                  activeDot={false}
                />
                <Line
                  type="monotone"
                  dataKey="provisionalTossed"
                  stroke={TOSSED_COLOR}
                  strokeOpacity={PROVISIONAL_OPACITY}
                  strokeDasharray="5 4"
                  strokeWidth={2}
                  legendType="none"
                  dot={TossedProvisionalDot}
                  activeDot={false}
                />
              </>
            ) : (
              <>
                <Bar dataKey="filled_count" fill={FILLED_COLOR} name="Filled">
                  {rows.map((row) => (
                    <Cell
                      key={row.month}
                      fillOpacity={row.provisional ? PROVISIONAL_OPACITY : 1}
                      data-provisional={row.provisional || undefined}
                    />
                  ))}
                </Bar>
                <Bar dataKey="tossed_count" fill={TOSSED_COLOR} name="Tossed">
                  {rows.map((row) => (
                    <Cell key={row.month} fillOpacity={row.provisional ? PROVISIONAL_OPACITY : 1} />
                  ))}
                </Bar>
              </>
            )}
          </ChartComponent>
        </ResponsiveContainer>
        <p className="text-muted-foreground mt-2 text-xs">
          Requests are counted by the month their letter was postmarked, and a letter is only
          counted once it has been answered.
          {anyProvisional &&
            ` Months in the last ${settleDays ?? 0} days are provisional (faded${
              chartType === 'line' ? ', dashed' : ''
            }): their letters are still being answered, so their counts will rise.`}
        </p>
      </CardContent>
    </Card>
  );
}
