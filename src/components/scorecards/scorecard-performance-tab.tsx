'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Trophy, Settings } from 'lucide-react';
import Link from 'next/link';
import { getScoringConfigAction } from '@/lib/actions/scoring-config-actions';
import { calculatePlayerScores, getTopPlayers, getTopPlayersByTeam } from '@/lib/utils/scorecard-scoring-engine';
import type { ScorecardInnings, ScorecardScoringConfig, PlayerScore } from '@/types';
import { DEFAULT_SCORING_CONFIG } from '@/types';
import { cn } from '@/lib/utils';

interface PerformanceTabProps {
  innings: ScorecardInnings[];
  team1: string;
  team2: string;
  seriesId?: string;
}

// ─── Medal colors ─────────────────────────────────────────────────────────────
const medalColors = ['text-yellow-500', 'text-gray-400', 'text-amber-600'];
const medalLabels = ['1st', '2nd', '3rd'];

// ─── Player Score Card ────────────────────────────────────────────────────────
function PlayerScoreCard({ player, rank, scoreType = 'total' }: { player: PlayerScore; rank: number; scoreType?: 'total' | 'batting' | 'bowling' | 'fielding' }) {
  return (
    <div className={cn(
      "flex items-start gap-3 p-3 rounded-lg border",
      rank === 0 ? "border-yellow-300 bg-yellow-50" :
      rank === 1 ? "border-gray-200 bg-gray-50" :
      "border-amber-200 bg-amber-50"
    )}>
      <div className={cn("text-2xl font-bold mt-0.5 w-8 text-center", medalColors[rank])}>
        {rank === 0 ? '🥇' : rank === 1 ? '🥈' : '🥉'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-sm truncate">{player.name}</p>
          <Badge variant="outline" className="shrink-0 font-bold">{scoreType === 'batting' ? player.battingScore : scoreType === 'bowling' ? player.bowlingScore : scoreType === 'fielding' ? player.fieldingScore : player.totalScore} pts</Badge>
        </div>
        <p className="text-xs text-muted-foreground mb-1.5">{player.team}</p>
        <div className="flex flex-wrap gap-1.5">
          {player.battingScore > 0 && (
            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
              Bat: +{player.battingScore}
              {player.batting && ` (${player.batting.runs}r, ${player.batting.balls}b)`}
            </span>
          )}
          {player.bowlingScore > 0 && (
            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
              Bowl: +{player.bowlingScore}
              {player.bowling && ` (${player.bowling.wickets}w, ${player.bowling.economy} econ)`}
            </span>
          )}
          {player.fieldingScore > 0 && (
            <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
              Field: +{player.fieldingScore}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Top 3 Section ────────────────────────────────────────────────────────────
function TopThreeSection({ title, players, scoreType = 'total' }: { title: string; players: PlayerScore[]; scoreType?: 'total' | 'batting' | 'bowling' | 'fielding' }) {
  if (!players.length) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
        <Trophy className="h-3.5 w-3.5" /> {title}
      </h4>
      <div className="space-y-2">
        {players.map((p, i) => <PlayerScoreCard key={p.name} player={p} rank={i} scoreType={scoreType} />)}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function ScorecardPerformanceTab({ innings, team1, team2, seriesId }: PerformanceTabProps) {
  const { activeOrganizationId } = useAuth();

  const [config, setConfig] = useState<ScorecardScoringConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [showFormula, setShowFormula] = useState(false);

  useEffect(() => {
    if (!activeOrganizationId) return;
    getScoringConfigAction(activeOrganizationId, seriesId).then(cfg => {
      setConfig(cfg);
      setIsLoadingConfig(false);
    });
  }, [activeOrganizationId, seriesId]);

  if (isLoadingConfig) {
    return <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const effectiveConfig = config || { ...DEFAULT_SCORING_CONFIG, organizationId: activeOrganizationId || '' };
  const scores = calculatePlayerScores(innings, effectiveConfig, team1, team2);

  const teamsFromScores = Array.from(new Set(scores.map(s => s.team).filter(t => t && t !== 'Unknown')));
  const teams = teamsFromScores.length > 0 ? teamsFromScores : [team1, team2].filter(Boolean);

  const top = getTopPlayers(scores);
  const byTeam = getTopPlayersByTeam(scores, teams);

  return (
    <div className="space-y-6">
      {/* Formula reference row */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowFormula(v => !v)}
          className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
        >
          <Settings className="h-3.5 w-3.5" />
          {showFormula ? 'Hide scoring formula' : 'View scoring formula'}
          {config?.seriesId && (
            <span className="ml-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">Series model</span>
          )}
        </button>
        <Link href="/admin/scoring-config">
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7 px-2">
            <Settings className="mr-1.5 h-3 w-3" /> Edit Formula
          </Button>
        </Link>
      </div>

      {/* Read-only formula */}
      {showFormula && (
        <Card className="bg-muted/30">
          <CardContent className="pt-4">
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div>
                <p className="font-medium text-blue-700 mb-2">Batting</p>
                <div className="space-y-1 text-muted-foreground">
                  <p>Runs × {effectiveConfig.batting.runsMultiplier}</p>
                  <p>4s × {effectiveConfig.batting.foursMultiplier}</p>
                  <p>6s × {effectiveConfig.batting.sixesMultiplier}</p>
                  <p>SR&gt;200: +{effectiveConfig.batting.srBonus200}</p>
                  <p>SR&gt;150: +{effectiveConfig.batting.srBonus150}</p>
                  <p>SR&gt;100: +{effectiveConfig.batting.srBonus100}</p>
                  <p>SR&lt;50: {effectiveConfig.batting.srPenaltySub50}</p>
                </div>
              </div>
              <div>
                <p className="font-medium text-green-700 mb-2">Bowling</p>
                <div className="space-y-1 text-muted-foreground">
                  <p>Wickets × {effectiveConfig.bowling.wicketsMultiplier}</p>
                  <p>Dots × {effectiveConfig.bowling.dotsMultiplier}</p>
                  <p>Econ&lt;4: +{effectiveConfig.bowling.econBonus4}</p>
                  <p>Econ&lt;6: +{effectiveConfig.bowling.econBonus6}</p>
                  <p>Econ&gt;8: {effectiveConfig.bowling.econPenalty8}</p>
                  <p>Wides × {effectiveConfig.bowling.widesMultiplier}</p>
                  <p>No-balls × {effectiveConfig.bowling.noballsMultiplier}</p>
                </div>
              </div>
              <div>
                <p className="font-medium text-purple-700 mb-2">Fielding</p>
                <div className="space-y-1 text-muted-foreground">
                  <p>Catches × {effectiveConfig.fielding.catchesMultiplier}</p>
                  <p>Run Outs × {effectiveConfig.fielding.runOutsMultiplier}</p>
                  <p>Stumpings × {effectiveConfig.fielding.stumpingsMultiplier}</p>
                  <p>Keeper Ct × {effectiveConfig.fielding.keeperCatchesMultiplier}</p>
                  <p>Byes × {effectiveConfig.fielding.byesMultiplier}</p>
                </div>
              </div>
              <div className="col-span-3 border-t pt-2 mt-1">
                <p className="font-medium text-yellow-700 mb-1">Coach Top Rating</p>
                <p className="text-xs text-muted-foreground">
                  Per mention × {effectiveConfig.coachTopRatingPerMention ?? 15} (max 3 mentions = {((effectiveConfig.coachTopRatingPerMention ?? 15) * 3)} pts)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="combined">
        <TabsList>
          <TabsTrigger value="combined">Combined</TabsTrigger>
          {teams.map(t => <TabsTrigger key={t} value={t}>{t}</TabsTrigger>)}
        </TabsList>

        {/* Combined */}
        <TabsContent value="combined" className="mt-4 space-y-6">
          <TopThreeSection title="Top Players" players={top.overall} />
          <div className="grid md:grid-cols-3 gap-6">
            <TopThreeSection title="Top Batters" players={top.batters} scoreType="batting" />
            <TopThreeSection title="Top Bowlers" players={top.bowlers} scoreType="bowling" />
            <TopThreeSection title="Top Fielders" players={top.fielders} scoreType="fielding" />
          </div>

          {/* Full scores table */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">All Player Scores</h4>
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2.5 font-medium">Player</th>
                    <th className="p-2.5 font-medium text-center">Team</th>
                    <th className="p-2.5 font-medium text-right">Bat</th>
                    <th className="p-2.5 font-medium text-right">Bowl</th>
                    <th className="p-2.5 font-medium text-right">Field</th>
                    <th className="p-2.5 font-medium text-right font-bold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {scores.map((p, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                      <td className="p-2.5 font-medium">{p.name}</td>
                      <td className="p-2.5 text-center text-muted-foreground text-xs">{p.team}</td>
                      <td className="p-2.5 text-right text-blue-600">{p.battingScore || '-'}</td>
                      <td className="p-2.5 text-right text-green-600">{p.bowlingScore || '-'}</td>
                      <td className="p-2.5 text-right text-purple-600">{p.fieldingScore || '-'}</td>
                      <td className="p-2.5 text-right font-bold text-primary">{p.totalScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Per team */}
        {byTeam.map(({ team, overall, batters, bowlers, fielders }) => (
          <TabsContent key={team} value={team} className="mt-4 space-y-6">
            <TopThreeSection title={`Top Players — ${team}`} players={overall} />
            <div className="grid md:grid-cols-3 gap-6">
              <TopThreeSection title="Top Batters" players={batters} scoreType="batting" />
              <TopThreeSection title="Top Bowlers" players={bowlers} scoreType="bowling" />
              <TopThreeSection title="Top Fielders" players={fielders} scoreType="fielding" />
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
