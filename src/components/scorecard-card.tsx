'use client';

/**
 * FILE: src/components/scorecard-card.tsx
 * Card view for a single imported scorecard.
 */

import type { MatchScorecard } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
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

interface ScorecardCardProps {
  sc: MatchScorecard;
  isMobile: boolean;
  isSelector: boolean;
  currentUser: { uid: string } | null;
  canImport: boolean;
  hasReports: boolean;
  deletingId: string | null;
  onDelete: (sc: MatchScorecard) => void;
}

export function ScorecardCard({ sc, isMobile, isSelector, currentUser, canImport, hasReports, deletingId, onDelete }: ScorecardCardProps) {
  return (
    <Card className="flex flex-col h-full hover:shadow-lg transition-shadow duration-300">
      <CardHeader className="p-3 space-y-1">
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-xl font-headline text-primary truncate">{sc.team1} vs {sc.team2}</CardTitle>
            {sc.seriesName && <p className="text-xs text-muted-foreground truncate">Series: {sc.seriesName}</p>}
          </div>
          <Badge variant="outline" className="text-xs shrink-0">{sc.innings.length} inn</Badge>
        </div>
        <CardDescription className="flex items-center gap-1 text-sm pt-1">
          <CalendarFold className="h-4 w-4" />
          {sc.date ? (() => { try { return format(parseISO(sc.date), 'PP'); } catch { return sc.date; } })() : 'No date'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-grow p-3 pt-1 space-y-1">
        {sc.result && <p className="text-xs text-green-600 font-medium">{sc.result}</p>}
        <div className="flex flex-wrap gap-1">
          {sc.innings.map((inn, i) => (
            <Badge key={i} variant="secondary" className="text-xs">
              {inn.battingTeam}: {inn.totalRuns}/{inn.wickets}
            </Badge>
          ))}
        </div>
      </CardContent>
      <CardFooter className="grid grid-cols-2 gap-1.5 p-2 pt-1">
        {isMobile && isSelector && currentUser ? (
          <Button asChild variant="default" size="sm" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-sm">
            <Link href={`/match-report/${sc.id}?uid=${currentUser.uid}`}>
              <span className="flex items-center justify-center gap-1"><FileText className="h-3.5 w-3.5" /> Match Report</span>
            </Link>
          </Button>
        ) : (
          <Button asChild variant="outline" size="sm" className="w-full border-primary text-primary hover:bg-primary/10 text-sm">
            <Link href={`/scorecards/${sc.id}`}>
              <span className="flex items-center justify-center gap-1">View Details <ArrowRight className="h-3.5 w-3.5" /></span>
            </Link>
          </Button>
        )}
        {canImport && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              {hasReports ? (
                <span className="w-full relative group cursor-not-allowed">
                  <Button variant="destructive" size="sm" className="w-full text-sm pointer-events-none opacity-50" disabled>
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                  </Button>
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block whitespace-nowrap bg-gray-900 text-white text-xs rounded px-2 py-1 z-50">
                    Match reports exist
                  </span>
                </span>
              ) : (
                <Button variant="destructive" size="sm" className="w-full text-sm" disabled={deletingId === sc.id}>
                  {deletingId === sc.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
                  {deletingId === sc.id ? 'Deleting...' : 'Delete'}
                </Button>
              )}
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
        )}
      </CardFooter>
    </Card>
  );
}
