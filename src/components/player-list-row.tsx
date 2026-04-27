'use client';

/**
 * FILE: src/components/player-list-row.tsx
 *
 * List-view row for a Player — mirrors PlayerCard logic exactly.
 */

import Link from 'next/link';
import Image from 'next/image';
import type { PlayerWithRatings } from '@/types';
import { Button } from '@/components/ui/button';
import { ArrowRight, User, Cake, Shield } from 'lucide-react';
import { CricketBatIcon, CricketBallIcon, WicketKeeperGloves } from '@/components/custom-icons';
import { cn } from '@/lib/utils';

interface PlayerListRowProps {
  player: PlayerWithRatings;
  isLast?: boolean;
}

const PlayerListRow: React.FC<PlayerListRowProps> = ({ player, isLast }) => {
  const getSkillIcon = () => {
    switch (player.primarySkill) {
      case 'Batting': return <CricketBatIcon className="h-3.5 w-3.5 text-primary" />;
      case 'Bowling': return <CricketBallIcon className="h-3.5 w-3.5 text-primary" />;
      case 'Wicket Keeping': return <WicketKeeperGloves className="h-3.5 w-3.5 text-primary" />;
      default: return <User className="h-3.5 w-3.5 text-primary" />;
    }
  };

  return (
    <div className={cn(
      'flex items-center gap-4 px-4 py-3',
      !isLast && 'border-b border-border'
    )}>
      {/* Avatar */}
      <Image
        src={player.avatarUrl || 'https://placehold.co/40x40.png'}
        alt={player.name}
        width={40}
        height={40}
        className="rounded-full border border-primary/30 shrink-0"
        data-ai-hint="player avatar"
      />

      {/* Name + details */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-primary truncate">{player.name}</p>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            {getSkillIcon()}
            {player.effectiveSkill || player.primarySkill}
            {player.effectiveSkill && player.effectiveSkill !== player.primarySkill && (
              <span className="opacity-60">({player.primarySkill})</span>
            )}
          </span>
          {player.age !== undefined && (
            <span className="flex items-center gap-1">
              <Cake className="h-3 w-3" /> {player.age} yrs
            </span>
          )}
          {player.clubName && (
            <span className="flex items-center gap-1">
              <Shield className="h-3 w-3" /> {player.clubName}
            </span>
          )}
          <span>
            <span className="text-muted-foreground">Games: </span>
            <span className="font-medium text-foreground">{player.gamesPlayed}</span>
          </span>
          <span>
            <span className="text-muted-foreground">Avg: </span>
            <span className="font-medium text-foreground">
              {player.calculatedAverageScore === 0 && player.gamesPlayed === 0
                ? 'N/A'
                : player.calculatedAverageScore.toFixed(1)}
            </span>
          </span>
        </div>
      </div>

      {/* Action */}
      <div className="shrink-0">
        <Button asChild variant="outline" size="sm" className="h-7 px-2.5 text-xs border-primary text-primary hover:bg-primary/10">
          <Link href={`/players/${player.id}`} className="flex items-center gap-1">
            View <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default PlayerListRow;
