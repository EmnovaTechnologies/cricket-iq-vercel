
'use client';

import type { PlayerWithRatings, PermissionKey, UserProfile } from '@/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PerformanceChart } from '@/components/performance-chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, parseISO } from 'date-fns';
import { User, Users, CalendarDays, Trophy, UserCheck, Cake, Binary, Tag, ListOrdered, Edit, Shield } from 'lucide-react';
import { Button } from '../ui/button';
import Link from 'next/link';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { CricketBatIcon, WicketKeeperGloves, CricketBallIcon } from '@/components/custom-icons';


const InfoItem: React.FC<{icon: React.ReactNode, label: string, value: string | number | undefined | null}> = ({icon, label, value}) => (
  <div className="flex items-center gap-3 p-3 bg-background rounded-md border">
    <div className="p-2 bg-primary/10 rounded-md text-accent">
      {icon}
    </div>
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground">{value ?? 'N/A'}</p>
    </div>
  </div>
);

interface PlayerDetailsViewProps {
  player: PlayerWithRatings | null;
  effectivePermissions: Record<PermissionKey, boolean>;
  userProfile: UserProfile | null;
}

export function PlayerDetailsView({ player, effectivePermissions, userProfile }: PlayerDetailsViewProps) {
  if (!player) {
    return <div className="p-6 text-center text-muted-foreground flex items-center justify-center h-full">Select a player to view details.</div>;
  }

  const getSkillIcon = (skill: PlayerWithRatings['primarySkill'] | undefined) => {
    if (!skill) return <User />;
    switch (skill) {
      case 'Batting': return <CricketBatIcon />;
      case 'Bowling': return <CricketBallIcon />;
      case 'Wicket Keeping': return <WicketKeeperGloves />;
      default: return <User />;
    }
  };

  const hasBattingRatings = player.ratings.some(r => r.batting && r.batting !== 'NR');
  const hasBowlingRatings = player.ratings.some(r => r.bowling && r.bowling !== 'NR');

  const isSuperAdmin = userProfile?.roles.includes('admin') ?? false;
  
  const canEditPlayer = 
    isSuperAdmin ||
    effectivePermissions[PERMISSIONS.PLAYERS_EDIT_ANY] || 
    (effectivePermissions[PERMISSIONS.PLAYER_EDIT_SELF] && userProfile?.playerId === player.id) ||
    (effectivePermissions[PERMISSIONS.PLAYERS_EDIT_ASSIGNED]);

  return (
    <div className="space-y-6 p-1 md:p-0">
      <Card className="overflow-hidden">
        <CardHeader className="bg-muted/50 p-4 md:p-6 flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6">
          <Avatar className="h-20 w-20 md:h-24 md:w-24 border-4 border-primary shadow-md">
            <AvatarImage src={player.avatarUrl || `https://placehold.co/100x100.png`} alt={player.name} data-ai-hint="player avatar" />
            <AvatarFallback>{player.name.substring(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl md:text-3xl font-headline font-bold text-primary">{player.name}</h1>
              {canEditPlayer && (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/players/${player.id}/edit`}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Player
                  </Link>
                </Button>
              )}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-x-4 gap-y-1 mt-1">
              {player.clubName && (
                <p className="text-base text-muted-foreground flex items-center gap-1.5">
                  <Shield className="h-4 w-4 text-accent" />
                  Club: {player.clubName}
                </p>
              )}
              {player.currentTeamName && (
                <p className="text-base text-muted-foreground flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-accent" />
                  Team: {player.currentTeamName}
                </p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {player.gender && <InfoItem icon={<Binary />} label="Gender" value={player.gender} />}
          {player.age !== undefined && <InfoItem icon={<Cake />} label="Age" value={`${player.age} years`} />}
          {player.dateOfBirth && <InfoItem icon={<CalendarDays />} label="Born" value={format(parseISO(player.dateOfBirth), 'PPP')} />}
          <InfoItem icon={getSkillIcon(player.primarySkill)} label="Primary Skill" value={player.primarySkill} />
          <InfoItem icon={<CricketBatIcon />} label="Batting Hand" value={player.dominantHandBatting} />
          {player.battingOrder && <InfoItem icon={<ListOrdered />} label="Batting Order" value={player.battingOrder} />}
          {player.dominantHandBowling && <InfoItem icon={<CricketBallIcon />} label="Bowling Hand" value={player.dominantHandBowling} />}
          {player.bowlingStyle && <InfoItem icon={<CricketBallIcon />} label="Bowling Style" value={player.bowlingStyle} />}
          {player.cricClubsId && <InfoItem icon={<Tag />} label="CricClubs ID" value={player.cricClubsId} />}

          <InfoItem icon={<Users />} label="Games Played" value={player.gamesPlayed.toString()} />
          <InfoItem icon={<CricketBatIcon />} label="Avg. Batting" value={String(player.averageBattingScore)} />
          <InfoItem icon={<CricketBallIcon />} label="Avg. Bowling" value={String(player.averageBowlingScore)} />
          <InfoItem icon={<Shield />} label="Avg. Fielding" value={String(player.averageFieldingScore)} />
          {player.primarySkill === 'Wicket Keeping' && <InfoItem icon={<UserCheck />} label="Avg. WicketKeeping" value={String(player.averageWicketKeepingScore)} />}
          <InfoItem icon={<Trophy />} label="Primary Skill Avg." value={player.calculatedAverageScore.toFixed(1)} />
        </CardContent>
      </Card>

      <h2 className="text-xl md:text-2xl font-headline font-semibold text-primary mt-6 md:mt-8 mb-4">Performance History</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        { hasBattingRatings &&
          <PerformanceChart ratings={player.ratings} skill="batting" title="Batting Performance" />
        }
        { hasBowlingRatings &&
          <PerformanceChart ratings={player.ratings} skill="bowling" title="Bowling Performance" />
        }
        { player.ratings.length > 0 &&
            <PerformanceChart ratings={player.ratings} skill="fielding" title="Fielding Performance" />
        }
        { player.primarySkill === 'Wicket Keeping' && player.ratings.some(r => r.wicketKeeping && r.wicketKeeping !== 'NR') &&
          <PerformanceChart ratings={player.ratings} skill="wicketKeeping" title="WicketKeeping Performance" />
        }
      </div>

      <h2 className="text-xl md:text-2xl font-headline font-semibold text-primary mt-6 md:mt-8 mb-4">Game Ratings</h2>
      {player.ratings.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Game Info</TableHead>
                  <TableHead>Batting</TableHead>
                  <TableHead>Bowling</TableHead>
                  <TableHead>Fielding</TableHead>
                  {player.primarySkill === 'Wicket Keeping' && <TableHead>WicketKeeping</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {player.ratings.map((rating, index) => {
                  const cells: React.ReactNode[] = [];
                    cells.push(
                      <TableCell key={`gameInfo-${index}`}>
                        <div className="flex items-center gap-2">
                          <CalendarDays className="h-4 w-4 text-muted-foreground" />
                          {`Game ID: ${rating.gameId.substring(0,6)}...`}
                        </div>
                      </TableCell>
                    );
                    cells.push(<TableCell key={`batting-${index}`}>{rating.batting || 'N/A'}</TableCell>);
                    cells.push(<TableCell key={`bowling-${index}`}>{rating.bowling || 'N/A'}</TableCell>);
                    cells.push(<TableCell key={`fielding-${index}`}>{rating.fielding}</TableCell>);

                  if (player.primarySkill === 'Wicket Keeping') {
                    cells.push(<TableCell key={`wicketKeeping-${index}`}>{rating.wicketKeeping || 'N/A'}</TableCell>);
                  }

                  return (
                    <TableRow key={index}>
                      {cells}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <p className="text-muted-foreground">No game ratings available for this player yet.</p>
      )}
    </div>
  );
}
