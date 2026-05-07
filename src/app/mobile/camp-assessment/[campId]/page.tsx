'use client';

/**
 * FILE: src/app/mobile/camp-assessment/[campId]/page.tsx
 *
 * Mobile entry point for camp assessment.
 * Loads the camp to get seriesId, then redirects directly to
 * the existing assess scratchpad page which is already mobile-friendly.
 * Shows swipe navigation between assigned camps via arrow buttons.
 */

import { useState, useEffect, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { getCampByIdAction } from '@/lib/actions/camp-actions';
import { getSelectorAssignedCampIdsAction } from '@/lib/actions/selector-mobile-action';
import { Loader2, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { SelectionCamp } from '@/types';

function MobileCampAssessmentInner() {
  const params = useParams<{ campId: string }>();
  const router = useRouter();
  const { currentUser, activeOrganizationId } = useAuth();

  const [camp, setCamp] = useState<SelectionCamp | null>(null);
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

  useEffect(() => {
    if (!currentUser || !activeOrganizationId) return;
    getSelectorAssignedCampIdsAction(currentUser.uid, activeOrganizationId).then(ids => {
      setAssignedIds(ids);
      const idx = ids.indexOf(params.campId);
      setCurrentIndex(idx >= 0 ? idx : 0);
    });
  }, [currentUser, activeOrganizationId, params.campId]);

  useEffect(() => {
    if (!params.campId) return;
    getCampByIdAction(params.campId).then(res => {
      setCamp(res.camp || null);
      setIsLoading(false);
    });
  }, [params.campId]);

  // Once camp loaded, redirect to assess page
  useEffect(() => {
    if (!isLoading && camp) {
      router.replace(`/rate-camp/${camp.id}?from=selector`);
    }
  }, [isLoading, camp, router]);

  // While loading show spinner with back button
  return (
    <div
      className="min-h-screen bg-background flex flex-col max-w-lg mx-auto"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top nav */}
      <div className="bg-primary text-primary-foreground px-4 py-2.5 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Link href="/selector" className="opacity-80 hover:opacity-100 -ml-1">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <p className="text-xs font-medium flex-1 truncate">
            {camp?.name || 'Camp Assessment'}
          </p>
        </div>
      </div>

      {/* Swipe nav */}
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

      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading assessment...</p>
        </div>
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
