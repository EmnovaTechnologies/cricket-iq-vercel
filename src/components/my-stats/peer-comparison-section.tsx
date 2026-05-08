'use client';

/**
 * FILE: src/components/my-stats/peer-comparison-section.tsx
 *
 * Shows how the player compares to top 5 peers in their primary skill group.
 * Tabs: Bowling / Batting / Fielding
 * Each tab shows all metrics for that discipline, each ranked independently.
 * Fully anonymous — no names, no initials.
 */

import { useState, useEffect } from 'react';
import { getPeerComparisonAction } from '@/lib/actions/player-stats-action';
import type { PeerPlayerStats } from '@/lib/actions/player-stats-action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  playerId: string;
  seriesId: string;
  organizationId: string;
}

// ─── Bar chart row ────────────────────────────────────────────────────────────

function BarRow({
  label, value, maxValue, isYou, lowerIsBetter,
}: {
  label: string; value: number; maxValue: number;
  isYou: boolean; lowerIsBetter?: boolean;
}) {
  const pct = maxValue > 0 ? Math.round((value / maxValue) * 100) : 0;
  const youColor = lowerIsBetter ? '#0F6E56' : '#185FA5';
  const peerColor = lowerIsBetter ? '#9FE1CB' : '#B5D4F4';

  return (
    <div className={cn('flex items-center gap-2', isYou && 'font-medium')}>
      <span className="text-xs w-12 text-right shrink-0"
        style={{ color: isYou ? youColor : 'var(--color-text-secondary)' }}>
        {label}
      </span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(pct, 100)}%`, background: isYou ? youColor : peerColor }}
        />
      </div>
      <span className="text-xs w-8 text-right shrink-0"
        style={{ color: isYou ? youColor : 'var(--color-text-secondary)' }}>
        {value}
      </span>
    </div>
  );
}

// ─── Single metric block ──────────────────────────────────────────────────────

function MetricBlock({
  title, peers, getValue, lowerIsBetter,
}: {
  title: string;
  peers: PeerPlayerStats[];
  getValue: (p: PeerPlayerStats) => number;
  lowerIsBetter?: boolean;
}) {
  const sorted = [...peers].sort((a, b) =>
    lowerIsBetter ? getValue(a) - getValue(b) : getValue(b) - getValue(a)
  );
  const maxVal = Math.max(...sorted.map(p => getValue(p)), 1);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <span className={cn(
          'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
          lowerIsBetter ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'
        )}>
          {lowerIsBetter ? 'lower better' : 'higher better'}
        </span>
      </div>
      {sorted.map((p, i) => (
        <BarRow
          key={i}
          label={p.isCurrentPlayer ? 'You' : `P${i + 1}`}
          value={getValue(p)}
          maxValue={maxVal}
          isYou={p.isCurrentPlayer}
          lowerIsBetter={lowerIsBetter}
        />
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const TABS = ['Bowling', 'Batting', 'Fielding'] as const;
type Tab = typeof TABS[number];

export function PeerComparisonSection({ playerId, seriesId, organizationId }: Props) {
  const [isLoading, setIsLoading] = useState(true);
  const [peers, setPeers] = useState<PeerPlayerStats[]>([]);
  const [primarySkill, setPrimarySkill] = useState('');
  const [currentPlayerRank, setCurrentPlayerRank] = useState(0);
  const [activeTab, setActiveTab] = useState<Tab>('Bowling');

  useEffect(() => {
    if (!playerId || !seriesId || !organizationId) return;
    setIsLoading(true);
    getPeerComparisonAction(playerId, seriesId, organizationId).then(res => {
      if (res.success) {
        setPeers(res.peers);
        setPrimarySkill(res.primarySkill);
        setCurrentPlayerRank(res.currentPlayerRank);
        // Default to tab matching primary skill
        if (res.primarySkill.toLowerCase().includes('bowl')) setActiveTab('Bowling');
        else if (res.primarySkill.toLowerCase().includes('bat')) setActiveTab('Batting');
        else setActiveTab('Bowling');
      }
      setIsLoading(false);
    });
  }, [playerId, seriesId, organizationId]);

  if (!isLoading && peers.length < 2) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          How I compare
          {primarySkill && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 ml-auto">
              {primarySkill} peer group
            </span>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Top {peers.length} {primarySkill.toLowerCase()} players in this series · anonymous · each metric ranked independently
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading peer data...
          </div>
        ) : (
          <>
            {/* Rank indicator */}
            {currentPlayerRank > 0 && (
              <div className="text-xs text-muted-foreground mb-3">
                Your overall rank in peer group:{' '}
                <span className="font-medium text-primary">#{currentPlayerRank}</span>
                {' '}of {peers.length} {primarySkill.toLowerCase()} players
              </div>
            )}

            {/* Tabs */}
            <div className="flex border-b mb-4">
              {TABS.map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    'text-xs font-medium px-4 py-2 border-b-2 transition-colors',
                    activeTab === tab
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Bowling tab */}
            {activeTab === 'Bowling' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <MetricBlock title="Wickets" peers={peers} getValue={p => p.wickets} />
                <MetricBlock title="Overs bowled" peers={peers} getValue={p => p.overs} />
                <MetricBlock title="Economy" peers={peers} getValue={p => p.economy} lowerIsBetter />
                <MetricBlock title="Bowling strike rate" peers={peers} getValue={p => p.bowlingSR} lowerIsBetter />
              </div>
            )}

            {/* Batting tab */}
            {activeTab === 'Batting' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <MetricBlock title="Runs" peers={peers} getValue={p => p.runs} />
                <MetricBlock title="Strike rate" peers={peers} getValue={p => p.strikeRate} />
                <MetricBlock title="Avg runs/game" peers={peers} getValue={p => p.avgRunsPerGame} />
                <MetricBlock title="Boundaries (4s+6s)" peers={peers} getValue={p => p.boundaries} />
              </div>
            )}

            {/* Fielding tab */}
            {activeTab === 'Fielding' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <MetricBlock title="Catches" peers={peers} getValue={p => p.catches} />
                <MetricBlock title="Run outs" peers={peers} getValue={p => p.runOuts} />
                <MetricBlock title="Total dismissals" peers={peers} getValue={p => p.totalDismissals} />
              </div>
            )}

            <p className="text-[10px] text-muted-foreground mt-4">
              Blue = you (higher better) · Green = you (lower better) · P1–P{peers.filter(p => !p.isCurrentPlayer).length} = anonymous peers
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
