'use client';

import type { SeriesBenchmark } from '@/lib/actions/player-stats-action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';

interface Props {
  benchmarks: SeriesBenchmark[];
}

function percentileBadge(percentile: number) {
  if (percentile >= 75) return { label: 'Top 25%', className: 'bg-green-100 text-green-800' };
  if (percentile >= 50) return { label: 'Above median', className: 'bg-blue-100 text-blue-800' };
  if (percentile >= 25) return { label: 'Below median', className: 'bg-amber-100 text-amber-800' };
  return { label: 'Developing', className: 'bg-muted text-muted-foreground' };
}

export function BenchmarkSection({ benchmarks }: Props) {
  if (benchmarks.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Where I stand — series comparison
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Anonymous benchmarks vs other players in this series. No names shown.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {benchmarks.map(b => {
            const { label, className } = percentileBadge(b.percentile);
            // Bar fill: player position relative to series max
            const fillPct = b.seriesMax > 0
              ? Math.round((b.playerValue / b.seriesMax) * 100)
              : 0;
            // Median marker position
            const medianPct = b.seriesMax > 0
              ? Math.round((b.seriesMedian / b.seriesMax) * 100)
              : 50;

            return (
              <div key={b.metric} className="bg-muted rounded-lg p-3">
                <div className="text-xs text-muted-foreground mb-2">{b.label}</div>
                <div className="relative h-1.5 bg-border rounded-full mb-1.5">
                  <div
                    className="absolute left-0 top-0 h-full bg-primary rounded-full"
                    style={{ width: `${Math.min(fillPct, 100)}%` }}
                  />
                  {/* Median marker */}
                  <div
                    className="absolute top-[-3px] w-0.5 h-3 bg-destructive rounded-sm"
                    style={{ left: `${medianPct}%` }}
                    title={`Series median: ${b.seriesMedian}`}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mb-2">
                  <span>{b.higherIsBetter ? '0' : 'Best'}</span>
                  <span>Series median ({b.seriesMedian})</span>
                  <span>{b.higherIsBetter ? 'Top' : 'Worst'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{b.playerValue}</span>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${className}`}>
                    {label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground mt-3">
          Blue bar = your score · Red line = series median
        </p>
      </CardContent>
    </Card>
  );
}
