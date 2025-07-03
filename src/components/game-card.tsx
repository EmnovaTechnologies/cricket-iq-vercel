
import * as React from 'react';
import Link from 'next/link';
import type { Game, PermissionKey } from '@/types';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { CalendarDays, MapPin, Edit3, ArrowRight, CheckCircle, AlertCircle, ClipboardCheck, Hourglass, Users, CalendarClock } from 'lucide-react';
import { format, parseISO, startOfDay } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils';
import { PERMISSIONS } from '@/lib/permissions-master-list';

interface GameCardProps {
  game: Game;
}

function getGameDisplayStatus(game: Game, currentUserId?: string): { text: string; variant: BadgeProps['variant']; icon?: JSX.Element; className?: string } {
  if (startOfDay(parseISO(game.date)) > startOfDay(new Date())) {
    return { text: 'Future Game', variant: 'outline', icon: <CalendarClock className="h-3 w-3" />, className: "text-muted-foreground border-muted-foreground/30" };
  }
  if (game.ratingsFinalized) {
    return { text: 'Finalized', variant: 'default', icon: <CheckCircle className="h-3 w-3" />, className:"bg-green-600 hover:bg-green-600 text-white" };
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
    return { text: 'Ready to Finalize', variant: 'outline', icon: <ClipboardCheck className="h-3 w-3" />, className: "text-blue-600 border-blue-500/50" };
  }
  
  const anyCertificationStarted = Object.keys(game.selectorCertifications || {}).length > 0 ||
                                  assignedSelectors.some(uid => game.selectorCertifications?.[uid]?.status === 'certified' || game.selectorCertifications?.[uid]?.status === 'pending');

  if (anyCertificationStarted) {
    return { text: 'Cert. In Progress', variant: 'secondary', icon: <Hourglass className="h-3 w-3" /> };
  }

  return { text: 'Ratings Open', variant: 'secondary', icon: <Edit3 className="h-3 w-3" /> };
}


const GameCard: React.FC<GameCardProps> = ({ game }) => {
  const { userProfile: currentUserProfile, effectivePermissions } = useAuth();
  const gameDate = game.date ? parseISO(game.date) : null;
  const isFutureGame = gameDate ? startOfDay(gameDate) > startOfDay(new Date()) : false;

  const displayStatus = getGameDisplayStatus(game, currentUserProfile?.uid);

  const canRatePlayers = !isFutureGame && (
    !!effectivePermissions[PERMISSIONS.GAMES_RATE_ANY] ||
    (!!effectivePermissions[PERMISSIONS.GAMES_RATE_ASSIGNED] && !!game.selectorUserIds?.includes(currentUserProfile?.uid || ''))
  );

  return (
    <Card className="flex flex-col h-full hover:shadow-lg transition-shadow duration-300">
      <CardHeader className="p-3 space-y-1">
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-xl font-headline text-primary truncate">
              {game.team1} vs {game.team2}
            </CardTitle>
            {game.seriesName && (
              <p className="text-xs text-muted-foreground truncate">
                Series: {game.seriesName}
              </p>
            )}
          </div>
          {displayStatus && (
            <Badge variant={displayStatus.variant} className={cn("capitalize text-xs px-1.5 py-0.5 h-fit shrink-0", displayStatus.className)}>
              {displayStatus.icon && React.cloneElement(displayStatus.icon, { className: cn(displayStatus.icon.props.className, "mr-1") })}
              {displayStatus.text}
            </Badge>
          )}
        </div>
        <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm pt-1">
          <span className="flex items-center gap-1">
            <CalendarDays className="h-4 w-4" />
            {gameDate ? format(gameDate, 'PP') : 'Date N/A'}
          </span>
          <span className="flex items-center gap-1 truncate">
            <MapPin className="h-4 w-4" />
            <span className="truncate" title={game.venue}>{game.venue}</span>
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-grow p-3 pt-1">
        <div className="min-h-[0.5rem]"></div>
      </CardContent>
      <CardFooter className="grid grid-cols-2 gap-1.5 p-2 pt-1">
         {canRatePlayers ? (
            <Button 
                asChild 
                variant="default" 
                size="sm" 
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-sm"
            >
                <Link href={`/games/${game.id}/rate-enhanced?from=game-list`}>
                    <span className="flex items-center justify-center gap-1">
                    <Edit3 className="h-3.5 w-3.5" /> Rate Players
                    </span>
                </Link>
            </Button>
         ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="inline-block cursor-not-allowed w-full">
                    <Button 
                        variant="default" 
                        size="sm" 
                        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-sm pointer-events-none"
                        disabled
                    >
                        <span className="flex items-center justify-center gap-1">
                        <Edit3 className="h-3.5 w-3.5" /> Rate Players
                        </span>
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isFutureGame ? "Cannot rate future games" : "You do not have permission to rate this game."}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
         )}
         <Button asChild variant="outline" size="sm" className="w-full border-primary text-primary hover:bg-primary/10 text-sm">
          <Link href={`/games/${game.id}/details`}>
            <span className="flex items-center justify-center gap-1">
              View Details <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
};

export default GameCard;
