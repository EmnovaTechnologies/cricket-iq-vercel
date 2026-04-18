'use client';

/**
 * FILE: src/components/scorecards/innings-view.tsx
 *
 * Shared innings display component used by both:
 *  - src/app/scorecards/[id]/page.tsx
 *  - src/app/games/[id]/details/page.tsx
 */

import { Badge } from '@/components/ui/badge';
import type { ScorecardInnings, MatchScorecard } from '@/types';

export function InningsView({ innings }: { innings: ScorecardInnings }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-primary text-lg">{innings.battingTeam} innings</h3>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-base font-semibold">
            {innings.totalRuns}/{innings.wickets}
          </Badge>
          <Badge variant="secondary">{innings.overs} overs</Badge>
        </div>
      </div>

      {/* Batting */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wide">Batting</h4>
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-primary text-primary-foreground">
              <tr>
                <th className="text-left p-2.5 font-medium" colSpan={2}>Batter</th>
                <th className="p-2.5 font-medium text-right">R</th>
                <th className="p-2.5 font-medium text-right">B</th>
                <th className="p-2.5 font-medium text-right">4s</th>
                <th className="p-2.5 font-medium text-right">6s</th>
                <th className="p-2.5 font-medium text-right">SR</th>
              </tr>
            </thead>
            <tbody>
              {innings.batting.map((b, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                  <td className="p-2.5" colSpan={2}>
                    <p className="font-medium">{b.name}</p>
                    <p className="text-xs text-muted-foreground">{b.dismissal}</p>
                  </td>
                  <td className="p-2.5 text-right font-semibold">{b.runs}</td>
                  <td className="p-2.5 text-right text-muted-foreground">{b.balls}</td>
                  <td className="p-2.5 text-right text-muted-foreground">{b.fours}</td>
                  <td className="p-2.5 text-right text-muted-foreground">{b.sixes}</td>
                  <td className="p-2.5 text-right text-muted-foreground">{b.strikeRate}</td>
                </tr>
              ))}
              <tr className="bg-muted/50 border-t font-medium">
                <td className="p-2.5" colSpan={2}>
                  Extras ({innings.extras.byes > 0 ? `b ${innings.extras.byes} ` : ''}
                  {innings.extras.legByes > 0 ? `lb ${innings.extras.legByes} ` : ''}
                  {innings.extras.wides > 0 ? `w ${innings.extras.wides} ` : ''}
                  {innings.extras.noballs > 0 ? `nb ${innings.extras.noballs}` : ''})
                </td>
                <td className="p-2.5 text-right font-semibold">{innings.extras.total}</td>
                <td colSpan={4} />
              </tr>
              <tr className="bg-primary/10 border-t font-semibold">
                <td className="p-2.5" colSpan={2}>
                  Total ({innings.wickets} wickets, {innings.overs} overs)
                </td>
                <td className="p-2.5 text-right font-bold text-primary">{innings.totalRuns}</td>
                <td colSpan={4} />
              </tr>
            </tbody>
          </table>
        </div>
        {innings.didNotBat.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2 px-1">
            <span className="font-medium">Did not bat:</span> {innings.didNotBat.join(', ')}
          </p>
        )}
      </div>

      {/* Bowling */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wide">Bowling</h4>
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-primary text-primary-foreground">
              <tr>
                <th className="text-left p-2.5 font-medium">Bowler</th>
                <th className="p-2.5 font-medium text-right">O</th>
                <th className="p-2.5 font-medium text-right">M</th>
                <th className="p-2.5 font-medium text-right">Dot</th>
                <th className="p-2.5 font-medium text-right">R</th>
                <th className="p-2.5 font-medium text-right">W</th>
                <th className="p-2.5 font-medium text-right">Econ</th>
                <th className="p-2.5 font-medium text-right">Wd</th>
                <th className="p-2.5 font-medium text-right">Nb</th>
              </tr>
            </thead>
            <tbody>
              {innings.bowling.map((b, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                  <td className="p-2.5 font-medium">{b.name}</td>
                  <td className="p-2.5 text-right">{b.overs}</td>
                  <td className="p-2.5 text-right text-muted-foreground">{b.maidens}</td>
                  <td className="p-2.5 text-right text-muted-foreground">{b.dots}</td>
                  <td className="p-2.5 text-right">{b.runs}</td>
                  <td className="p-2.5 text-right font-semibold text-primary">{b.wickets}</td>
                  <td className="p-2.5 text-right text-muted-foreground">{b.economy}</td>
                  <td className="p-2.5 text-right text-muted-foreground">{b.wides}</td>
                  <td className="p-2.5 text-right text-muted-foreground">{b.noballs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Fall of Wickets */}
      {innings.fallOfWickets.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wide">Fall of Wickets</h4>
          <div className="flex flex-wrap gap-2">
            {innings.fallOfWickets.map((fow, i) => (
              <Badge key={i} variant="outline" className="text-xs font-mono">{fow}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Build player name lists by team from scorecard innings */
export function buildPlayersByTeam(scorecard: MatchScorecard): Record<string, string[]> {
  const byTeam: Record<string, Set<string>> = {};
  for (const inn of scorecard.innings) {
    const team = inn.battingTeam;
    if (!byTeam[team]) byTeam[team] = new Set();
    inn.batting.forEach(b => byTeam[team].add(b.name));
    inn.didNotBat?.forEach(n => byTeam[team].add(n));
    const bowlingTeam = team === scorecard.team1 ? scorecard.team2 : scorecard.team1;
    if (!byTeam[bowlingTeam]) byTeam[bowlingTeam] = new Set();
    inn.bowling.forEach(b => byTeam[bowlingTeam].add(b.name));
  }
  return Object.fromEntries(
    Object.entries(byTeam).map(([t, s]) => [t, Array.from(s).sort()])
  );
}
