
import Link from 'next/link';
import Image from 'next/image';
import type { PlayerWithRatings } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, User, Cake, Shield } from 'lucide-react';
import { CricketBatIcon, CricketBallIcon, WicketKeeperGloves } from '@/components/custom-icons';

interface PlayerCardProps {
  player: PlayerWithRatings;
}

const PlayerCard: React.FC<PlayerCardProps> = ({ player }) => {
  // Removed isExpanded state

  const getSkillIcon = () => {
    switch (player.primarySkill) {
      case 'Batting': return <CricketBatIcon className="h-5 w-5 text-primary" />;
      case 'Bowling': return <CricketBallIcon className="h-5 w-5 text-primary" />;
      case 'Wicket Keeping': return <WicketKeeperGloves className="h-5 w-5 text-primary" />;
      default: return <User className="h-5 w-5 text-primary" />;
    }
  };

  return (
    <Card className="flex flex-col hover:shadow-lg transition-shadow duration-300">
      <CardHeader
        // Removed onClick and cursor-pointer
        className="flex flex-row items-start justify-between gap-4 space-y-0 pb-4"
      >
        <div className="flex flex-row items-start gap-4">
          <Image
            src={player.avatarUrl || 'https://placehold.co/80x80.png'}
            alt={player.name}
            width={80}
            height={80}
            className="rounded-full border-2 border-primary p-1"
            data-ai-hint="player avatar"
          />
          <div className="flex-1">
            <CardTitle className="text-xl font-headline">{player.name}</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                {getSkillIcon()}
                {player.primarySkill}
              </div>
              {player.age !== undefined && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Cake className="h-4 w-4" />
                  {player.age} yrs
                </div>
              )}
              {player.clubName && (
                 <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Shield className="h-4 w-4" />
                  {player.clubName}
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Removed ChevronDown icon */}
      </CardHeader>

      {/* Content and Footer are now always rendered */}
      <CardContent className="flex-grow py-4">
        <div className="space-y-2.5 text-sm">
          {/* Batting Info Row */}
          <div className="grid grid-cols-2 gap-x-4 items-start">
            <div>
              {player.battingOrder && (
                <p>
                  <span className="text-muted-foreground">Batting Order: </span>
                  <span className="font-medium">{player.battingOrder}</span>
                </p>
              )}
            </div>
            <div>
              <p>
                <span className="text-muted-foreground">Bat Hand: </span>
                <span className="font-medium">{player.dominantHandBatting}</span>
              </p>
            </div>
          </div>

          {/* Bowling Info Row */}
          {(player.bowlingStyle || player.dominantHandBowling) && (
            <div className="grid grid-cols-2 gap-x-4 items-start">
              <div>
                {player.bowlingStyle && (
                  <p>
                    <span className="text-muted-foreground">Bowling Style: </span>
                    <span className="font-medium">{player.bowlingStyle}</span>
                  </p>
                )}
              </div>
              <div>
                {player.dominantHandBowling && (
                  <p>
                    <span className="text-muted-foreground">Bowl Hand: </span>
                    <span className="font-medium">{player.dominantHandBowling}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Performance Info Row */}
          <div className="grid grid-cols-2 gap-x-4 items-start">
            <div>
              <p>
                <span className="text-muted-foreground">Games: </span>
                <span className="font-semibold text-primary">{player.gamesPlayed}</span>
              </p>
            </div>
            <div>
              <p>
                <span className="text-muted-foreground">Avg Primary Skill Score: </span>
                <span className="font-semibold text-primary">
                  {player.calculatedAverageScore === 0 && player.gamesPlayed === 0 ? 'N/A' : player.calculatedAverageScore.toFixed(1)}
                </span>
              </p>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button asChild variant="outline" className="w-full border-primary text-primary hover:bg-primary/10">
          <Link href={`/players/${player.id}`} className="flex items-center justify-center gap-2">
            View Details <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
};

export default PlayerCard;
