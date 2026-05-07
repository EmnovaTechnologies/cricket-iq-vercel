'use client';

/**
 * FILE: src/app/mobile/scorecard-report/[id]/page.tsx
 *
 * Mobile-optimised match report page for selectors.
 * Wraps the existing MatchReportTab with swipe navigation
 * between all assigned scorecards.
 */

import { useState, useEffect, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { getScorecardByIdAction } from '@/lib/actions/scorecard-actions';
import { getSelectorAssignedScorecardIdsAction } from '@/lib/actions/selector-mobile-action';
import { MatchReportTab } from '@/components/match-report-tab';
import { buildPlayersByTeam } from '@/components/scorecards/innings-view';
import type { MatchScorecard, ScorecardSelectorAssignment } from '@/types';
import { Loader2, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

function MobileScorecardReportInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { currentUser, userProfile, activeOrganizationId, activeOrganizationDetails } = useAuth();
  const { toast } = useToast();

  const [scorecard, setScorecard] = useState<MatchScorecard | null>(null);
  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Swipe handling
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => setTouchStart(e.touches[0].clientX);
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const diff = touchStart - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0 && currentIndex < assignedIds.length - 1) navigateTo(currentIndex + 1);
      else if (diff < 0 && currentIndex > 0) navigateTo(currentIndex - 1);
    }
    setTouchStart(null);
  };

  const navigateTo = (index: number) => {
    if (index < 0 || index >= assignedIds.length) return;
    setCurrentIndex(index);
    router.replace(`/mobile/scorecard-report/${assignedIds[index]}`);
  };

  // Load assigned IDs + current scorecard
  useEffect(() => {
    if (!currentUser || !activeOrganizationId) return;
    setIsLoading(true);

    getSelectorAssignedScorecardIdsAction(currentUser.uid, activeOrganizationId).then(ids => {
      setAssignedIds(ids);
      const idx = ids.indexOf(params.id);
      setCurrentIndex(idx >= 0 ? idx : 0);
    });
  }, [currentUser, activeOrganizationId, params.id]);

  useEffect(() => {
    if (!params.id) return;
    setIsLoading(true);
    getScorecardByIdAction(params.id).then(res => {
      setScorecard(res.scorecard || null);
      setIsLoading(false);
    });
  }, [params.id]);

  if (isLoading || !scorecard) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isAssignedSelector = (scorecard.selectorAssignments || []).some(
    (a: ScorecardSelectorAssignment) => a.selectorUid === currentUser?.uid
  );

  return (
    <div
      className="min-h-screen bg-background"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top nav bar */}
      <div className="sticky top-0 z-10 bg-background border-b px-3 py-2 flex items-center gap-3">
        <Link href="/" className="shrink-0">
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">
            {scorecard.team1} vs {scorecard.team2}
          </div>
          <div className="text-xs text-muted-foreground">{scorecard.date}</div>
        </div>
        {assignedIds.length > 1 && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => navigateTo(currentIndex - 1)}
              disabled={currentIndex === 0}
              className="w-7 h-7 flex items-center justify-center rounded border disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-muted-foreground px-1">
              {currentIndex + 1}/{assignedIds.length}
            </span>
            <button
              onClick={() => navigateTo(currentIndex + 1)}
              disabled={currentIndex === assignedIds.length - 1}
              className="w-7 h-7 flex items-center justify-center rounded border disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Dot indicators */}
      {assignedIds.length > 1 && (
        <div className="flex justify-center gap-1.5 py-2">
          {assignedIds.map((_, i) => (
            <div
              key={i}
              onClick={() => navigateTo(i)}
              className={`rounded-full cursor-pointer transition-all ${
                i === currentIndex ? 'w-2 h-2 bg-primary' : 'w-1.5 h-1.5 bg-border'
              }`}
            />
          ))}
        </div>
      )}

      {/* Match report tab — full width, no extra chrome */}
      <div className="px-3 pb-6">
        <MatchReportTab
          gameId={scorecard.linkedGameId || scorecard.id}
          scorecardId={scorecard.id}
          organizationId={scorecard.organizationId}
          seriesId={scorecard.seriesId}
          team1={scorecard.team1}
          team2={scorecard.team2}
          playersByTeam={buildPlayersByTeam(scorecard)}
          isAssignedSelector={isAssignedSelector}
          selectorAssignments={scorecard.selectorAssignments || []}
          availableSelectors={[]}
          selectorReportScope={activeOrganizationDetails?.selectorReportScope}
          scorecardMode={true}
        />
      </div>

      {/* Swipe hint */}
      {assignedIds.length > 1 && (
        <div className="text-center text-xs text-muted-foreground py-3 flex items-center justify-center gap-1">
          <ChevronLeft className="h-3 w-3" />
          Swipe to navigate scorecards
          <ChevronRight className="h-3 w-3" />
        </div>
      )}
    </div>
  );
}

export default function MobileScorecardReportPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <MobileScorecardReportInner />
    </Suspense>
  );
}
