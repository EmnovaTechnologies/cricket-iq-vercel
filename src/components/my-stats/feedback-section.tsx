'use client';

import type { PlayerFeedbackItem } from '@/lib/actions/player-stats-action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  feedback: PlayerFeedbackItem[];
}

const dimensionColors: Record<string, { pos: string; neg: string }> = {
  batting:  { pos: 'bg-green-100 text-green-800', neg: 'bg-red-100 text-red-800' },
  bowling:  { pos: 'bg-blue-100 text-blue-800',   neg: 'bg-red-100 text-red-800' },
  fielding: { pos: 'bg-teal-100 text-teal-800',   neg: 'bg-red-100 text-red-800' },
  keeping:  { pos: 'bg-purple-100 text-purple-800', neg: 'bg-red-100 text-red-800' },
  attitude: { pos: 'bg-amber-100 text-amber-800', neg: 'bg-red-100 text-red-800' },
};

export function FeedbackSection({ feedback }: Props) {
  if (feedback.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          Selector feedback
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Distilled from accepted match report observations. Raw comments and selector names are never shown.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {feedback.map(item => {
          const colors = dimensionColors[item.dimension] || dimensionColors.batting;
          const isPositive = item.delta > 0;
          const badgeClass = isPositive ? colors.pos : colors.neg;
          const dim = item.dimension.charAt(0).toUpperCase() + item.dimension.slice(1);

          let gameDate = '';
          try {
            if (item.gameDate) gameDate = format(new Date(item.gameDate), 'MMM d yyyy');
          } catch {}

          return (
            <div key={item.deltaId} className="flex gap-3 items-start p-3 bg-muted rounded-lg">
              <span className={`text-[10px] font-medium px-2 py-1 rounded-full flex-shrink-0 mt-0.5 ${badgeClass}`}>
                {dim}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-relaxed">{item.reason}</p>
                {gameDate && (
                  <p className="text-[11px] text-muted-foreground mt-1">Game · {gameDate}</p>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
