
import Link from 'next/link';
import type { Team } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Tag, ArrowRight, Shield } from 'lucide-react';

interface TeamCardProps {
  team: Team;
}

const TeamCard: React.FC<TeamCardProps> = ({ team }) => {
  return (
    <Card className="flex flex-col h-full hover:shadow-lg transition-shadow duration-300">
      <CardHeader>
        <CardTitle className="text-xl font-headline text-primary flex items-center gap-2">
          <Users className="h-5 w-5" />
          {team.name}
        </CardTitle>
        <div className="space-y-1 pt-1">
            <CardDescription className="flex items-center gap-2">
                <Shield className="h-4 w-4" /> {team.clubName}
            </CardDescription>
            <CardDescription className="flex items-center gap-2">
                <Tag className="h-4 w-4" /> {team.ageCategory}
            </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex-grow space-y-2">
        <p className="text-sm text-muted-foreground">Manage team roster and view series participation.</p>
      </CardContent>
      <CardFooter>
        <Button asChild variant="outline" className="w-full border-primary text-primary hover:bg-primary/10">
          <Link href={`/teams/${team.id}/details`} className="flex items-center justify-center gap-2">
            View Details <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
};

export default TeamCard;
