'use client';

import { useState, useEffect } from 'react';
import type { PlayerStatsResult } from '@/lib/actions/player-stats-action';
import {
  generatePlayerAIPlanAction,
  loadImprovementPlanAction,
} from '@/lib/actions/player-ai-plan-action';
import { getPeerComparisonAction } from '@/lib/actions/player-stats-action';
import type { AIPlanSuggestion } from '@/lib/actions/player-ai-plan-action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, RefreshCw } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface Props {
  stats: PlayerStatsResult;
  playerId: string;
  seriesId: string;
  organizationId: string;
}

const impactColors: Record<string, string> = {
  high:   'bg-purple-100 text-purple-800',
  medium: 'bg-blue-100 text-blue-800',
  low:    'bg-muted text-muted-foreground',
};

export function AiPlanSection({ stats, playerId, seriesId, organizationId }: Props) {
  const [suggestions, setSuggestions] = useState<AIPlanSuggestion[] | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load persisted plan from Firestore on mount / series change
  useEffect(() => {
    if (!playerId || !seriesId) return;
    setIsLoading(true);
    setSuggestions(null);
    setGeneratedAt(null);
    loadImprovementPlanAction(playerId, seriesId).then(res => {
      if (res.success && res.suggestions) {
        setSuggestions(res.suggestions);
        setGeneratedAt(res.generatedAt || null);
      }
      setIsLoading(false);
    });
  }, [playerId, seriesId]);

  const generate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      // Fetch peer data to enrich the plan
      const peerRes = await getPeerComparisonAction(playerId, seriesId, organizationId);
      const peerData = peerRes.success && peerRes.peers.length >= 2 ? peerRes : undefined;
      const result = await generatePlayerAIPlanAction(stats, playerId, seriesId, peerData);
      if (result.success && result.suggestions) {
        setSuggestions(result.suggestions);
        setGeneratedAt(result.generatedAt || new Date().toISOString());
      } else {
        setError(result.error || 'Failed to generate plan.');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to generate plan.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Improvement plan
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Synthesised from your stats, benchmark position, selector feedback and camp ratings.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        )}

        {!isLoading && !suggestions && !isGenerating && (
          <Button onClick={generate} variant="outline" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Generate my improvement plan
          </Button>
        )}

        {isGenerating && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analysing your performance data...
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {suggestions && !isGenerating && (
          <>
            <div className="space-y-2">
              {suggestions.map(s => (
                <div key={s.rank} className="flex gap-3 items-start p-3 bg-muted rounded-lg">
                  <span className="text-sm font-medium text-muted-foreground w-4 flex-shrink-0 mt-0.5">
                    {s.rank}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-relaxed">{s.suggestion}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${impactColors[s.impact] || impactColors.medium}`}>
                        {s.dimension}
                      </span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${impactColors[s.impact] || impactColors.medium}`}>
                        {s.impact} impact
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-1">
              {generatedAt && (
                <span className="text-xs text-muted-foreground">
                  Generated {format(parseISO(generatedAt), 'MMM d, yyyy h:mm a')}
                </span>
              )}
              <Button onClick={generate} variant="ghost" size="sm" className="gap-2 text-muted-foreground ml-auto" disabled={isGenerating}>
                <RefreshCw className="h-3 w-3" />
                Regenerate
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
