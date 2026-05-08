'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { getPlayerStatsAction } from '@/lib/actions/player-stats-action';
import type { PlayerStatsResult } from '@/lib/actions/player-stats-action';
import { Loader2, AlertTriangle, Lock, CreditCard } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { StatsSection } from '@/components/my-stats/stats-section';
import { BenchmarkSection } from '@/components/my-stats/benchmark-section';
import { PeerComparisonSection } from '@/components/my-stats/peer-comparison-section';
import { FeedbackSection } from '@/components/my-stats/feedback-section';
import { CampSection } from '@/components/my-stats/camp-section';
import { AiPlanSection } from '@/components/my-stats/ai-plan-section';
import { getPlayerPaymentStatusAction } from '@/lib/actions/registration-payment-action';
import Link from 'next/link';

export default function MyStatsPage() {
  const { userProfile, isAuthLoading, activeOrganizationId } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState<PlayerStatsResult | null>(null);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPaid, setIsPaid] = useState<boolean | null>(null); // null = checking

  const isPlayer = userProfile?.roles?.includes('player');
  const playerId = userProfile?.playerId;

  // Redirect non-players
  useEffect(() => {
    if (!isAuthLoading && (!isPlayer || !playerId)) {
      router.push('/');
    }
  }, [isAuthLoading, isPlayer, playerId, router]);

  // Check payment status
  useEffect(() => {
    if (!playerId) return;
    getPlayerPaymentStatusAction(playerId).then(status => {
      setIsPaid(status.isPaid || status.isWaived);
    }).catch(() => setIsPaid(true)); // fail open
  }, [playerId]);

  // Load stats when series changes
  const loadStats = useCallback(async (seriesId: string) => {
    if (!playerId || !activeOrganizationId || !seriesId) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await getPlayerStatsAction(playerId, activeOrganizationId, seriesId);
      if (!result.success) {
        setError(result.error || 'Failed to load stats.');
      } else {
        setStats(result);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load stats.');
    } finally {
      setIsLoading(false);
    }
  }, [playerId, activeOrganizationId]);

  // Load available series on mount, default to first
  useEffect(() => {
    if (!playerId || !activeOrganizationId) return;
    // Load with empty series first just to get available series list
    getPlayerStatsAction(playerId, activeOrganizationId, '__none__').then(result => {
      if (result.availableSeries.length > 0) {
        const firstId = result.availableSeries[0].id;
        setSelectedSeriesId(firstId);
        setStats(result); // save series list
        loadStats(firstId);
      } else {
        setStats(result);
        setIsLoading(false);
      }
    });
  }, [playerId, activeOrganizationId, loadStats]);

  if (isAuthLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!isPlayer || !playerId) return null;

  // Payment gate
  if (isPaid === null) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!isPaid) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-6">
        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
            <Lock className="h-10 w-10 text-muted-foreground" />
          </div>
        </div>
        <div>
          <h1 className="text-2xl font-headline font-bold text-primary">Registration Required</h1>
          <p className="text-muted-foreground mt-2">
            Complete your series registration to unlock your stats dashboard.
          </p>
        </div>
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start gap-3 text-left">
              <CreditCard className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">Complete Registration</p>
                <p className="text-xs text-muted-foreground">
                  Register for a series to access batting, bowling, fielding stats and your AI improvement plan.
                </p>
              </div>
            </div>
            <Button asChild className="w-full">
              <Link href={`/register-player/${activeOrganizationId}`}>
                Register Now
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const availableSeries = stats?.availableSeries || [];

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-headline font-bold text-primary">My stats</h1>
          {stats && (
            <p className="text-sm text-muted-foreground mt-1">
              {stats.playerName}
              {stats.dominantHandBatting && ` · Bat: ${stats.dominantHandBatting}`}
              {stats.bowlingStyle && ` · Bowl: ${stats.bowlingStyle}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Series</span>
          <Select
            value={selectedSeriesId}
            onValueChange={(val) => {
              setSelectedSeriesId(val);
              loadStats(val);
            }}
            disabled={availableSeries.length === 0 || isLoading}
          >
            <SelectTrigger className="w-[220px] text-sm">
              <SelectValue placeholder={availableSeries.length === 0 ? 'No series found' : 'Select series'} />
            </SelectTrigger>
            <SelectContent>
              {availableSeries.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center items-center py-16">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="ml-3 text-muted-foreground">Loading your stats...</p>
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Could not load stats</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* No series */}
      {!isLoading && !error && availableSeries.length === 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No data yet</AlertTitle>
          <AlertDescription>
            Your player profile has not been linked to any scorecards yet. Stats will appear here once your name is linked in the scorecard system.
          </AlertDescription>
        </Alert>
      )}

      {/* No games in selected series */}
      {!isLoading && !error && stats && availableSeries.length > 0 && stats.gameStats.length === 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No appearances in this series</AlertTitle>
          <AlertDescription>
            No scorecard data found for you in this series. Try selecting a different series.
          </AlertDescription>
        </Alert>
      )}

      {/* Stats sections */}
      {!isLoading && stats && stats.gameStats.length > 0 && (
        <>
          <StatsSection stats={stats} />
          <BenchmarkSection benchmarks={stats.benchmarks} />
          <PeerComparisonSection
            playerId={playerId || ''}
            seriesId={selectedSeriesId}
            organizationId={activeOrganizationId || ''}
          />
          <FeedbackSection feedback={stats.feedback} />
          <CampSection campPerformance={stats.campPerformance} />
          <AiPlanSection stats={stats} playerId={playerId || ''} seriesId={selectedSeriesId} organizationId={activeOrganizationId || ''} />
        </>
      )}

    </div>
  );
}
