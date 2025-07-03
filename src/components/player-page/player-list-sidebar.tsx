
'use client';

import type { Player } from '@/types';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { User } from 'lucide-react';

interface PlayerListSidebarProps {
  players: Player[];
  selectedPlayerId?: string | null;
  teamName?: string;
  onSelectPlayer: (playerId: string) => void;
}

export function PlayerListSidebar({ players, selectedPlayerId, teamName, onSelectPlayer }: PlayerListSidebarProps) {
  if (!teamName) {
    return <div className="p-4 text-sm text-muted-foreground flex items-center justify-center h-full">Select a team to see players.</div>;
  }
  if (!players || players.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">No players in {teamName}.</div>;
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-2">
        <h3 className="text-lg font-semibold text-primary mb-2">Players in {teamName}</h3>
        {players.map((player) => (
          <Button
            key={player.id}
            variant={selectedPlayerId === player.id ? 'secondary' : 'ghost'}
            className={cn(
              'w-full justify-start text-left h-auto py-2 px-3',
              selectedPlayerId === player.id && 'bg-primary/10 text-primary'
            )}
            onClick={() => onSelectPlayer(player.id)}
            asChild
          >
            <Link href={`/players/${player.id}`}>
              <Avatar className="h-8 w-8 mr-2">
                <AvatarImage src={player.avatarUrl || `https://placehold.co/40x40.png`} alt={player.name} data-ai-hint="player avatar small"/>
                <AvatarFallback>{player.name.substring(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{player.name}</p>
                <p className="text-xs text-muted-foreground">{player.primarySkill}</p>
              </div>
            </Link>
          </Button>
        ))}
      </div>
    </ScrollArea>
  );
}
