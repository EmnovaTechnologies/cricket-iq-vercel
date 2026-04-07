'use client';

import { TeamImportForm } from '@/components/teams/team-import-form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, ArrowLeft, FileText, FileSpreadsheet, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { AGE_CATEGORIES } from '@/lib/constants';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export default function ImportTeamsPage() {
  const ageCategoriesString = [...AGE_CATEGORIES].join(', ');

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Page header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-headline font-bold text-primary flex items-center gap-2">
            <FileText className="h-6 w-6" /> Import Teams
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bulk import teams using a CSV file or the Excel template. Expand your preferred method below.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/teams"><ArrowLeft className="mr-2 h-4 w-4" />Back to Teams</Link>
        </Button>
      </div>

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
                  <li>Must contain headers: <strong>TeamName, ClubName, AgeCategory, TeamManagerEmails</strong>.</li>
                  <li><strong>TeamName</strong> is the only required field. Must be unique within the organization.</li>
                  <li><strong>ClubName</strong> (optional) must match a club defined for the active organization.</li>
                  <li><strong>AgeCategory</strong> (optional) must be one of: {ageCategoriesString}.</li>
                  <li><strong>TeamManagerEmails</strong> (optional) — comma-separated emails of existing users. Unknown emails are skipped with a warning.</li>
                  <li>Teams are created as empty shells — players are added separately.</li>
                  <li>Duplicate team names within the same organization will be skipped with an error.</li>
                </ul>
              </AlertDescription>
            </Alert>
            <Button variant="outline" size="sm" asChild className="mb-4">
              <Link href="/sample-team-import.csv" download>
                <FileText className="mr-1.5 h-4 w-4 text-blue-600" />
                Download Sample CSV
                <Download className="ml-1.5 h-3 w-3" />
              </Link>
            </Button>
            <TeamImportForm mode="csv" />
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
                <p className="text-xs text-muted-foreground font-normal">Download a dynamic template with dropdowns pre-filled from your organization</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6 pt-2">
            <Alert className="mb-6 border-green-200 bg-green-50">
              <FileSpreadsheet className="h-4 w-4 text-green-700" />
              <AlertTitle className="text-green-800">Using the Excel Template</AlertTitle>
              <AlertDescription className="text-green-700">
                <ul className="list-disc pl-5 space-y-1 text-sm mt-2">
                  <li>Click <strong>Download Excel Template</strong> — generated live with your organization's clubs, age categories and eligible managers.</li>
                  <li><strong>ClubName</strong> dropdown shows clubs defined for your organization.</li>
                  <li><strong>AgeCategory</strong> dropdown shows all valid age categories.</li>
                  <li><strong>TeamManagerEmails</strong> dropdown shows eligible users — you may also type emails manually.</li>
                  <li>See the <strong>Valid Values</strong> and <strong>Instructions</strong> sheets inside the template.</li>
                  <li>Do <strong>not</strong> rename or reorder the column headers.</li>
                </ul>
              </AlertDescription>
            </Alert>
            <TeamImportForm mode="xlsx" />
          </AccordionContent>
        </AccordionItem>

      </Accordion>
    </div>
  );
}
