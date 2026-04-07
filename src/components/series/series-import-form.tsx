'use client';

import { useState, type ChangeEvent } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { importSeriesAction } from '@/lib/actions/import-actions';
import { getSeriesTemplateData } from '@/lib/actions/series-template-action';
import type { CsvSeriesImportRow, SeriesImportResult } from '@/types';
import { Loader2, Upload, AlertTriangle, CheckCircle, ListChecks, FileSpreadsheet, Download } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/auth-context';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { AGE_CATEGORIES } from '@/lib/constants';

const EXPECTED_HEADERS = ['SeriesName', 'AgeCategory', 'Year', 'MaleCutoffDate', 'FemaleCutoffDate', 'SeriesAdminEmails'];

interface SeriesImportFormProps {
  mode?: 'csv' | 'xlsx';
}

export function SeriesImportForm({ mode = 'csv' }: SeriesImportFormProps) {
  const { activeOrganizationId, loading: authLoading } = useAuth();
  const { toast } = useToast();

  // ── CSV state ──────────────────────────────────────────────────────────────
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<CsvSeriesImportRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [importResult, setImportResult] = useState<SeriesImportResult | null>(null);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);

  // ── Excel state ────────────────────────────────────────────────────────────
  const [xlsxFile, setXlsxFile] = useState<File | null>(null);
  const [xlsxFileName, setXlsxFileName] = useState<string | null>(null);
  const [xlsxParsedData, setXlsxParsedData] = useState<CsvSeriesImportRow[]>([]);
  const [xlsxIsLoading, setXlsxIsLoading] = useState(false);
  const [xlsxImportResult, setXlsxImportResult] = useState<SeriesImportResult | null>(null);
  const [xlsxProgress, setXlsxProgress] = useState(0);
  const [isGeneratingTemplate, setIsGeneratingTemplate] = useState(false);

  // ── CSV handlers (unchanged) ───────────────────────────────────────────────
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(null); setParsedData([]); setImportResult(null);
    setCurrentProgress(0); setFileName(null);
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;
    if (selectedFile.type !== 'text/csv') {
      toast({ title: 'Invalid File Type', description: 'Please upload a CSV file.', variant: 'destructive' });
      event.target.value = ''; return;
    }
    setFile(selectedFile); setFileName(selectedFile.name);
    Papa.parse<Record<string, string>>(selectedFile, {
      header: true, skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields;
        if (!headers || !EXPECTED_HEADERS.every(h => headers.includes(h))) {
          toast({ title: 'Invalid CSV Headers', description: `CSV must contain: ${EXPECTED_HEADERS.join(', ')}. Found: ${headers?.join(', ')}`, variant: 'destructive' });
          setFile(null); setFileName(null); event.target.value = ''; return;
        }
        const validRows = results.data.filter(row => EXPECTED_HEADERS.some(h => row[h] && row[h].trim() !== ''));
        setParsedData(validRows as CsvSeriesImportRow[]);
      },
      error: () => {
        toast({ title: 'CSV Parsing Error', description: 'Could not parse the CSV file.', variant: 'destructive' });
        setFile(null); setFileName(null); event.target.value = '';
      },
    });
  };

  const handleSubmit = async () => {
    if (!activeOrganizationId) {
      toast({ title: 'Error', description: 'No active organization selected.', variant: 'destructive' }); return;
    }
    if (!file || parsedData.length === 0) {
      toast({ title: 'No Data to Import', description: 'Please select a valid CSV file.', variant: 'destructive' }); return;
    }
    setIsLoading(true); setImportResult(null); setCurrentProgress(0);
    try {
      const interval = setInterval(() => setCurrentProgress(p => p < 90 ? p + 10 : p), 200);
      const result = await importSeriesAction(parsedData, activeOrganizationId);
      clearInterval(interval); setCurrentProgress(100); setImportResult(result);
      toast({ title: result.success ? 'Import Completed' : 'Import Failed', description: `${result.successfulImports} imported, ${result.failedImports} failed.`, variant: result.success ? 'default' : 'destructive' });
    } catch {
      toast({ title: 'Import Error', description: 'An unexpected error occurred.', variant: 'destructive' });
    } finally { setIsLoading(false); }
  };

  // ── Excel handlers ─────────────────────────────────────────────────────────
  const handleXlsxFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setXlsxFile(null); setXlsxParsedData([]); setXlsxImportResult(null);
    setXlsxProgress(0); setXlsxFileName(null);
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;
    if (!selectedFile.name.match(/\.(xlsx|xls)$/i)) {
      toast({ title: 'Invalid File Type', description: 'Please upload an Excel file (.xlsx or .xls).', variant: 'destructive' });
      event.target.value = ''; return;
    }
    setXlsxFileName(selectedFile.name);
    setXlsxFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', raw: false });
        const sheetName = workbook.SheetNames.find(n => n === 'Series Import') || workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        // Read headers explicitly from row 1
        const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:F1');
        const headers: string[] = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c })];
          headers.push(cell ? String(cell.v).trim() : '');
        }
        if (!EXPECTED_HEADERS.every(h => headers.includes(h))) {
          toast({ title: 'Invalid Headers', description: `Excel must contain: ${EXPECTED_HEADERS.join(', ')}. Found: ${headers.filter(Boolean).join(', ')}`, variant: 'destructive' });
          setXlsxFile(null); setXlsxFileName(null); event.target.value = ''; return;
        }
        const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false, header: headers });
        const validRows = rows.slice(1).filter(row =>
          EXPECTED_HEADERS.some(h => row[h] && String(row[h]).trim() !== '')
        ) as CsvSeriesImportRow[];
        setXlsxParsedData(validRows);
        toast({ title: 'Excel file ready', description: `${validRows.length} rows found.` });
      } catch (err) {
        console.error('Excel parse error:', err);
        toast({ title: 'Excel Parsing Error', description: 'Could not read the Excel file.', variant: 'destructive' });
        setXlsxFile(null); setXlsxFileName(null); event.target.value = '';
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  const handleXlsxSubmit = async () => {
    if (!activeOrganizationId) {
      toast({ title: 'Error', description: 'No active organization selected.', variant: 'destructive' }); return;
    }
    if (!xlsxFile || xlsxParsedData.length === 0) {
      toast({ title: 'No Data to Import', description: 'Please select a valid Excel file.', variant: 'destructive' }); return;
    }
    setXlsxIsLoading(true); setXlsxImportResult(null); setXlsxProgress(0);
    try {
      const interval = setInterval(() => setXlsxProgress(p => p < 90 ? p + 10 : p), 200);
      const result = await importSeriesAction(xlsxParsedData, activeOrganizationId);
      clearInterval(interval); setXlsxProgress(100); setXlsxImportResult(result);
      toast({ title: result.success ? 'Import Completed' : 'Import Failed', description: `${result.successfulImports} imported, ${result.failedImports} failed.`, variant: result.success ? 'default' : 'destructive' });
    } catch {
      toast({ title: 'Import Error', description: 'An unexpected error occurred.', variant: 'destructive' });
    } finally { setXlsxIsLoading(false); }
  };

  // ── Dynamic template generation ────────────────────────────────────────────
  const handleDownloadTemplate = async () => {
    if (!activeOrganizationId) {
      toast({ title: 'No Organization', description: 'Please select an active organization first.', variant: 'destructive' });
      return;
    }
    setIsGeneratingTemplate(true);
    try {
      const data = await getSeriesTemplateData(activeOrganizationId);

      const currentYear = new Date().getFullYear();
      const years = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map(String);

      const wb = XLSX.utils.book_new();

      // ── Sheet 1: Series Import ─────────────────────────────────────────────
      const ws = XLSX.utils.aoa_to_sheet([EXPECTED_HEADERS]);
      ws['!cols'] = [{ wch: 36 }, { wch: 18 }, { wch: 8 }, { wch: 16 }, { wch: 16 }, { wch: 40 }];
      ws['!rows'] = [{ hpt: 28 }];

      const reqCols = new Set(['SeriesName', 'AgeCategory', 'Year', 'MaleCutoffDate', 'FemaleCutoffDate']);
      EXPECTED_HEADERS.forEach((h, i) => {
        const cell = ws[XLSX.utils.encode_cell({ r: 0, c: i })];
        if (!cell) return;
        const color = reqCols.has(h) ? '2E75B6' : '1F4E79';
        cell.s = { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 }, fill: { fgColor: { rgb: color } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
      });

      if (!ws['!dataValidation']) ws['!dataValidation'] = [];
      const ageCatFormula = '"' + [...AGE_CATEGORIES].join(',') + '"';
      const yearFormula = '"' + years.join(',') + '"';
      const emailFormula = data.selectorEmails.length > 0
        ? '"' + data.selectorEmails.slice(0, 50).join(',') + '"'
        : null;

      for (let r = 1; r <= 100; r++) {
        EXPECTED_HEADERS.forEach((_, c) => {
          ws[XLSX.utils.encode_cell({ r, c })] = { t: 's', v: '' };
        });
        // AgeCategory dropdown (col 1)
        (ws['!dataValidation'] as any[]).push({
          sqref: XLSX.utils.encode_cell({ r, c: 1 }),
          type: 'list', formula1: ageCatFormula,
          showErrorMessage: true, errorTitle: 'Invalid Value',
          error: 'Please select a valid age category from the dropdown.',
        });
        // Year dropdown (col 2) — also allows free entry via whole number validation
        (ws['!dataValidation'] as any[]).push({
          sqref: XLSX.utils.encode_cell({ r, c: 2 }),
          type: 'list', formula1: yearFormula,
          showErrorMessage: false, // allow free entry of other years
        });
        // SeriesAdminEmails dropdown (col 5) if emails exist
        if (emailFormula) {
          (ws['!dataValidation'] as any[]).push({
            sqref: XLSX.utils.encode_cell({ r, c: 5 }),
            type: 'list', formula1: emailFormula,
            showErrorMessage: false, // allow free entry of multiple emails
          });
        }
      }

      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 100, c: 5 } });
      XLSX.utils.book_append_sheet(wb, ws, 'Series Import');

      // ── Sheet 2: Valid Values ──────────────────────────────────────────────
      const vvRows: string[][] = [];
      vvRows.push(['VALID VALUES REFERENCE', '']);
      vvRows.push(['', '']);
      vvRows.push(['AGE CATEGORIES', '']);
      vvRows.push(['Value', '']);
      [...AGE_CATEGORIES].forEach(c => vvRows.push([c, '']));
      vvRows.push(['', '']);
      vvRows.push(['SUGGESTED YEARS', '']);
      vvRows.push(['Value', '']);
      years.forEach(y => vvRows.push([y, '']));
      vvRows.push(['You may also type any year between 2000–2100', '']);
      vvRows.push(['', '']);
      vvRows.push(['SERIES ADMIN EMAILS (Selectors / Admins in your organization)', '']);
      vvRows.push(['Email', '']);
      if (data.selectorEmails.length > 0) {
        data.selectorEmails.forEach(e => vvRows.push([e, '']));
      } else {
        vvRows.push(['No eligible users found for this organization', '']);
      }
      const vvWs = XLSX.utils.aoa_to_sheet(vvRows);
      vvWs['!cols'] = [{ wch: 55 }, { wch: 20 }];
      [0, vvRows.findIndex(r => r[0] === 'SUGGESTED YEARS'), vvRows.findIndex(r => r[0].startsWith('SERIES ADMIN'))].forEach(r => {
        if (r < 0) return;
        const cell = vvWs[XLSX.utils.encode_cell({ r, c: 0 })];
        if (cell) cell.s = { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 }, fill: { fgColor: { rgb: '0B6E8C' } } };
      });
      XLSX.utils.book_append_sheet(wb, vvWs, 'Valid Values');

      // ── Sheet 3: Instructions ──────────────────────────────────────────────
      const instrRows = [
        ['🏏  Cricket IQ — Series Import Template Instructions', '', '', ''],
        ['', '', '', ''],
        ['COLUMN COLOUR LEGEND', '', '', ''],
        ['Medium Blue', 'Required — must be filled in', '', ''],
        ['Dark Blue', 'Optional', '', ''],
        ['', '', '', ''],
        ['COLUMN RULES', '', '', ''],
        ['Column', 'Required?', 'Rule', ''],
        ['SeriesName', 'YES', 'Must be unique — existing series names will error for that row.', ''],
        ['AgeCategory', 'YES', `Select from dropdown. Must be one of: ${[...AGE_CATEGORIES].join(', ')}.`, ''],
        ['Year', 'YES', 'Select from dropdown or type any 4-digit year between 2000–2100.', ''],
        ['MaleCutoffDate', 'YES', 'Format: MM/DD/YYYY  e.g. 01/01/2008', ''],
        ['FemaleCutoffDate', 'YES', 'Format: MM/DD/YYYY  e.g. 01/01/2008', ''],
        ['SeriesAdminEmails', 'Optional', 'Comma-separated emails of existing users. See Valid Values for eligible emails. Unknown emails are ignored with a warning.', ''],
        ['', '', '', ''],
        ['TIPS', '', '', ''],
        ['• Do NOT change the column headers in row 1 of the Series Import sheet.', '', '', ''],
        ['• AgeCategory has a required dropdown — select from it to avoid errors.', '', '', ''],
        ['• Year shows common years as a dropdown but you may type any valid year.', '', '', ''],
        ['• SeriesAdminEmails shows a dropdown of eligible users — you may also type emails manually.', '', '', ''],
        ['• For multiple admin emails, separate them with commas: admin1@example.com,admin2@example.com', '', '', ''],
        ['• Dates must be typed as MM/DD/YYYY text — not Excel date values.', '', '', ''],
        ['• The system will NOT create new user accounts. Series Admins must pre-exist.', '', '', ''],
        ['• Series are imported into the currently active organization.', '', '', ''],
      ];
      const instrWs = XLSX.utils.aoa_to_sheet(instrRows);
      instrWs['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 80 }, { wch: 10 }];
      instrWs['!rows'] = [{ hpt: 30 }];
      XLSX.utils.book_append_sheet(wb, instrWs, 'Instructions');

      XLSX.writeFile(wb, 'series_import_template.xlsx');
      toast({
        title: 'Template downloaded!',
        description: `Includes ${[...AGE_CATEGORIES].length} age categories and ${data.selectorEmails.length} selector emails for your organization.`,
      });
    } catch (e: any) {
      console.error('Template generation error:', e);
      toast({ title: 'Error', description: 'Could not generate template. Please try again.', variant: 'destructive' });
    } finally {
      setIsGeneratingTemplate(false);
    }
  };

  // ── Results renderer ───────────────────────────────────────────────────────
  const renderResults = (result: SeriesImportResult) => (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ListChecks className="h-5 w-5" /> Import Results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`flex items-center gap-2 ${result.errors.length === 0 && result.successfulImports > 0 ? 'text-green-600' : 'text-destructive'}`}>
          {result.errors.length === 0 && result.successfulImports > 0 ? <CheckCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          <span>{result.message}</span>
        </div>
        <p>Successfully imported: <strong className="text-green-600">{result.successfulImports}</strong> series.</p>
        <p>Failed to import: <strong className="text-destructive">{result.failedImports}</strong> series.</p>
        {result.errors && result.errors.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-semibold text-destructive">Error Details:</h4>
            <ScrollArea className="h-60 rounded-md border p-3">
              <ul className="space-y-3">
                {result.errors.map((err, i) => (
                  <li key={i} className="text-xs p-2 bg-destructive/10 rounded-md">
                    <p><strong>Row {err.rowNumber}:</strong> {err.error}</p>
                    <p className="mt-1 text-muted-foreground">Data: <code>{JSON.stringify(err.csvRow)}</code></p>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (authLoading) {
    return <div className="flex justify-center items-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /><span className="ml-2">Loading auth...</span></div>;
  }

  if (!activeOrganizationId) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>No Active Organization</AlertTitle>
        <AlertDescription>Please select an active organization from the navbar dropdown before importing series.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── CSV section ── */}
      {mode === 'csv' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="csv-file" className="text-base">Select CSV File</Label>
            <Input id="csv-file" type="file" accept=".csv" onChange={handleFileChange} disabled={isLoading}
              className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" />
            {fileName && <p className="text-sm text-muted-foreground">Selected: {fileName}</p>}
            {parsedData.length > 0 && !isLoading && <p className="text-sm text-green-600">Parsed {parsedData.length} rows. Ready to import.</p>}
          </div>
          <Button onClick={handleSubmit} disabled={!file || parsedData.length === 0 || isLoading} className="w-full sm:w-auto bg-primary hover:bg-primary/90">
            {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...</> : <><Upload className="mr-2 h-4 w-4" /> Import Series ({parsedData.length} rows)</>}
          </Button>
          {isLoading && <div className="space-y-2"><Label className="text-sm">Progress:</Label><Progress value={currentProgress} /><p className="text-xs text-muted-foreground text-center">{currentProgress}%</p></div>}
          {importResult && renderResults(importResult)}
        </>
      )}

      {/* ── Excel section ── */}
      {mode === 'xlsx' && (
        <>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Download the Excel template — it includes a dropdown for AgeCategory and an Instructions sheet with all field rules.
            </p>
            <Button variant="outline" onClick={handleDownloadTemplate} disabled={isGeneratingTemplate || !activeOrganizationId} className="border-green-600 text-green-700 hover:bg-green-50 gap-2">
              {isGeneratingTemplate
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
                : <><FileSpreadsheet className="h-4 w-4" /> Download Excel Template <Download className="h-3.5 w-3.5" /></>}
            </Button>
            {!activeOrganizationId && <p className="text-xs text-destructive">Select an active organization to generate the template.</p>}
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="xlsx-series-file" className="text-base">Select Excel File</Label>
            <Input id="xlsx-series-file" type="file" accept=".xlsx,.xls" onChange={handleXlsxFileChange} disabled={xlsxIsLoading}
              className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100" />
            {xlsxFileName && <p className="text-sm text-muted-foreground">Selected: {xlsxFileName}</p>}
            {xlsxParsedData.length > 0 && !xlsxIsLoading && <p className="text-sm text-green-600">Found {xlsxParsedData.length} rows. Ready to import.</p>}
          </div>
          <Button onClick={handleXlsxSubmit} disabled={!xlsxFile || xlsxParsedData.length === 0 || xlsxIsLoading} className="w-full sm:w-auto bg-green-700 hover:bg-green-800 text-white">
            {xlsxIsLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...</> : <><Upload className="mr-2 h-4 w-4" /> Import from Excel ({xlsxParsedData.length} rows)</>}
          </Button>
          {xlsxIsLoading && <div className="space-y-2"><Label className="text-sm">Progress:</Label><Progress value={xlsxProgress} /><p className="text-xs text-muted-foreground text-center">{xlsxProgress}%</p></div>}
          {xlsxImportResult && renderResults(xlsxImportResult)}
        </>
      )}
    </div>
  );
}
