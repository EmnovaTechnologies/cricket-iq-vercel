'use client';

import type { PlayerStatsResult } from '@/lib/actions/player-stats-action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';

interface Props {
  stats: PlayerStatsResult;
}

export function StatsSection({ stats }: Props) {
  const agg = stats.aggregated;
  if (!agg) return null;

  const trend = stats.scoreTrend;
  const maxTrend = Math.max(...trend, 1);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          My performance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stat grid */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { val: agg.gamesPlayed, lbl: 'Games' },
            { val: agg.totalRuns, lbl: 'Runs' },
            { val: agg.avgStrikeRate, lbl: 'Strike rate' },
            { val: agg.avgScorePerGame, lbl: 'Avg score' },
          ].map(({ val, lbl }) => (
            <div key={lbl} className="bg-muted rounded-lg p-3 text-center">
              <div className="text-xl font-medium">{val}</div>
              <div className="text-xs text-muted-foreground mt-1">{lbl}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-2">
          {[
            { val: agg.totalWickets, lbl: 'Wickets' },
            { val: agg.avgEconomy || '—', lbl: 'Economy' },
            { val: agg.totalCatches, lbl: 'Catches' },
            { val: agg.totalScore, lbl: 'Total score' },
          ].map(({ val, lbl }) => (
            <div key={lbl} className="bg-muted rounded-lg p-3 text-center">
              <div className="text-xl font-medium">{val}</div>
              <div className="text-xs text-muted-foreground mt-1">{lbl}</div>
            </div>
          ))}
        </div>

        {/* Score trend sparkline */}
        {trend.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-2">Score trend — last {trend.length} game{trend.length !== 1 ? 's' : ''}</div>
            <div className="flex items-end gap-1.5 h-10">
              {trend.map((score, i) => (
                <div
                  key={i}
                  className="flex-1 bg-primary rounded-t-sm min-h-[4px]"
                  style={{ height: `${Math.max(8, (score / maxTrend) * 40)}px` }}
                  title={`Game ${i + 1}: ${score}`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Extra fielding detail */}
        {(agg.totalRunOuts > 0 || agg.totalStumpings > 0 || agg.totalFours > 0) && (
          <div className="text-xs text-muted-foreground flex flex-wrap gap-3 pt-1 border-t">
            {agg.totalFours > 0 && <span>{agg.totalFours} fours</span>}
            {agg.totalSixes > 0 && <span>{agg.totalSixes} sixes</span>}
            {agg.totalWickets > 0 && <span>{agg.totalOvers} overs bowled</span>}
            {agg.totalRunOuts > 0 && <span>{agg.totalRunOuts} run outs</span>}
            {agg.totalStumpings > 0 && <span>{agg.totalStumpings} stumpings</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
