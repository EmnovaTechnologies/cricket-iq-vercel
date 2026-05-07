'use client';

/**
 * FILE: src/app/mobile/camp-assessment/[campId]/page.tsx
 *
 * Mobile-optimised camp assessment page for selectors.
 * Wraps CampTabContent with swipe navigation between assigned camps,
 * defaulting to the Assessment tab.
 */

import { useState, useEffect, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import {
  getCampByIdAction, getCampPlayersAction,
  getCampAssessmentsAction, getCampFitnessResultsAction,
} from '@/lib/actions/camp-actions';
import { getSelectorAssignedCampIdsAction } from '@/lib/actions/selector-mobile-action';
import { CampTabContent } from '@/components/camp/camp-tab-content';
import type { SelectionCamp, CampPlayer, CampAssessment, CampFitnessResult } from '@/types';
import { Loader2, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

function MobileCampAssessmentInner() {
  const params = useParams<{ campId: string }>();
  const router = useRouter();
  const { currentUser, activeOrganizationId } = useAuth();

  const [camp, setCamp] = useState<SelectionCamp | null>(null);
  const [campPlayers, setCampPlayers] = useState<CampPlayer[]>([]);
  const [campAssessments, setCampAssessments] = useState<CampAssessment[]>([]);
  const [campFitness, setCampFitness] = useState<CampFitnessResult[]>([]);
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
    router.replace(`/mobile/camp-assessment/${assignedIds[index]}`);
  };

  // Load assigned IDs
  useEffect(() => {
    if (!currentUser || !activeOrganizationId) return;
    getSelectorAssignedCampIdsAction(currentUser.uid, activeOrganizationId).then(ids => {
      setAssignedIds(ids);
      const idx = ids.indexOf(params.campId);
      setCurrentIndex(idx >= 0 ? idx : 0);
    });
  }, [currentUser, activeOrganizationId, params.campId]);

  // Load camp data
  useEffect(() => {
    if (!params.campId || !activeOrganizationId) return;
    setIsLoading(true);
    Promise.all([
      getCampByIdAction(params.campId),
      getCampPlayersAction(params.campId),
      getCampAssessmentsAction(params.campId),
      getCampFitnessResultsAction(params.campId),
    ]).then(([campRes, playersRes, assessRes, fitnessRes]) => {
      setCamp(campRes.camp || null);
      setCampPlayers(playersRes.players || []);
      setCampAssessments(assessRes.assessments || []);
      setCampFitness(fitnessRes.results || []);
      setIsLoading(false);
    });
  }, [params.campId, activeOrganizationId]);

  if (isLoading || !camp) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-background"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top nav bar */}
      <div className="sticky top-0 z-10 bg-background border-b px-3 py-2 flex items-center gap-3">
        <Link href="/selector" className="shrink-0">
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{camp.name}</div>
          <div className="text-xs text-muted-foreground capitalize">{camp.status}{camp.venue ? ` · ${camp.venue}` : ''}</div>
        </div>
      </div>

      {/* Swipe navigation bar — matches rate page style */}
      {assignedIds.length > 1 && (
        <div className="flex items-center gap-2 px-3 py-2 border-b">
          <button
            onClick={() => navigateTo(currentIndex - 1)}
            disabled={currentIndex === 0}
            className="h-10 w-10 rounded-full border flex items-center justify-center shrink-0 disabled:opacity-30 hover:bg-muted transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 flex flex-col items-center gap-1">
            <span className="text-xs text-muted-foreground">
              {currentIndex + 1} of {assignedIds.length} camps
            </span>
            <div className="flex gap-1.5">
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
          </div>
          <button
            onClick={() => navigateTo(currentIndex + 1)}
            disabled={currentIndex === assignedIds.length - 1}
            className="h-10 w-10 rounded-full border flex items-center justify-center shrink-0 disabled:opacity-30 hover:bg-muted transition-colors"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Camp tab content — default to assessment tab */}
      <div className="px-3 pb-6">
        <CampTabContent
          camp={camp}
          seriesId={camp.seriesId}
          navParam=""
          initialPlayers={campPlayers}
          initialAssessments={campAssessments}
          initialFitness={campFitness}
          defaultTab="assessment"
          isMobile={true}
        />
      </div>

      {assignedIds.length > 1 && (
        <p className="text-center text-xs text-muted-foreground py-3">← swipe to navigate →</p>
      )}
    </div>
  );
}

export default function MobileCampAssessmentPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <MobileCampAssessmentInner />
    </Suspense>
  );
}
