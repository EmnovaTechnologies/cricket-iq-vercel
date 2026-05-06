'use client';

import type { CampPerformance } from '@/lib/actions/player-stats-action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy } from 'lucide-react';

interface Props {
  campPerformance: CampPerformance[];
}

function RatingDots({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <div className="flex gap-1 justify-center mt-1">
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className={`w-2.5 h-2.5 rounded-full ${i < Math.round(value) ? 'bg-amber-400' : 'bg-border'}`}
        />
      ))}
    </div>
  );
}

export function CampSection({ campPerformance }: Props) {
  if (campPerformance.length === 0) return null;

  return (
    <>
      {campPerformance.map(camp => (
        <Card key={camp.campId}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              Camp performance — {camp.campName}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                { val: camp.avgBatting,  lbl: 'Batting' },
                { val: camp.avgBowling,  lbl: 'Bowling' },
                { val: camp.avgFielding, lbl: 'Fielding' },
                { val: camp.avgFitness,  lbl: 'Fitness' },
                { val: camp.avgAttitude, lbl: 'Attitude' },
                { val: camp.avgOverall,  lbl: 'Overall' },
              ].map(({ val, lbl }) => (
                <div key={lbl} className="bg-muted rounded-lg p-3 text-center">
                  <div className="text-lg font-medium">{val.toFixed(1)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{lbl}</div>
                  <RatingDots value={val} />
                </div>
              ))}
            </div>

            {camp.fitnessTestType && (
              <div className="flex items-center justify-between border-t pt-3 text-sm">
                <span className="text-muted-foreground">
                  Fitness test · {camp.fitnessTestType}
                  {camp.fitnessScore !== undefined && ` (${camp.fitnessScore})`}
                </span>
                {camp.fitnessPassed === true && (
                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Passed</Badge>
                )}
                {camp.fitnessPassed === false && (
                  <Badge variant="destructive">Failed</Badge>
                )}
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              Averaged across {camp.coachCount} coach assessment{camp.coachCount !== 1 ? 's' : ''} · individual coach ratings are not shown
            </p>
          </CardContent>
        </Card>
      ))}
    </>
  );
}
