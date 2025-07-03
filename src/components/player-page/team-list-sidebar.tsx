
'use client';

import type { Team } from '@/types';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Users } from 'lucide-react';

interface TeamListSidebarProps {
  teams: Team[];
  selectedTeamId: string | null;
  onSelectTeam: (teamId: string) => void;
}

export function TeamListSidebar({ teams, selectedTeamId, onSelectTeam }: TeamListSidebarProps) {
  if (!teams || teams.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No teams available.</p>;
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-2">
        <h3 className="text-lg font-semibold text-primary mb-2">Teams</h3>
        {teams.map((team) => (
          <Button
            key={team.id}
            variant={selectedTeamId === team.id ? 'secondary' : 'ghost'}
            className={cn(
              'w-full justify-start text-left h-auto py-2 px-3',
              selectedTeamId === team.id && 'bg-primary/10 text-primary'
            )}
            onClick={() => onSelectTeam(team.id)}
          >
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <div>
                <p className="font-medium">{team.name}</p>
                <p className="text-xs text-muted-foreground">{team.ageCategory}</p>
              </div>
            </div>
          </Button>
        ))}
      </div>
    </ScrollArea>
  );
}
