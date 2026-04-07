'use client';

import { SeriesImportForm } from '@/components/series/series-import-form';
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

export default function ImportSeriesPage() {
  const ageCategoriesString = AGE_CATEGORIES.join(', ');

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Page header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-headline font-bold text-primary flex items-center gap-2">
            <FileText className="h-6 w-6" /> Import Series
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bulk import series using a CSV file or the Excel template. Expand your preferred method below.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/series"><ArrowLeft className="mr-2 h-4 w-4" />Back to Series</Link>
        </Button>
      </div>

      {/* Download CSV sample */}
      <div className="flex items-center gap-3">
        <p className="text-sm text-muted-foreground">Download a template to get started:</p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/sample-series-import.csv" download>
            <FileText className="mr-1.5 h-4 w-4 text-blue-600" />
            Sample CSV Template
            <Download className="ml-1.5 h-3 w-3" />
          </Link>
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
                  <li>Must contain headers: <strong>SeriesName, AgeCategory, Year, MaleCutoffDate, FemaleCutoffDate, SeriesAdminEmails</strong>.</li>
                  <li><strong>SeriesName</strong> must be unique — existing names will error for that row.</li>
                  <li><strong>AgeCategory</strong> must be one of: {ageCategoriesString}.</li>
                  <li><strong>Year</strong> must be a valid year (e.g. 2026).</li>
                  <li><strong>MaleCutoffDate</strong> and <strong>FemaleCutoffDate</strong> must be in <strong>MM/DD/YYYY</strong> format.</li>
                  <li><strong>SeriesAdminEmails</strong> (optional) — comma-separated emails of existing users. Unknown emails are ignored with a warning.</li>
                  <li>The system will <strong>not</strong> create new user accounts for Series Admins.</li>
                </ul>
              </AlertDescription>
            </Alert>
            <SeriesImportForm mode="csv" />
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
                <p className="text-xs text-muted-foreground font-normal">Download a template with AgeCategory dropdown and instructions</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6 pt-2">
            <Alert className="mb-6 border-green-200 bg-green-50">
              <FileSpreadsheet className="h-4 w-4 text-green-700" />
              <AlertTitle className="text-green-800">Using the Excel Template</AlertTitle>
              <AlertDescription className="text-green-700">
                <ul className="list-disc pl-5 space-y-1 text-sm mt-2">
                  <li>Click <strong>Download Excel Template</strong> to get the pre-formatted template.</li>
                  <li><strong>AgeCategory</strong> has a dropdown with all valid values — select from it to avoid errors.</li>
                  <li>Dates must be entered as <strong>MM/DD/YYYY</strong> text — not Excel date format.</li>
                  <li>See the <strong>Instructions</strong> sheet inside the template for full field rules.</li>
                  <li>Do <strong>not</strong> rename or reorder the column headers.</li>
                  <li>Series are imported into the currently active organization.</li>
                </ul>
              </AlertDescription>
            </Alert>
            <SeriesImportForm mode="xlsx" />
          </AccordionContent>
        </AccordionItem>

      </Accordion>
    </div>
  );
}
