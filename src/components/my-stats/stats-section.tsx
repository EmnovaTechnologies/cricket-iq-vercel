'use client';

import type { PlayerStatsResult } from '@/lib/actions/player-stats-action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BarChart3, Info } from 'lucide-react';

interface Props {
  stats: PlayerStatsResult;
}

function StatBox({ val, lbl, tooltip }: { val: string | number; lbl: string; tooltip?: string }) {
  return (
    <div className="bg-muted rounded-lg p-3 text-center">
      <div className="text-xl font-medium">{val}</div>
      <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
        {lbl}
        {tooltip && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-muted-foreground/60 cursor-help shrink-0" />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[220px] text-xs text-center">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mt-3 mb-1.5 first:mt-0">
      {label}
    </div>
  );
}

export function StatsSection({ stats }: Props) {
  const agg = stats.aggregated;
  if (!agg) return null;

  const trend = stats.scoreTrend;
  const maxTrend = Math.max(...trend, 1);

  const hasBatting = agg.totalBalls > 0 || agg.totalRuns > 0;
  const hasBowling = agg.totalOvers > 0 || agg.totalWickets > 0;
  const hasFielding = agg.totalCatches > 0 || agg.totalRunOuts > 0;
  const hasKeeping = agg.totalStumpings > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          My performance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">

        {/* Overview */}
        <div className="grid grid-cols-3 gap-2">
          <StatBox val={agg.gamesPlayed} lbl="Games" />
          <StatBox
            val={agg.avgScorePerGame}
            lbl="Avg CIQ/game"
            tooltip="Average Cricket IQ Score per game — a composite of batting, bowling and fielding contributions weighted for impact."
          />
          <StatBox
            val={agg.totalScore}
            lbl="Cricket IQ Score"
            tooltip="Your total Cricket IQ Score across all games in this series. Calculated from runs scored, wickets taken, economy rate, catches and run outs."
          />
        </div>

        {/* Score trend */}
        {trend.length > 0 && (
          <div className="pt-2">
            <div className="text-xs text-muted-foreground mb-2">
              Score trend — last {trend.length} game{trend.length !== 1 ? 's' : ''}
            </div>
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

        {/* Batting */}
        {hasBatting && (
          <>
            <SectionLabel label="Batting" />
            <div className="grid grid-cols-4 gap-2">
              <StatBox val={agg.totalRuns} lbl="Runs" />
              <StatBox val={agg.totalBalls} lbl="Balls" />
              <StatBox val={agg.avgStrikeRate} lbl="Strike rate" />
              <StatBox val={agg.totalFours > 0 || agg.totalSixes > 0
                ? `${agg.totalFours}/${agg.totalSixes}`
                : '—'} lbl="4s / 6s" />
            </div>
          </>
        )}

        {/* Bowling */}
        {hasBowling && (
          <>
            <SectionLabel label="Bowling" />
            <div className="grid grid-cols-4 gap-2">
              <StatBox val={agg.totalWickets} lbl="Wickets" />
              <StatBox val={agg.totalOvers} lbl="Overs" />
              <StatBox val={agg.avgEconomy || '—'} lbl="Economy" />
              <StatBox val={agg.totalWickets > 0 && agg.totalOvers > 0
                ? Math.round((agg.totalOvers / agg.totalWickets) * 6 * 10) / 10
                : '—'} lbl="Strike rate" />
            </div>
          </>
        )}

        {/* Fielding */}
        {hasFielding && (
          <>
            <SectionLabel label="Fielding" />
            <div className="grid grid-cols-3 gap-2">
              <StatBox val={agg.totalCatches} lbl="Catches" />
              <StatBox val={agg.totalRunOuts} lbl="Run outs" />
              {hasKeeping
                ? <StatBox val={agg.totalStumpings} lbl="Stumpings" />
                : <div />}
            </div>
          </>
        )}

        {/* Wicket keeping — only if no fielding section OR stumpings > 0 without other fielding */}
        {hasKeeping && !hasFielding && (
          <>
            <SectionLabel label="Wicket keeping" />
            <div className="grid grid-cols-2 gap-2">
              <StatBox val={agg.totalStumpings} lbl="Stumpings" />
              <StatBox val={agg.totalCatches} lbl="Keeper catches" />
            </div>
          </>
        )}

      </CardContent>
    </Card>
  );
}
