'use client';

import { GameImportForm } from '@/components/games/game-import-form';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, ArrowLeft, Loader2, FileText, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export default function ImportGamesPage() {
  const { activeOrganizationId, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2 text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Page header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-headline font-bold text-primary flex items-center gap-2">
            <FileText className="h-6 w-6" /> Import Games
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bulk import games using a CSV file or the Excel template. Expand your preferred method below.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/games"><ArrowLeft className="mr-2 h-4 w-4" />Back to Games</Link>
        </Button>
      </div>

      {/* No org warning */}
      {!activeOrganizationId && (
        <Alert variant="default" className="border-primary/50">
          <Info className="h-5 w-5 text-primary" />
          <AlertTitle>Organization Required</AlertTitle>
          <AlertDescription>
            Please select an active organization from the dropdown in the navbar before importing games.
          </AlertDescription>
        </Alert>
      )}

      {/* Accordion */}
      <Accordion type="single" collapsible className="space-y-3">

        {/* ── CSV Import ── */}
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
                  <li>Must contain headers: <strong>GameDate, VenueName, SeriesName, Team1Name, Team2Name</strong>.</li>
                  <li><strong>GameDate</strong> must be in <strong>MM/DD/YYYY</strong> format.</li>
                  <li><strong>SeriesName</strong> must match an existing active series in the system.</li>
                  <li><strong>VenueName</strong> must match a venue already associated with the specified series.</li>
                  <li><strong>Team1Name</strong> and <strong>Team2Name</strong> must match teams already associated with the specified series.</li>
                  <li>The system will <strong>not</strong> create new Series, Venues, or Teams — they must pre-exist.</li>
                  <li>Player rosters are auto-populated with age-eligible players from each team's roster.</li>
                </ul>
              </AlertDescription>
            </Alert>
            <Button variant="outline" size="sm" asChild className="mb-4 text-xs">
              <Link href="/sample-games-import.csv" download>
                Download Sample CSV
              </Link>
            </Button>
            <GameImportForm mode="csv" />
          </AccordionContent>
        </AccordionItem>

        {/* ── Excel Import ── */}
        <AccordionItem value="xlsx" className="border rounded-xl overflow-hidden shadow-sm">
          <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-muted/30 [&[data-state=open]]:bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="h-5 w-5 text-green-700" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-base">Import via Excel</p>
                <p className="text-xs text-muted-foreground font-normal">Download a dynamic template pre-filled with your org's series, venues and teams</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6 pt-2">
            <Alert className="mb-6 border-green-200 bg-green-50">
              <FileSpreadsheet className="h-4 w-4 text-green-700" />
              <AlertTitle className="text-green-800">Using the Excel Template</AlertTitle>
              <AlertDescription className="text-green-700">
                <ul className="list-disc pl-5 space-y-1 text-sm mt-2">
                  <li>Click <strong>Download Excel Template</strong> — it is generated live with your organization's current data.</li>
                  <li>Dropdowns for Series, Venue, Team1, and Team2 are pre-populated with valid values.</li>
                  <li>Use the <strong>Valid Values</strong> sheet to see which venues and teams belong to each series.</li>
                  <li>Use the <strong>Instructions</strong> sheet for full field rules.</li>
                  <li>Dates must be entered as <strong>MM/DD/YYYY</strong> text — not Excel date format.</li>
                  <li>Do <strong>not</strong> rename or reorder the column headers.</li>
                </ul>
              </AlertDescription>
            </Alert>
            <GameImportForm mode="xlsx" />
          </AccordionContent>
        </AccordionItem>

      </Accordion>
    </div>
  );
}
