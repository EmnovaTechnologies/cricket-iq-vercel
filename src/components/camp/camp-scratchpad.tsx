'use client';

/**
 * FILE: src/components/camp/camp-scratchpad.tsx
 *
 * Shared scratchpad component for camp assessment.
 * Used by both the assess page (desktop/mobile) and rate-camp page (mobile).
 * Bib-blind — no player names shown.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import {
  submitCampAssessmentAction, updateCampAssessmentAction,
  getMyCampAssessmentsAction,
} from '@/lib/actions/camp-actions';
import type { CampPlayer, CampAssessment, SelectionCamp } from '@/types';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Star, Loader2, Check } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type AssessmentRatings = {
  batting: number; bowling: number; fielding: number;
  fitness: number; attitude: number; overall: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseScratchpad(text: string): Map<number, string> {
  const map = new Map<number, string>();
  const parts = text.split(/(#\d+)/g);
  let currentBib: number | null = null;
  let currentText = '';
  parts.forEach(part => {
    const bibMatch = part.match(/^#(\d+)$/);
    if (bibMatch) {
      if (currentBib !== null && currentText.trim()) {
        const existing = map.get(currentBib) || '';
        map.set(currentBib, existing ? `${existing} / ${currentText.trim()}` : currentText.trim());
      }
      currentBib = parseInt(bibMatch[1]);
      currentText = '';
    } else if (currentBib !== null) {
      currentText += part;
    }
  });
  if (currentBib !== null && currentText.trim()) {
    const existing = map.get(currentBib) || '';
    map.set(currentBib, existing ? `${existing} / ${currentText.trim()}` : currentText.trim());
  }
  return map;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface CampScratchpadProps {
  camp: SelectionCamp;
  campPlayers: CampPlayer[];
  initialAssessments: Map<number, CampAssessment>;
  onAssessmentsUpdated: (updated: Map<number, CampAssessment>) => void;
}

export function CampScratchpad({
  camp, campPlayers, initialAssessments, onAssessmentsUpdated,
}: CampScratchpadProps) {
  const { currentUser, userProfile } = useAuth();
  const { toast } = useToast();

  const [scratchpad, setScratchpad] = useState('');
  const [scratchpadParsed, setScratchpadParsed] = useState<Map<number, string>>(new Map());
  const [scratchpadRatings, setScratchpadRatings] = useState<Map<number, Partial<AssessmentRatings>>>(new Map());
  const [showBibSuggestions, setShowBibSuggestions] = useState(false);
  const [bibSuggestionFilter, setBibSuggestionFilter] = useState('');
  const [isApplying, setIsApplying] = useState(false);

  const storageKey = `scratchpad_${camp.id}`;

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      setScratchpad(saved);
      setScratchpadParsed(parseScratchpad(saved));
    }
  }, [storageKey]);

  const handleChange = (text: string) => {
    setScratchpad(text);
    localStorage.setItem(storageKey, text);
    setScratchpadParsed(parseScratchpad(text));
    const lastChar = text[text.length - 1];
    if (lastChar === '#') {
      setShowBibSuggestions(true);
      setBibSuggestionFilter('');
    } else if (showBibSuggestions) {
      const afterHash = text.split('#').pop() || '';
      if (/^\d*$/.test(afterHash)) {
        setBibSuggestionFilter(afterHash);
      } else {
        setShowBibSuggestions(false);
        setBibSuggestionFilter('');
      }
    }
  };

  const insertBib = (bib: number) => {
    const lastHashIdx = scratchpad.lastIndexOf('#');
    const newText = scratchpad.slice(0, lastHashIdx) + `#${bib} `;
    setScratchpad(newText);
    localStorage.setItem(storageKey, newText);
    setScratchpadParsed(parseScratchpad(newText));
    setShowBibSuggestions(false);
    setBibSuggestionFilter('');
  };

  const setRating = (bib: number, key: keyof AssessmentRatings, val: number) => {
    setScratchpadRatings(prev => {
      const next = new Map(prev);
      next.set(bib, { ...next.get(bib), [key]: val });
      return next;
    });
  };

  const handleApply = async () => {
    if (!currentUser || !userProfile) return;
    if (scratchpadParsed.size === 0) {
      toast({ title: 'No bib mentions found', description: 'Use #N to mention a bib e.g. #7 great batting', variant: 'destructive' });
      return;
    }
    setIsApplying(true);
    let applied = 0;
    const myAssessments = new Map(initialAssessments);

    for (const [bib, notes] of Array.from(scratchpadParsed.entries())) {
      const player = campPlayers.find(p => p.bibNumber === bib);
      if (!player) continue;
      const existing = myAssessments.get(bib);
      if (existing?.isLocked) continue;
      const bibRatings = scratchpadRatings.get(bib) || {};

      if (existing) {
        const updatedNotes = existing.notes ? `${existing.notes}\n${notes}` : notes;
        const ratingUpdates = Object.fromEntries(
          Object.entries(bibRatings).filter(([, v]) => typeof v === 'number' && (v as number) > 0)
        );
        await updateCampAssessmentAction(existing.id, currentUser.uid, { notes: updatedNotes, ...ratingUpdates });
      } else {
        await submitCampAssessmentAction({
          campId: camp.id,
          organizationId: camp.organizationId,
          bibNumber: bib,
          assessedByUid: currentUser.uid,
          assessedByName: userProfile.displayName || userProfile.email || 'Coach',
          batting: bibRatings.batting || 0,
          bowling: bibRatings.bowling || 0,
          fielding: bibRatings.fielding || 0,
          fitness: bibRatings.fitness || 0,
          attitude: bibRatings.attitude || 0,
          overall: bibRatings.overall || 0,
          notes,
          isLocked: false,
        });
      }
      applied++;
    }

    // Refresh
    const refreshed = await getMyCampAssessmentsAction(camp.id, currentUser.uid);
    if (refreshed.success) {
      const map = new Map<number, CampAssessment>();
      refreshed.assessments?.forEach(a => map.set(a.bibNumber, a));
      onAssessmentsUpdated(map);
    }

    setScratchpad('');
    setScratchpadParsed(new Map());
    setScratchpadRatings(new Map());
    localStorage.removeItem(storageKey);
    toast({ title: `Notes applied to ${applied} player${applied !== 1 ? 's' : ''} ✓` });
    setIsApplying(false);
  };

  const ratingKeys: { key: keyof AssessmentRatings; label: string }[] = [
    { key: 'batting', label: 'Batting' }, { key: 'bowling', label: 'Bowling' },
    { key: 'fielding', label: 'Fielding' }, { key: 'fitness', label: 'Fitness' },
    { key: 'attitude', label: 'Attitude' }, { key: 'overall', label: 'Overall' },
  ];

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Use <span className="font-mono font-bold text-primary">#N</span> to tag a bib number.
            e.g. <span className="italic">#7 great footwork, #12 needs to call louder</span>
          </p>
          <div className="relative">
            <Textarea
              placeholder="#2 excellent running between wickets&#10;#7 nervous but settled well&#10;#12 good footwork, needs to work on calling"
              value={scratchpad}
              onChange={e => handleChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setShowBibSuggestions(false); }}
              rows={8}
              className="font-mono text-sm resize-none"
              autoFocus
            />
            {showBibSuggestions && campPlayers.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                <div className="px-3 py-1.5 text-xs text-muted-foreground border-b bg-muted/50">
                  Select a bib number
                </div>
                {campPlayers
                  .filter(p => bibSuggestionFilter === '' || p.bibNumber.toString().startsWith(bibSuggestionFilter))
                  .sort((a, b) => a.bibNumber - b.bibNumber)
                  .map(p => (
                    <button
                      key={p.bibNumber}
                      type="button"
                      onMouseDown={e => { e.preventDefault(); insertBib(p.bibNumber); }}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted transition-colors text-left"
                    >
                      <span className="font-bold text-primary w-8">#{p.bibNumber}</span>
                      <span className="text-xs text-muted-foreground">{p.playerPrimarySkill}</span>
                      {initialAssessments.has(p.bibNumber) && (
                        <span className="ml-auto text-xs text-amber-600 flex items-center gap-1">
                          <Star className="h-3 w-3" /> assessed
                        </span>
                      )}
                    </button>
                  ))}
                {campPlayers.filter(p => bibSuggestionFilter === '' || p.bibNumber.toString().startsWith(bibSuggestionFilter)).length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No bib #{bibSuggestionFilter} found</p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Preview detected bibs */}
      {scratchpadParsed.size > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3 space-y-2">
            <p className="text-xs font-medium text-primary">
              Detected {scratchpadParsed.size} bib{scratchpadParsed.size !== 1 ? 's' : ''}:
            </p>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {Array.from(scratchpadParsed.entries()).sort((a, b) => a[0] - b[0]).map(([bib, note]) => {
                const player = campPlayers.find(p => p.bibNumber === bib);
                const existing = initialAssessments.get(bib);
                const isLocked = existing?.isLocked === true;
                const bibRatings = scratchpadRatings.get(bib) || {};
                return (
                  <div key={bib} className={`border rounded-lg p-3 space-y-2 ${isLocked ? 'opacity-60 bg-muted/30' : 'bg-background'}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-primary text-sm">#{bib}</span>
                      {player
                        ? <span className="text-xs text-muted-foreground">({player.playerPrimarySkill})</span>
                        : <span className="text-xs text-destructive">(not in camp — will skip)</span>}
                      {isLocked
                        ? <span className="text-xs text-destructive font-medium">🔒 Locked</span>
                        : existing
                          ? <span className="text-xs text-amber-600">· will append</span>
                          : <span className="text-xs text-green-600">· new</span>}
                    </div>
                    {!isLocked && <p className="text-xs text-muted-foreground italic">"{note}"</p>}
                    {!isLocked && (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                        {ratingKeys.map(({ key, label }) => (
                          <div key={key} className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground w-14">{label}</span>
                            <div className="flex gap-0.5">
                              {[1,2,3,4,5].map(n => (
                                <button key={n} type="button"
                                  onClick={() => setRating(bib, key, (bibRatings[key] || 0) === n ? 0 : n)}>
                                  <Star className={`h-4 w-4 ${n <= (bibRatings[key] || 0) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/20'}`} />
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <Button onClick={handleApply} disabled={isApplying} className="w-full">
              {isApplying
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Applying...</>
                : <><Check className="mr-2 h-4 w-4" /> Apply notes to {scratchpadParsed.size} bib{scratchpadParsed.size !== 1 ? 's' : ''}</>
              }
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
