'use client';

/**
 * FILE: src/components/selector-mobile-landing.tsx
 *
 * Mobile-only landing page for selectors. Shows next pending item per section:
 * - Games to rate (rating/hybrid orgs)
 * - Match reports (performance/hybrid orgs)
 * - Camp assessments
 *
 * Tapping a game → /rate/[gameId]
 * Tapping a scorecard → /mobile/scorecard-report/[id]
 * Tapping a camp → /mobile/camp-assessment/[campId]
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSelectorMobilePendingAction } from '@/lib/actions/selector-mobile-action';
import type { SelectorPendingGame, SelectorPendingScorecard, SelectorPendingCamp } from '@/lib/actions/selector-mobile-action';
import { Loader2, ChevronRight, CheckCircle, Clock } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface Props {
  selectorUid: string;
  organizationId: string;
  selectionModel: string;
  displayName: string;
}

function formatGameDate(date: string): string {
  try { return format(parseISO(date), 'MMM d'); } catch { return date; }
}

function PendingDot() {
  return <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#EF9F27', flexShrink: 0 }} />;
}

function DoneBadge() {
  return (
    <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 6px', borderRadius: 8, background: '#EAF3DE', color: '#3B6D11' }}>
      Done
    </span>
  );
}

function ActionCard({
  iconBg, icon, title, meta, isPending, onClick,
}: {
  iconBg: string; icon: React.ReactNode; title: string; meta: string;
  isPending: boolean; onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px',
        background: 'var(--color-background-primary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--border-radius-lg)',
        cursor: 'pointer',
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: iconBg, display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>{meta}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {isPending ? <PendingDot /> : <DoneBadge />}
        <ChevronRight style={{ width: 14, height: 14, color: 'var(--color-text-tertiary)' }} />
      </div>
    </div>
  );
}

function SectionHeader({ title, moreCount }: { title: string; moreCount: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>{title}</span>
      {moreCount > 0 && (
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>+{moreCount} more</span>
      )}
    </div>
  );
}

function Divider() {
  return <div style={{ height: '0.5px', background: 'var(--color-border-tertiary)', margin: '12px 0' }} />;
}

export function SelectorMobileLanding({ selectorUid, organizationId, selectionModel, displayName }: Props) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [games, setGames] = useState<SelectorPendingGame[]>([]);
  const [scorecards, setScorecards] = useState<SelectorPendingScorecard[]>([]);
  const [camps, setCamps] = useState<SelectorPendingCamp[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);

  const showGames = selectionModel === 'rating' || selectionModel === 'hybrid';
  const showScorecards = selectionModel === 'performance' || selectionModel === 'hybrid';

  useEffect(() => {
    getSelectorMobilePendingAction(selectorUid, organizationId, selectionModel).then(res => {
      if (res.success) {
        // Sort: pending first, then done
        setGames([...res.games].sort((a, b) => (a.isRated ? 1 : 0) - (b.isRated ? 1 : 0)));
        setScorecards([...res.scorecards].sort((a, b) => (a.hasReport ? 1 : 0) - (b.hasReport ? 1 : 0)));
        setCamps([...res.camps].sort((a, b) => (a.pendingCount > 0 ? 0 : 1) - (b.pendingCount > 0 ? 0 : 1)));
        setPendingTotal(res.pendingTotal);
      }
      setIsLoading(false);
    });
  }, [selectorUid, organizationId, selectionModel]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = displayName?.split(' ')[0] || 'there';

  // First name from displayName
  const nextGame = games[0];
  const nextScorecard = scorecards[0];
  const nextCamp = camps[0];

  const allDone = pendingTotal === 0 && !isLoading;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem 0', gap: 8 }}>
        <Loader2 style={{ width: 20, height: 20, animation: 'spin 1s linear infinite', color: 'var(--color-text-tertiary)' }} />
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Loading your tasks...</span>
      </div>
    );
  }

  return (
    <div style={{ padding: '0.5rem 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 500 }}>{greeting}, {firstName}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 3 }}>Selector</div>
        </div>
        {pendingTotal > 0 ? (
          <div style={{
            fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 20,
            background: '#FAEEDA', color: '#854F0B',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <Clock style={{ width: 11, height: 11 }} />
            {pendingTotal} pending
          </div>
        ) : (
          <div style={{
            fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 20,
            background: '#EAF3DE', color: '#3B6D11',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <CheckCircle style={{ width: 11, height: 11 }} />
            All done
          </div>
        )}
      </div>

      {/* All done state */}
      {allDone && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 14px',
          background: 'var(--color-background-secondary)',
          borderRadius: 'var(--border-radius-lg)',
          fontSize: 13, color: 'var(--color-text-secondary)',
        }}>
          <CheckCircle style={{ width: 16, height: 16, color: '#639922', flexShrink: 0 }} />
          All ratings, reports and assessments are up to date.
        </div>
      )}

      {/* Games section */}
      {showGames && games.length > 0 && (
        <>
          <SectionHeader
            title="Next game to rate"
            moreCount={games.length - 1}
          />
          {nextGame && (
            <ActionCard
              iconBg="#E6F1FB"
              icon={
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="3" width="14" height="10" rx="2" stroke="#185FA5" strokeWidth="1.3"/>
                  <path d="M5 8h2M6 7v2M10 8h2" stroke="#185FA5" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              }
              title={`${nextGame.team1} vs ${nextGame.team2}`}
              meta={`${formatGameDate(nextGame.date)}${nextGame.seriesName ? ` · ${nextGame.seriesName}` : ''}`}
              isPending={!nextGame.isRated}
              onClick={() => router.push(`/rate/${nextGame.gameId}?uid=${selectorUid}`)}
            />
          )}
          {showScorecards && <Divider />}
        </>
      )}

      {/* Scorecards / Match reports section */}
      {showScorecards && scorecards.length > 0 && (
        <>
          <SectionHeader
            title="Next match report"
            moreCount={scorecards.length - 1}
          />
          {nextScorecard && (
            <ActionCard
              iconBg="#E1F5EE"
              icon={
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M4 1h8a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z" stroke="#0F6E56" strokeWidth="1.3"/>
                  <path d="M5 5h6M5 8h4" stroke="#0F6E56" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              }
              title={`${nextScorecard.team1} vs ${nextScorecard.team2}`}
              meta={`${formatGameDate(nextScorecard.date)}${nextScorecard.seriesName ? ` · ${nextScorecard.seriesName}` : ''} · ${nextScorecard.hasReport ? 'Submitted' : 'Not submitted'}`}
              isPending={!nextScorecard.hasReport}
              onClick={() => router.push(`/mobile/scorecard-report/${nextScorecard.scorecardId}`)}
            />
          )}
          {camps.length > 0 && <Divider />}
        </>
      )}

      {/* Camps section */}
      {camps.length > 0 && (
        <>
          <SectionHeader
            title="Next camp assessment"
            moreCount={camps.length - 1}
          />
          {nextCamp && (
            <ActionCard
              iconBg="#FAEEDA"
              icon={
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1l7 13H1L8 1z" stroke="#854F0B" strokeWidth="1.3" strokeLinejoin="round"/>
                </svg>
              }
              title={nextCamp.campName}
              meta={nextCamp.pendingCount > 0
                ? `${nextCamp.pendingCount} player${nextCamp.pendingCount !== 1 ? 's' : ''} not yet assessed`
                : 'All players assessed'}
              isPending={nextCamp.pendingCount > 0}
              onClick={() => router.push(`/mobile/camp-assessment/${nextCamp.campId}`)}
            />
          )}
        </>
      )}

      {/* Empty state — assigned but nothing showing */}
      {!allDone && games.length === 0 && scorecards.length === 0 && camps.length === 0 && (
        <div style={{
          fontSize: 13, color: 'var(--color-text-tertiary)',
          padding: '16px', textAlign: 'center',
          background: 'var(--color-background-secondary)',
          borderRadius: 'var(--border-radius-lg)',
        }}>
          No assignments found for your account yet.
        </div>
      )}
    </div>
  );
}
