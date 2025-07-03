
'use client';

import { GameImportForm } from '@/components/games/game-import-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileText, Info, Download, ArrowLeft, Loader2 } from 'lucide-react'; 
import { Button } from '@/components/ui/button'; 
import Link from 'next/link'; 
import { useAuth } from '@/contexts/auth-context';

export default function ImportGamesPage() {
  const { activeOrganizationId, loading: authLoading } = useAuth();

  const renderContent = () => {
    if (authLoading) {
      return (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="ml-2 text-muted-foreground">Loading...</p>
        </div>
      );
    }

    if (!activeOrganizationId) {
      return (
        <Alert variant="default" className="border-primary/50">
          <Info className="h-5 w-5 text-primary" />
          <AlertTitle>Organization Required</AlertTitle>
          <AlertDescription>
            Please select an active organization from the dropdown in the navbar before importing games.
          </AlertDescription>
        </Alert>
      );
    }
    
    return (
      <>
        <Alert className="mb-6">
          <Info className="h-4 w-4" />
          <AlertTitle>Important Notes for CSV Import</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>The CSV file must contain the following headers: <strong>GameDate, VenueName, SeriesName, Team1Name, Team2Name</strong>.</li>
              <li>GameDate must be in <strong>MM/DD/YYYY</strong> format.</li>
              <li>SeriesName must match an existing <strong>active</strong> series in the system.</li>
              <li>VenueName must match an existing venue that is <strong>already associated with the specified series</strong>.</li>
              <li>Team1Name and Team2Name must match existing teams that are <strong>already associated with the specified series</strong>.</li>
              <li>The system will <strong>not</strong> create new Series, Venues, or Teams from the CSV. They must pre-exist.</li>
              <li>Player rosters for imported games (Team1Players, Team2Players) will be automatically populated based on players eligible for the specified series from the respective teams' full rosters.</li>
            </ul>
          </AlertDescription>
        </Alert>
        <GameImportForm />
      </>
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start mb-2">
            <div className="flex-1">
              <CardTitle className="text-2xl font-headline text-primary flex items-center gap-2">
                <FileText className="h-6 w-6" />
                Import Games from CSV
              </CardTitle>
              <CardDescription>
                Upload a CSV file to bulk import game data. First,{' '}
                <Button variant="outline" size="sm" asChild className="text-xs -translate-y-px px-2 h-auto py-0.5">
                  <Link href="/sample-games-import.csv" download>
                    <Download className="mr-1 h-3 w-3" /> Download Sample Template
                  </Link>
                </Button>
                {' '}and ensure your CSV matches its format.
              </CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/games"><ArrowLeft className="mr-2 h-4 w-4" />Back to Games</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {renderContent()}
        </CardContent>
      </Card>
    </div>
  );
}
