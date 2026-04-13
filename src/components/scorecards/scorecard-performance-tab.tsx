'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Trophy, Settings, Medal } from 'lucide-react';
import { getScoringConfigAction, saveScoringConfigAction } from '@/lib/actions/scoring-config-actions';
import { calculatePlayerScores, getTopPlayers, getTopPlayersByTeam } from '@/lib/utils/scorecard-scoring-engine';
import type { ScorecardInnings, ScorecardScoringConfig, PlayerScore } from '@/types';
import { DEFAULT_SCORING_CONFIG } from '@/types';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { cn } from '@/lib/utils';

interface PerformanceTabProps {
  innings: ScorecardInnings[];
  team1: string;
  team2: string;
}

// ─── Medal colors ─────────────────────────────────────────────────────────────
const medalColors = ['text-yellow-500', 'text-gray-400', 'text-amber-600'];
const medalLabels = ['1st', '2nd', '3rd'];

// ─── Player Score Card ────────────────────────────────────────────────────────
function PlayerScoreCard({ player, rank }: { player: PlayerScore; rank: number }) {
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
          <Badge variant="outline" className="shrink-0 font-bold">{player.totalScore} pts</Badge>
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
function TopThreeSection({ title, players }: { title: string; players: PlayerScore[] }) {
  if (!players.length) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
        <Trophy className="h-3.5 w-3.5" /> {title}
      </h4>
      <div className="space-y-2">
        {players.map((p, i) => <PlayerScoreCard key={p.name} player={p} rank={i} />)}
      </div>
    </div>
  );
}

// ─── Scoring Config Editor ────────────────────────────────────────────────────
function ScoringConfigEditor({
  config,
  onSave,
  isSaving,
}: {
  config: ScorecardScoringConfig;
  onSave: (config: ScorecardScoringConfig) => void;
  isSaving: boolean;
}) {
  const [local, setLocal] = useState(config);

  useEffect(() => setLocal(config), [config]);

  const num = (val: any) => parseFloat(val) || 0;

  const field = (
    section: 'batting' | 'bowling' | 'fielding',
    key: string,
    label: string,
    hint?: string
  ) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        step="0.5"
        className="h-8 text-sm"
        value={(local[section] as any)[key]}
        onChange={e => setLocal(prev => ({
          ...prev,
          [section]: { ...(prev[section] as any), [key]: num(e.target.value) }
        }))}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Batting */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-blue-700 border-b border-blue-200 pb-1">Batting</h4>
          {field('batting', 'runsMultiplier', 'Runs ×', 'Points per run')}
          {field('batting', 'foursMultiplier', '4s ×')}
          {field('batting', 'sixesMultiplier', '6s ×')}
          {field('batting', 'srBonus200', 'SR > 200 bonus')}
          {field('batting', 'srBonus150', 'SR > 150 bonus')}
          {field('batting', 'srBonus100', 'SR > 100 bonus')}
          {field('batting', 'srPenaltySub50', 'SR < 50 penalty', 'Applied if ≥5 balls faced')}
        </div>

        {/* Bowling */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-green-700 border-b border-green-200 pb-1">Bowling</h4>
          {field('bowling', 'wicketsMultiplier', 'Wickets ×')}
          {field('bowling', 'dotsMultiplier', 'Dots ×')}
          {field('bowling', 'econBonus4', 'Econ < 4 bonus')}
          {field('bowling', 'econBonus6', 'Econ < 6 bonus')}
          {field('bowling', 'econPenalty8', 'Econ > 8 penalty')}
          {field('bowling', 'widesMultiplier', 'Wides ×', 'Use negative value')}
          {field('bowling', 'noballsMultiplier', 'No-balls ×', 'Use negative value')}
        </div>

        {/* Fielding */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-purple-700 border-b border-purple-200 pb-1">Fielding</h4>
          {field('fielding', 'catchesMultiplier', 'Catches ×')}
          {field('fielding', 'runOutsMultiplier', 'Run Outs ×')}
          {field('fielding', 'stumpingsMultiplier', 'Stumpings ×')}
          {field('fielding', 'keeperCatchesMultiplier', 'Keeper Catches ×')}
          {field('fielding', 'byesMultiplier', 'Byes ×', 'Use negative value')}
        </div>
      </div>

      <Button onClick={() => onSave(local)} disabled={isSaving} className="w-full sm:w-auto">
        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {isSaving ? 'Saving...' : 'Save Scoring Formula'}
      </Button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function ScorecardPerformanceTab({ innings, team1, team2 }: PerformanceTabProps) {
  const { activeOrganizationId, effectivePermissions } = useAuth();
  const { toast } = useToast();

  const [config, setConfig] = useState<ScorecardScoringConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const canEditConfig = effectivePermissions[PERMISSIONS.ORGANIZATIONS_EDIT_ASSIGNED] ||
    effectivePermissions[PERMISSIONS.ORGANIZATIONS_EDIT_ANY];

  useEffect(() => {
    if (!activeOrganizationId) return;
    getScoringConfigAction(activeOrganizationId).then(cfg => {
      setConfig(cfg);
      setIsLoadingConfig(false);
    });
  }, [activeOrganizationId]);

  const handleSaveConfig = async (updated: ScorecardScoringConfig) => {
    setIsSaving(true);
    const res = await saveScoringConfigAction(updated);
    if (res.success) {
      setConfig(updated);
      toast({ title: 'Scoring formula saved' });
      setShowConfig(false);
    } else {
      toast({ title: 'Save failed', description: res.error, variant: 'destructive' });
    }
    setIsSaving(false);
  };

  if (isLoadingConfig) {
    return <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const effectiveConfig = config || { ...DEFAULT_SCORING_CONFIG, organizationId: activeOrganizationId || '' };
  const scores = calculatePlayerScores(innings, effectiveConfig);
  const teams = [team1, team2].filter(Boolean);
  const top = getTopPlayers(scores);
  const byTeam = getTopPlayersByTeam(scores, teams);

  return (
    <div className="space-y-6">
      {/* Config toggle */}
      {canEditConfig && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setShowConfig(v => !v)}>
            <Settings className="mr-2 h-4 w-4" />
            {showConfig ? 'Hide' : 'Edit Scoring Formula'}
          </Button>
        </div>
      )}

      {/* Config editor */}
      {showConfig && config && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4" /> Scoring Formula
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScoringConfigEditor config={config} onSave={handleSaveConfig} isSaving={isSaving} />
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
            <TopThreeSection title="Top Batters" players={top.batters} />
            <TopThreeSection title="Top Bowlers" players={top.bowlers} />
            <TopThreeSection title="Top Fielders" players={top.fielders} />
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
              <TopThreeSection title="Top Batters" players={batters} />
              <TopThreeSection title="Top Bowlers" players={bowlers} />
              <TopThreeSection title="Top Fielders" players={fielders} />
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
