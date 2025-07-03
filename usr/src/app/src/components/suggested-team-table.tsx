
import type { SuggestedTeam } from '@/ai/flows/suggest-team-composition';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Trophy, Users } from 'lucide-react';
import { CricketBatIcon, CricketBallIcon, WicketKeeperGloves } from '@/components/custom-icons';

interface SuggestedTeamTableProps {
  suggestedTeam: SuggestedTeam;
}

export function SuggestedTeamTable({ suggestedTeam }: SuggestedTeamTableProps) {
  if (!suggestedTeam || suggestedTeam.length === 0) {
    return <p className="text-muted-foreground">No team suggestions available based on the criteria.</p>;
  }

  const getSkillIcon = (skill: string) => {
    if (skill.toLowerCase().includes('batting')) return <CricketBatIcon className="h-4 w-4 inline mr-1" />;
    if (skill.toLowerCase().includes('bowling')) return <CricketBallIcon className="h-4 w-4 inline mr-1" />;
    if (skill.toLowerCase().includes('wicket keeping')) return <WicketKeeperGloves className="h-4 w-4 inline mr-1" />;
    return <Users className="h-4 w-4 inline mr-1" />;
  };


  return (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableCaption>AI Suggested Team Composition</TableCaption>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="w-[50px]">Rank</TableHead>
            <TableHead>Player Name</TableHead>
            <TableHead>Primary Skill</TableHead>
            <TableHead>Batting Order</TableHead>
            <TableHead>Dominant Hand (Bat)</TableHead>
            <TableHead>Bowling Style</TableHead>
            <TableHead>Dominant Hand (Bowl)</TableHead>
            <TableHead className="text-right">Avg. Score</TableHead>
            <TableHead className="text-right">Suitability</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {suggestedTeam.map((player, index) => (
            <TableRow key={player.playerName + index} className="hover:bg-accent/10">
              <TableCell className="font-medium">
                <Badge variant={index < 3 ? "default" : "secondary"} className={index < 3 ? "bg-accent text-accent-foreground" : ""}>
                  {index + 1}
                </Badge>
              </TableCell>
              <TableCell className="font-medium">{player.playerName}</TableCell>
              <TableCell className="whitespace-nowrap">
                {getSkillIcon(player.primarySkill)}
                {player.primarySkill}
              </TableCell>
              <TableCell>{player.battingOrder || 'N/A'}</TableCell>
              <TableCell>{player.dominantHandBatting}</TableCell>
              <TableCell>{player.bowlingStyle || 'N/A'}</TableCell>
              <TableCell>{player.dominantHandBowling || 'N/A'}</TableCell>
              <TableCell className="text-right">{player.averageScore.toFixed(1)}</TableCell>
              <TableCell className="text-right text-primary font-semibold">
                <Trophy className="h-4 w-4 inline mr-1 text-amber-500" />
                {player.suitabilityScore.toFixed(1)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
