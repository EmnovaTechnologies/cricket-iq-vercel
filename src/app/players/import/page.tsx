

import { PlayerImportForm } from '@/components/players/player-import-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileText, Info, Download, ArrowLeft, Users, ShieldAlert } from 'lucide-react'; // Added ShieldAlert
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { PRIMARY_SKILLS, BATTING_ORDERS, BOWLING_STYLES, DOMINANT_HANDS, GENDERS } from '@/lib/constants';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import { PERMISSIONS } from '@/lib/permissions-master-list';

export default function ImportPlayersPage() {
  const primarySkillsString = PRIMARY_SKILLS.join(', ');
  const battingOrdersString = BATTING_ORDERS.join(', ');
  const bowlingStylesString = BOWLING_STYLES.join(', ');
  const dominantHandsString = DOMINANT_HANDS.join(', ');
  const gendersString = GENDERS.join(', ');

  return (
    <AuthProviderClientComponent
      requiredPermission={PERMISSIONS.PAGE_VIEW_PLAYER_IMPORT}
      FallbackComponent={
        <div className="max-w-2xl mx-auto">
          <Alert variant="destructive" className="mt-8">
            <ShieldAlert className="h-5 w-5" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              You do not have permission to import players. This action requires the '{PERMISSIONS.PAGE_VIEW_PLAYER_IMPORT}' permission.
            </AlertDescription>
          </Alert>
        </div>
      }
    >
      <div className="max-w-3xl mx-auto space-y-6">
        <Card>
          <CardHeader>
             <div className="flex justify-between items-start mb-2">
              <div className="flex-1">
                <CardTitle className="text-2xl font-headline text-primary flex items-center gap-2">
                  <Users className="h-6 w-6" />
                  Import Players from CSV
                </CardTitle>
                <CardDescription>
                  Upload a CSV file to bulk import player data. First,{' '}
                  <Button variant="outline" size="sm" asChild className="text-xs -translate-y-px px-2 h-auto py-0.5">
                    <Link href="/sample-players-import.csv" download>
                      <Download className="mr-1 h-3 w-3" /> Download Sample Template
                    </Link>
                  </Button>
                  {' '}and ensure your CSV matches its format.
                </CardDescription>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/players"><ArrowLeft className="mr-2 h-4 w-4" />Back to Players</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Alert className="mb-6">
              <Info className="h-4 w-4" />
              <AlertTitle>Important Notes for CSV Import</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>The CSV file must contain these headers: <strong>FirstName, LastName, CricClubsID, DateOfBirth, Gender, PrimarySkill, DominantHandBatting, BattingOrder</strong>.</li>
                  <li><strong>FirstName</strong> and <strong>LastName</strong> are required and will be combined for the full name.</li>
                  <li><strong>CricClubsID</strong> must be unique across all players.</li>
                  <li><strong>DateOfBirth</strong> must be in <strong>MM/DD/YYYY</strong> format.</li>
                  <li><strong>Gender</strong> must be one of: {gendersString}.</li>
                  <li><strong>PrimarySkill</strong> must be one of: {primarySkillsString}. (Note: 'Wicket Keeping' is the correct term for the skill).</li>
                  <li><strong>DominantHandBatting</strong> must be one of: {dominantHandsString}.</li>
                  <li><strong>BattingOrder</strong> must be one of: {battingOrdersString}.</li>
                  <li><strong>DominantHandBowling</strong> is required if PrimarySkill is 'Bowling'. Must be one of: {dominantHandsString}.</li>
                  <li><strong>BowlingStyle</strong> is required if PrimarySkill is 'Bowling'. Must be one of: {bowlingStylesString}.</li>
                  <li><strong>PrimaryClubName</strong> (optional) must match a club defined for the active organization.</li>
                  <li><strong>PrimaryTeamName</strong> (optional) must match an existing team name within the active organization. If provided, the player will be added to this team if age-eligible for that team's category.</li>
                </ul>
              </AlertDescription>
            </Alert>
            <PlayerImportForm />
          </CardContent>
        </Card>
      </div>
    </AuthProviderClientComponent>
  );
}