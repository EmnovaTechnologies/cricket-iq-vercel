'use client';

/**
 * FILE: src/components/game-list-row.tsx
 *
 * List-view row for a Game — mirrors GameCard logic exactly.
 * Same props, same permission checks, same status display.
 */

import * as React from 'react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { Game, PermissionKey } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { CalendarDays, MapPin, Edit3, ArrowRight, CheckCircle, AlertCircle, ClipboardCheck, Hourglass, Users, CalendarClock } from 'lucide-react';
import { format, parseISO, startOfDay } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils';
import { PERMISSIONS } from '@/lib/permissions-master-list';

interface GameListRowProps {
  game: Game;
  isLast?: boolean;
  isPlayerView?: boolean;
}

function getGameDisplayStatus(game: Game, currentUserId?: string): { text: string; variant: BadgeProps['variant']; icon?: JSX.Element; className?: string } {
  if (startOfDay(parseISO(game.date)) > startOfDay(new Date())) {
    return { text: 'Future Game', variant: 'outline', icon: <CalendarClock className="h-3 w-3" />, className: 'text-muted-foreground border-muted-foreground/30' };
  }
  if (game.ratingsFinalized) {
    return { text: 'Finalized', variant: 'default', icon: <CheckCircle className="h-3 w-3" />, className: 'bg-green-600 hover:bg-green-600 text-white' };
  }
  const assignedSelectors = game.selectorUserIds || [];
  if (assignedSelectors.length === 0) {
    return { text: 'No Selectors', variant: 'secondary', icon: <Users className="h-3 w-3" /> };
  }
  if (currentUserId && assignedSelectors.includes(currentUserId)) {
    const userCert = game.selectorCertifications?.[currentUserId];
    const needsUserCert = !userCert || userCert.status === 'pending' ||
      (userCert.status === 'certified' && game.ratingsLastModifiedAt && new Date(userCert.certifiedAt) < new Date(game.ratingsLastModifiedAt));
    if (needsUserCert) {
      return { text: 'Your Cert. Pending', variant: 'destructive', icon: <AlertCircle className="h-3 w-3" /> };
    }
  }
  const allCertifiedAndCurrent = assignedSelectors.every(uid => {
    const cert = game.selectorCertifications?.[uid];
    return cert?.status === 'certified' && (!game.ratingsLastModifiedAt || new Date(cert.certifiedAt) >= new Date(game.ratingsLastModifiedAt));
  });
  if (allCertifiedAndCurrent) {
    return { text: 'Ready to Finalize', variant: 'outline', icon: <ClipboardCheck className="h-3 w-3" />, className: 'text-blue-600 border-blue-500/50' };
  }
  const anyCertificationStarted = Object.keys(game.selectorCertifications || {}).length > 0 ||
    assignedSelectors.some(uid => game.selectorCertifications?.[uid]?.status === 'certified' || game.selectorCertifications?.[uid]?.status === 'pending');
  if (anyCertificationStarted) {
    return { text: 'Cert. In Progress', variant: 'secondary', icon: <Hourglass className="h-3 w-3" /> };
  }
  return { text: 'Ratings Open', variant: 'secondary', icon: <Edit3 className="h-3 w-3" /> };
}

const GameListRow: React.FC<GameListRowProps> = ({ game, isLast, isPlayerView = false }) => {
  const { userProfile: currentUserProfile, effectivePermissions, activeOrganizationDetails } = useAuth();
  const gameDate = game.date ? parseISO(game.date) : null;
  const isFutureGame = gameDate ? startOfDay(gameDate) > startOfDay(new Date()) : false;

  // Players only see Finalized or Upcoming — no selector workflow info
  const displayStatus = isPlayerView
    ? (isFutureGame
        ? { text: 'Upcoming', variant: 'outline' as const, icon: <CalendarClock className="h-3 w-3" />, className: 'text-muted-foreground border-muted-foreground/30' }
        : game.ratingsFinalized
          ? { text: 'Finalized', variant: 'default' as const, icon: <CheckCircle className="h-3 w-3" />, className: 'bg-green-600 hover:bg-green-600 text-white' }
          : { text: 'Played', variant: 'secondary' as const, icon: undefined, className: undefined })
    : getGameDisplayStatus(game, currentUserProfile?.uid);

  const showRatePlayers = !isPlayerView && activeOrganizationDetails?.selectionModel !== 'performance';

  const canRatePlayers = !isPlayerView && !isFutureGame && (
    !!effectivePermissions[PERMISSIONS.GAMES_RATE_ANY] ||
    (!!effectivePermissions[PERMISSIONS.GAMES_RATE_ASSIGNED] && !!game.selectorUserIds?.includes(currentUserProfile?.uid || ''))
  );

  return (
    <div className={cn(
      'flex items-center gap-4 px-4 py-3',
      !isLast && 'border-b border-border'
    )}>
      {/* Teams + series */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-primary truncate">{game.team1} vs {game.team2}</p>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
          {gameDate && (
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              {format(gameDate, 'PP')}
            </span>
          )}
          {game.venue && (
            <span className="flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3" />
              <span className="truncate">{game.venue}</span>
            </span>
          )}
          {game.seriesName && (
            <span className="hidden sm:block truncate">{game.seriesName}</span>
          )}
        </div>
      </div>

      {/* Status badge */}
      <div className="shrink-0">
        {displayStatus && (
          <Badge variant={displayStatus.variant} className={cn('text-xs px-1.5 py-0.5 h-fit flex items-center gap-1', displayStatus.className)}>
            {displayStatus.icon && React.cloneElement(displayStatus.icon, { className: 'h-3 w-3' })}
            {displayStatus.text}
          </Badge>
        )}
      </div>

      {/* Actions */}
      <div className="shrink-0 flex items-center gap-1.5">
        {showRatePlayers && (canRatePlayers ? (
          <Button asChild variant="default" size="sm" className="h-7 px-2.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground">
            <Link href={
              isMobile && currentUserProfile?.uid
                ? `/rate/${game.id}?uid=${currentUserProfile.uid}`
                : `/games/${game.id}/rate-enhanced?from=game-list`
            }>
              <Edit3 className="h-3 w-3 mr-1" /> Rate
            </Link>
          </Button>
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="inline-block cursor-not-allowed">
                  <Button variant="default" size="sm" className="h-7 px-2.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground pointer-events-none" disabled>
                    <Edit3 className="h-3 w-3 mr-1" /> Rate
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isFutureGame ? 'Cannot rate future games' : 'You do not have permission to rate this game.'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}

        <Button asChild variant="outline" size="sm" className="h-7 px-2.5 text-xs border-primary text-primary hover:bg-primary/10">
          <Link href={`/games/${game.id}/details`}>
            View <ArrowRight className="h-3 w-3 ml-1" />
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default GameListRow;
