
import { PlayerImportForm } from '@/components/players/player-import-form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, Download, ArrowLeft, UserSquare2, ShieldAlert, FileText, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { PRIMARY_SKILLS, BATTING_ORDERS, BOWLING_STYLES, DOMINANT_HANDS, GENDERS } from '@/lib/constants';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

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

        {/* Page header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-headline font-bold text-primary flex items-center gap-2">
              <UserSquare2 className="h-6 w-6" /> Import Players
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Bulk import players using a CSV file or the Excel template. Expand your preferred method below.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/players"><ArrowLeft className="mr-2 h-4 w-4" />Back to Players</Link>
          </Button>
        </div>

        {/* Accordion — CSV and Excel import */}
        <Accordion type="single" collapsible className="space-y-3">

          {/* ── CSV Import ─────────────────────────────────────────────── */}
          <AccordionItem value="csv" className="border rounded-xl overflow-hidden shadow-sm">
            <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-muted/30 [&[data-state=open]]:bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-base">Import via CSV</p>
                  <p className="text-xs text-muted-foreground font-normal">Upload a comma-separated values file</p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6 pt-2">
              <Alert className="mb-6">
                <Info className="h-4 w-4" />
                <AlertTitle>CSV Format Requirements</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-5 space-y-1 text-sm mt-2">
                    <li>Must contain these headers: <strong>FirstName, LastName, CricClubsID, DateOfBirth, Gender, PrimarySkill, DominantHandBatting, BattingOrder, DominantHandBowling, BowlingStyle, PrimaryClubName, PrimaryTeamName</strong>.</li>
                    <li><strong>FirstName</strong> and <strong>LastName</strong> are required and will be combined for the full name.</li>
                    <li><strong>CricClubsID</strong> must be unique across all players.</li>
                    <li><strong>DateOfBirth</strong> must be in <strong>MM/DD/YYYY</strong> format.</li>
                    <li><strong>Gender</strong> must be one of: {gendersString}.</li>
                    <li><strong>PrimarySkill</strong> must be one of: {primarySkillsString}.</li>
                    <li><strong>DominantHandBatting</strong> must be one of: {dominantHandsString}.</li>
                    <li><strong>BattingOrder</strong> must be one of: {battingOrdersString}.</li>
                    <li><strong>DominantHandBowling</strong> is required if PrimarySkill is 'Bowling'. Must be one of: {dominantHandsString}.</li>
                    <li><strong>BowlingStyle</strong> is required if PrimarySkill is 'Bowling'. Must be one of: {bowlingStylesString}.</li>
                    <li><strong>PrimaryClubName</strong> (optional) must match a club defined for the active organization.</li>
                    <li><strong>PrimaryTeamName</strong> (optional) must match an existing team name. Player will be added if age-eligible.</li>
                  </ul>
                </AlertDescription>
              </Alert>
              {/* CSV import form — completely unchanged */}
              <Button variant="outline" size="sm" asChild className="mb-4">
                <Link href="/sample-players-import.csv" download>
                  <FileText className="mr-1.5 h-4 w-4 text-blue-600" />
                  Download Sample CSV
                  <Download className="ml-1.5 h-3 w-3" />
                </Link>
              </Button>
              <PlayerImportForm mode="csv" />
            </AccordionContent>
          </AccordionItem>

          {/* ── Excel Import ───────────────────────────────────────────── */}
          <AccordionItem value="xlsx" className="border rounded-xl overflow-hidden shadow-sm">
            <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-muted/30 [&[data-state=open]]:bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="h-5 w-5 text-green-700" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-base">Import via Excel</p>
                  <p className="text-xs text-muted-foreground font-normal">Upload the Excel template with built-in dropdowns and instructions</p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6 pt-2">
              <Alert className="mb-6 border-green-200 bg-green-50">
                <FileSpreadsheet className="h-4 w-4 text-green-700" />
                <AlertTitle className="text-green-800">Using the Excel Template</AlertTitle>
                <AlertDescription className="text-green-700">
                  <ul className="list-disc pl-5 space-y-1 text-sm mt-2">
                    <li>Download the <strong>Excel Template</strong> above and fill in your player data in the <strong>Players Import</strong> sheet.</li>
                    <li>Dropdown menus guide valid values for Gender, Primary Skill, Batting Order, Bowling Style and more — no typos.</li>
                    <li>Row 2 is an example — overwrite or delete it before uploading.</li>
                    <li>Do <strong>not</strong> rename or reorder the column headers.</li>
                    <li>See the <strong>Instructions</strong> sheet inside the template for full field rules.</li>
                    <li>Dates must be typed as <strong>MM/DD/YYYY</strong> text (e.g. 03/15/2008), not Excel date values.</li>
                  </ul>
                </AlertDescription>
              </Alert>
              {/* Excel import form */}
              <PlayerImportForm mode="xlsx" />
            </AccordionContent>
          </AccordionItem>

        </Accordion>
      </div>
    </AuthProviderClientComponent>
  );
}
