'use client';

/**
 * FILE: src/components/scorecard-list-row.tsx
 * List-view row for a single imported scorecard — mirrors ScorecardCard logic.
 */

import type { MatchScorecard } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { CalendarFold, ArrowRight, Trash2, Loader2, FileText } from 'lucide-react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

interface ScorecardListRowProps {
  sc: MatchScorecard;
  isMobile: boolean;
  isSelector: boolean;
  currentUser: { uid: string } | null;
  canImport: boolean;
  hasReports: boolean;
  deletingId: string | null;
  onDelete: (sc: MatchScorecard) => void;
  isLast?: boolean;
}

export function ScorecardListRow({ sc, isMobile, isSelector, currentUser, canImport, hasReports, deletingId, onDelete, isLast }: ScorecardListRowProps) {
  return (
    <div className={cn('flex items-center gap-4 px-4 py-3', !isLast && 'border-b border-border')}>
      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-primary truncate">{sc.team1} vs {sc.team2}</p>
          <Badge variant="outline" className="text-xs shrink-0">{sc.innings.length} inn</Badge>
          {sc.result && <span className="text-xs text-green-600 font-medium">{sc.result}</span>}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
          {sc.date && (
            <span className="flex items-center gap-1">
              <CalendarFold className="h-3 w-3" />
              {(() => { try { return format(parseISO(sc.date), 'PP'); } catch { return sc.date; } })()}
            </span>
          )}
          {sc.seriesName && <span className="truncate hidden sm:block">{sc.seriesName}</span>}
          <div className="flex gap-1 flex-wrap">
            {sc.innings.map((inn, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {inn.battingTeam}: {inn.totalRuns}/{inn.wickets}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="shrink-0 flex items-center gap-1.5">
        {isMobile && isSelector && currentUser ? (
          <Button asChild variant="default" size="sm" className="h-7 px-2.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground">
            <Link href={`/match-report/${sc.id}?uid=${currentUser.uid}`}>
              <FileText className="h-3 w-3 mr-1" /> Report
            </Link>
          </Button>
        ) : (
          <Button asChild variant="outline" size="sm" className="h-7 px-2.5 text-xs border-primary text-primary hover:bg-primary/10">
            <Link href={`/scorecards/${sc.id}`}>
              View <ArrowRight className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        )}
        {canImport && (
          hasReports ? (
            <span className="relative group cursor-not-allowed">
              <Button variant="destructive" size="sm" className="h-7 px-2.5 text-xs pointer-events-none opacity-50" disabled>
                <Trash2 className="h-3 w-3" />
              </Button>
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block whitespace-nowrap bg-gray-900 text-white text-xs rounded px-2 py-1 z-50">
                Match reports exist
              </span>
            </span>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="h-7 px-2.5 text-xs" disabled={deletingId === sc.id}>
                  {deletingId === sc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Scorecard</AlertDialogTitle>
                  <AlertDialogDescription>
                    Delete scorecard for <strong>{sc.team1} vs {sc.team2}</strong>? Players only on this scorecard will also be removed. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(sc)} className="bg-destructive hover:bg-destructive/90">Confirm Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )
        )}
      </div>
    </div>
  );
}
