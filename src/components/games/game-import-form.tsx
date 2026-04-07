'use client';

import { useState, type ChangeEvent } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { importGamesAction } from '@/lib/actions/import-actions';
import { getGamesTemplateData } from '@/lib/actions/games-template-action';
import type { CsvGameImportRow, GameImportResult } from '@/types';
import { Loader2, Upload, AlertTriangle, CheckCircle, ListChecks, FileText, FileSpreadsheet, Download } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/auth-context';

const EXPECTED_HEADERS = ['GameDate', 'VenueName', 'SeriesName', 'Team1Name', 'Team2Name'];

interface GameImportFormProps {
  mode?: 'csv' | 'xlsx';
}

export function GameImportForm({ mode = 'csv' }: GameImportFormProps) {
  const { activeOrganizationId } = useAuth();
  const { toast } = useToast();

  // ── CSV state ──────────────────────────────────────────────────────────────
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<CsvGameImportRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [importResult, setImportResult] = useState<GameImportResult | null>(null);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);

  // ── Excel state ────────────────────────────────────────────────────────────
  const [xlsxFile, setXlsxFile] = useState<File | null>(null);
  const [xlsxFileName, setXlsxFileName] = useState<string | null>(null);
  const [xlsxParsedData, setXlsxParsedData] = useState<CsvGameImportRow[]>([]);
  const [xlsxIsLoading, setXlsxIsLoading] = useState(false);
  const [xlsxImportResult, setXlsxImportResult] = useState<GameImportResult | null>(null);
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
          toast({ title: 'Invalid CSV Headers', description: `CSV must contain: ${EXPECTED_HEADERS.join(', ')}`, variant: 'destructive' });
          setFile(null); setFileName(null); event.target.value = ''; return;
        }
        const validRows = results.data.filter(row => EXPECTED_HEADERS.some(h => row[h] && row[h].trim() !== ''));
        setParsedData(validRows as CsvGameImportRow[]);
      },
      error: () => {
        toast({ title: 'CSV Parsing Error', description: 'Could not parse the CSV file.', variant: 'destructive' });
        setFile(null); setFileName(null); event.target.value = '';
      },
    });
  };

  const handleSubmit = async () => {
    if (!file || parsedData.length === 0) {
      toast({ title: 'No Data to Import', description: 'Please select a valid CSV file.', variant: 'destructive' }); return;
    }
    setIsLoading(true); setImportResult(null); setCurrentProgress(0);
    try {
      const interval = setInterval(() => setCurrentProgress(p => p < 90 ? p + 10 : p), 200);
      const result = await importGamesAction(parsedData);
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
        const sheetName = workbook.SheetNames[0];
        const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false });
        if (rows.length === 0) { toast({ title: 'Empty File', description: 'No data rows found.', variant: 'destructive' }); setXlsxFile(null); setXlsxFileName(null); event.target.value = ''; return; }
        const headers = Object.keys(rows[0]);
        if (!EXPECTED_HEADERS.every(h => headers.includes(h))) {
          toast({ title: 'Invalid Headers', description: `Excel must contain: ${EXPECTED_HEADERS.join(', ')}`, variant: 'destructive' });
          setXlsxFile(null); setXlsxFileName(null); event.target.value = ''; return;
        }
        const validRows = rows.filter(row => EXPECTED_HEADERS.some(h => row[h] && String(row[h]).trim() !== '')) as CsvGameImportRow[];
        setXlsxParsedData(validRows);
        toast({ title: 'Excel file ready', description: `${validRows.length} rows found.` });
      } catch {
        toast({ title: 'Excel Parsing Error', description: 'Could not read the Excel file.', variant: 'destructive' });
        setXlsxFile(null); setXlsxFileName(null); event.target.value = '';
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  const handleXlsxSubmit = async () => {
    if (!xlsxFile || xlsxParsedData.length === 0) {
      toast({ title: 'No Data to Import', description: 'Please select a valid Excel file.', variant: 'destructive' }); return;
    }
    setXlsxIsLoading(true); setXlsxImportResult(null); setXlsxProgress(0);
    try {
      const interval = setInterval(() => setXlsxProgress(p => p < 90 ? p + 10 : p), 200);
      const result = await importGamesAction(xlsxParsedData);
      clearInterval(interval); setXlsxProgress(100); setXlsxImportResult(result);
      toast({ title: result.success ? 'Import Completed' : 'Import Failed', description: `${result.successfulImports} imported, ${result.failedImports} failed.`, variant: result.success ? 'default' : 'destructive' });
    } catch {
      toast({ title: 'Import Error', description: 'An unexpected error occurred.', variant: 'destructive' });
    } finally { setXlsxIsLoading(false); }
  };

  // ── Dynamic template generation ────────────────────────────────────────────
  const handleDownloadTemplate = async () => {
    if (!activeOrganizationId) {
      toast({ title: 'No Organization', description: 'Please select an active organization first.', variant: 'destructive' }); return;
    }
    setIsGeneratingTemplate(true);
    try {
      const data = await getGamesTemplateData(activeOrganizationId);
      const wb = XLSX.utils.book_new();

      // ── Sheet 1: Games Import ──────────────────────────────────────────────
      const ws = XLSX.utils.aoa_to_sheet([EXPECTED_HEADERS]);

      // Style header row
      const headerStyle = { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 }, fill: { fgColor: { rgb: '0F2A54' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
      EXPECTED_HEADERS.forEach((_, i) => {
        const cell = ws[XLSX.utils.encode_cell({ r: 0, c: i })];
        if (cell) cell.s = headerStyle;
      });

      // Column widths
      ws['!cols'] = [{ wch: 16 }, { wch: 24 }, { wch: 36 }, { wch: 28 }, { wch: 28 }];
      ws['!rows'] = [{ hpt: 28 }];

      // Add 50 blank data rows
      for (let r = 1; r <= 50; r++) {
        EXPECTED_HEADERS.forEach((_, c) => {
          const cellRef = XLSX.utils.encode_cell({ r, c });
          ws[cellRef] = { t: 's', v: '' };
        });
      }

      // Update sheet range
      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 50, c: 4 } });

      // Data validations for dropdowns
      if (!ws['!dataValidation']) ws['!dataValidation'] = [];

      const makeDropdown = (col: number, list: string[]) => {
        if (list.length === 0) return;
        const formula = '"' + list.slice(0, 50).join(',') + '"'; // Excel limit
        for (let r = 1; r <= 50; r++) {
          ws['!dataValidation']!.push({
            sqref: XLSX.utils.encode_cell({ r, c: col }),
            type: 'list',
            formula1: formula,
            showErrorMessage: true,
            errorTitle: 'Invalid Value',
            error: 'Please select from the dropdown list.',
          });
        }
      };

      makeDropdown(2, data.series.map(s => s.name));   // SeriesName col C
      makeDropdown(1, data.venues.map(v => v.name));    // VenueName col B
      makeDropdown(3, data.teams.map(t => t.name));     // Team1Name col D
      makeDropdown(4, data.teams.map(t => t.name));     // Team2Name col E

      XLSX.utils.book_append_sheet(wb, ws, 'Games Import');

      // ── Sheet 2: Valid Values ──────────────────────────────────────────────
      const vvRows: string[][] = [];
      vvRows.push(['VALID VALUES REFERENCE', '', '', '', '']);
      vvRows.push(['Use this sheet to find which venues and teams belong to each series.', '', '', '', '']);
      vvRows.push(['', '', '', '', '']);

      // Series list
      vvRows.push(['ACTIVE SERIES', '', '', '', '']);
      vvRows.push(['Series Name', '', '', '', '']);
      data.series.forEach(s => vvRows.push([s.name, '', '', '', '']));
      vvRows.push(['', '', '', '', '']);

      // Venues per series
      vvRows.push(['VENUES BY SERIES', '', '', '', '']);
      vvRows.push(['Series Name', 'Venue Name', '', '', '']);
      data.venues.forEach(v => {
        v.seriesNames.forEach(sn => vvRows.push([sn, v.name, '', '', '']));
      });
      vvRows.push(['', '', '', '', '']);

      // Teams per series
      vvRows.push(['TEAMS BY SERIES', '', '', '', '']);
      vvRows.push(['Series Name', 'Team Name', '', '', '']);
      data.teams.forEach(t => {
        t.seriesNames.forEach(sn => vvRows.push([sn, t.name, '', '', '']));
      });

      const vvWs = XLSX.utils.aoa_to_sheet(vvRows);
      vvWs['!cols'] = [{ wch: 36 }, { wch: 28 }, { wch: 20 }, { wch: 20 }, { wch: 20 }];

      // Style the section headers
      const sectionRows = [0, 3, vvRows.findIndex(r => r[0] === 'VENUES BY SERIES'), vvRows.findIndex(r => r[0] === 'TEAMS BY SERIES')];
      sectionRows.forEach(r => {
        const cell = vvWs[XLSX.utils.encode_cell({ r, c: 0 })];
        if (cell) cell.s = { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 }, fill: { fgColor: { rgb: '0B6E8C' } } };
      });

      XLSX.utils.book_append_sheet(wb, vvWs, 'Valid Values');

      // ── Sheet 3: Instructions ──────────────────────────────────────────────
      const instrRows = [
        ['🏏  Cricket IQ — Game Import Template Instructions', '', '', '', ''],
        ['', '', '', '', ''],
        ['COLUMN RULES', '', '', '', ''],
        ['Column', 'Required', 'Rule', '', ''],
        ['GameDate', 'YES', 'Format: MM/DD/YYYY  e.g. 04/15/2026', '', ''],
        ['SeriesName', 'YES', 'Must match an active series in your organization. See Valid Values sheet.', '', ''],
        ['VenueName', 'YES', 'Must match a venue associated with the selected series. See Valid Values sheet.', '', ''],
        ['Team1Name', 'YES', 'Must match a team associated with the selected series. See Valid Values sheet.', '', ''],
        ['Team2Name', 'YES', 'Must match a different team in the same series. Cannot be the same as Team1Name.', '', ''],
        ['', '', '', '', ''],
        ['IMPORTANT NOTES', '', '', '', ''],
        ['• Series, venues, and teams must already exist in the system. They will NOT be created from this file.', '', '', '', ''],
        ['• Player rosters are auto-populated with age-eligible players from each team\'s full roster.', '', '', '', ''],
        ['• Selectors can be assigned to games after import from the Game Details page.', '', '', '', ''],
        ['• Duplicate games (same series + date + teams) will be skipped with an error.', '', '', '', ''],
        ['• Do NOT change the column headers in the Games Import sheet.', '', '', '', ''],
        ['• Use the Valid Values sheet to look up which venues and teams belong to each series.', '', '', '', ''],
        ['• Dates must be typed as MM/DD/YYYY text — not Excel date values.', '', '', '', ''],
      ];

      const instrWs = XLSX.utils.aoa_to_sheet(instrRows);
      instrWs['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 70 }, { wch: 10 }, { wch: 10 }];
      instrWs['!rows'] = [{ hpt: 30 }];

      // Style title
      const titleCell = instrWs['A1'];
      if (titleCell) titleCell.s = { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 13 }, fill: { fgColor: { rgb: '0F2A54' } }, alignment: { horizontal: 'center' } };

      // Style section headers
      ['A3', 'A11'].forEach(ref => {
        const c = instrWs[ref];
        if (c) c.s = { font: { bold: true, color: { rgb: '0F2A54' }, sz: 11 } };
      });

      // Style column header row
      ['A4', 'B4', 'C4'].forEach(ref => {
        const c = instrWs[ref];
        if (c) c.s = { font: { bold: true }, fill: { fgColor: { rgb: 'E0EAF2' } } };
      });

      XLSX.utils.book_append_sheet(wb, instrWs, 'Instructions');

      // ── Download ───────────────────────────────────────────────────────────
      XLSX.writeFile(wb, 'game_import_template.xlsx');
      toast({ title: 'Template downloaded!', description: `Includes ${data.series.length} series, ${data.venues.length} venues, ${data.teams.length} teams.` });
    } catch (e: any) {
      console.error('Template generation error:', e);
      toast({ title: 'Error', description: 'Could not generate template. Please try again.', variant: 'destructive' });
    } finally {
      setIsGeneratingTemplate(false);
    }
  };

  // ── Results renderer ───────────────────────────────────────────────────────
  const renderResults = (result: GameImportResult) => (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ListChecks className="h-5 w-5" /> Import Results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`flex items-center gap-2 ${result.success ? 'text-green-600' : 'text-destructive'}`}>
          {result.success ? <CheckCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          <span>{result.message}</span>
        </div>
        <p>Successfully imported: <strong className="text-green-600">{result.successfulImports}</strong> games.</p>
        <p>Failed to import: <strong className="text-destructive">{result.failedImports}</strong> games.</p>
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

  // ── Render ─────────────────────────────────────────────────────────────────
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
            {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...</> : <><Upload className="mr-2 h-4 w-4" /> Import Games ({parsedData.length} rows)</>}
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
              Download the Excel template — it includes dropdowns pre-filled with your organization's active series, venues, and teams, plus a Valid Values reference sheet.
            </p>
            <Button variant="outline" onClick={handleDownloadTemplate} disabled={isGeneratingTemplate || !activeOrganizationId} className="border-green-600 text-green-700 hover:bg-green-50 gap-2">
              {isGeneratingTemplate ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</> : <><FileSpreadsheet className="h-4 w-4" /> Download Excel Template <Download className="h-3.5 w-3.5" /></>}
            </Button>
            {!activeOrganizationId && <p className="text-xs text-destructive">Select an active organization to generate the template.</p>}
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="xlsx-file" className="text-base">Select Excel File</Label>
            <Input id="xlsx-file" type="file" accept=".xlsx,.xls" onChange={handleXlsxFileChange} disabled={xlsxIsLoading}
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
