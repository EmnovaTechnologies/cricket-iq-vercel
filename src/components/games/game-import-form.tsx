'use client';

import { useState, type ChangeEvent } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx'; // used for parsing uploaded Excel files
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
        // Always use the first sheet named 'Games Import' if present, else first sheet
        const sheetName = workbook.SheetNames.find(n => n === 'Games Import') || workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        // Read headers explicitly from row 1
        const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:E1');
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
        // Skip header row (index 0) and filter empty rows
        const validRows = rows.slice(1).filter(row => EXPECTED_HEADERS.some(h => row[h] && String(row[h]).trim() !== '')) as CsvGameImportRow[];
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

      // Dynamic import of exceljs (client-side)
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Cricket IQ';

      // ── COLORS ────────────────────────────────────────────────────────────
      const navy   = '0F2A54';
      const teal   = '0B6E8C';
      const amber  = 'F4B942';
      const offwh  = 'F4F7FA';
      const white  = 'FFFFFF';
      const green  = '1D7A5F';

      // ── Sheet 1: Hidden Lists (for dropdown source data) ──────────────────
      const listsSheet = wb.addWorksheet('_Lists', { state: 'veryHidden' });
      const seriesNames = data.series.map(s => s.name);
      const venueNames  = data.venues.map(v => v.name);
      const teamNames   = data.teams.map(t => t.name);

      // Column A = series, B = venues, C = teams
      const maxRows = Math.max(seriesNames.length, venueNames.length, teamNames.length);
      for (let i = 0; i < maxRows; i++) {
        listsSheet.getCell(i + 1, 1).value = seriesNames[i] || null;
        listsSheet.getCell(i + 1, 2).value = venueNames[i]  || null;
        listsSheet.getCell(i + 1, 3).value = teamNames[i]   || null;
      }

      // Define named ranges for each list
      const sLen = seriesNames.length || 1;
      const vLen = venueNames.length  || 1;
      const tLen = teamNames.length   || 1;
      wb.definedNames.add(`_Lists!$A$1:$A$${sLen}`, 'SeriesList');
      wb.definedNames.add(`_Lists!$B$1:$B$${vLen}`, 'VenueList');
      wb.definedNames.add(`_Lists!$C$1:$C$${tLen}`, 'TeamList');

      // ── Sheet 2: Games Import ─────────────────────────────────────────────
      const ws = wb.addWorksheet('Games Import');
      ws.views = [{ state: 'frozen', ySplit: 1 }];

      const headers = [
        { key: 'GameDate',   label: 'GameDate',   width: 16, required: true,  color: '2E75B6' },
        { key: 'SeriesName', label: 'SeriesName',  width: 36, required: true,  color: '2E75B6' },
        { key: 'VenueName',  label: 'VenueName',   width: 28, required: true,  color: '2E75B6' },
        { key: 'Team1Name',  label: 'Team1Name',   width: 28, required: true,  color: '2E75B6' },
        { key: 'Team2Name',  label: 'Team2Name',   width: 28, required: true,  color: '2E75B6' },
      ];

      // Header row
      const headerRow = ws.getRow(1);
      headerRow.height = 32;
      headers.forEach((h, i) => {
        ws.getColumn(i + 1).width = h.width;
        const cell = headerRow.getCell(i + 1);
        cell.value = h.label;
        cell.font = { bold: true, color: { argb: 'FF' + white }, size: 11, name: 'Arial' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + h.color } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD0DCE8' } },
          bottom: { style: 'thin', color: { argb: 'FFD0DCE8' } },
          left: { style: 'thin', color: { argb: 'FFD0DCE8' } },
          right: { style: 'thin', color: { argb: 'FFD0DCE8' } },
        };
      });

      // Data rows with dropdowns
      for (let r = 2; r <= 201; r++) {
        const row = ws.getRow(r);
        row.height = 18;
        headers.forEach((_, i) => {
          const cell = row.getCell(i + 1);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + white } };
          cell.font = { name: 'Arial', size: 10 };
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE8E8E8' } },
            bottom: { style: 'thin', color: { argb: 'FFE8E8E8' } },
            left: { style: 'thin', color: { argb: 'FFE8E8E8' } },
            right: { style: 'thin', color: { argb: 'FFE8E8E8' } },
          };
        });

        // Dropdowns using named ranges
        ws.getCell(r, 2).dataValidation = {
          type: 'list', allowBlank: true, showErrorMessage: true,
          formulae: ['SeriesList'],
          errorStyle: 'warning', errorTitle: 'Invalid Series',
          error: 'Please select from the dropdown list.',
          showDropDown: false,
        };
        ws.getCell(r, 3).dataValidation = {
          type: 'list', allowBlank: true, showErrorMessage: true,
          formulae: ['VenueList'],
          errorStyle: 'warning', errorTitle: 'Invalid Venue',
          error: 'Please select from the dropdown list.',
          showDropDown: false,
        };
        ws.getCell(r, 4).dataValidation = {
          type: 'list', allowBlank: true, showErrorMessage: true,
          formulae: ['TeamList'],
          errorStyle: 'warning', errorTitle: 'Invalid Team',
          error: 'Please select from the dropdown list.',
          showDropDown: false,
        };
        ws.getCell(r, 5).dataValidation = {
          type: 'list', allowBlank: true, showErrorMessage: true,
          formulae: ['TeamList'],
          errorStyle: 'warning', errorTitle: 'Invalid Team',
          error: 'Please select from the dropdown list.',
          showDropDown: false,
        };
      }

      // ── Sheet 3: Valid Values ─────────────────────────────────────────────
      const vvWs = wb.addWorksheet('Valid Values');
      vvWs.getColumn(1).width = 38;
      vvWs.getColumn(2).width = 30;

      const addSection = (title: string, colHeaders: string[], rows: string[][]) => {
        const titleRow = vvWs.addRow([title]);
        titleRow.height = 24;
        const tc = titleRow.getCell(1);
        tc.font = { bold: true, color: { argb: 'FF' + white }, size: 11, name: 'Arial' };
        tc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + teal } };
        tc.alignment = { vertical: 'middle' };

        const hRow = vvWs.addRow(colHeaders);
        hRow.height = 18;
        colHeaders.forEach((_, i) => {
          const c = hRow.getCell(i + 1);
          c.font = { bold: true, name: 'Arial', size: 10 };
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + offwh } };
        });

        rows.forEach(r => {
          const dr = vvWs.addRow(r);
          dr.height = 16;
          r.forEach((_, i) => {
            dr.getCell(i + 1).font = { name: 'Arial', size: 10 };
          });
        });
        vvWs.addRow([]);
      };

      addSection('ACTIVE SERIES', ['Series Name'],
        data.series.map(s => [s.name])
      );

      addSection('VENUES BY SERIES', ['Series Name', 'Venue Name'],
        data.venues.flatMap(v => v.seriesNames.map(sn => [sn, v.name]))
          .sort((a, b) => a[0].localeCompare(b[0]))
      );

      addSection('TEAMS BY SERIES', ['Series Name', 'Team Name'],
        data.teams.flatMap(t => t.seriesNames.map(sn => [sn, t.name]))
          .sort((a, b) => a[0].localeCompare(b[0]))
      );

      // ── Sheet 4: Instructions ─────────────────────────────────────────────
      const instrWs = wb.addWorksheet('Instructions');
      instrWs.getColumn(1).width = 22;
      instrWs.getColumn(2).width = 14;
      instrWs.getColumn(3).width = 68;

      const addInstrRow = (vals: string[], bold = false, bgColor?: string) => {
        const row = instrWs.addRow(vals);
        row.height = bold ? 22 : 18;
        vals.forEach((_, i) => {
          const c = row.getCell(i + 1);
          c.font = { bold, name: 'Arial', size: bold ? 11 : 10, color: { argb: bgColor ? 'FF' + white : 'FF000000' } };
          if (bgColor) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgColor } };
          c.alignment = { wrapText: true, vertical: 'middle' };
        });
        return row;
      };

      // Title
      const tRow = instrWs.addRow(['🏏  Cricket IQ — Game Import Template Instructions', '', '']);
      tRow.height = 30;
      const tCell = tRow.getCell(1);
      tCell.font = { bold: true, color: { argb: 'FF' + white }, size: 13, name: 'Arial' };
      tCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + navy } };
      tCell.alignment = { horizontal: 'center', vertical: 'middle' };
      instrWs.mergeCells('A1:C1');

      instrWs.addRow([]);
      addInstrRow(['COLUMN RULES', '', ''], true, navy);
      addInstrRow(['Column', 'Required', 'Rule'], true);

      const rules = [
        ['GameDate',   'YES', 'Date of the game. Format: MM/DD/YYYY  e.g. 04/15/2026. Type as text — do not use Excel date format.'],
        ['SeriesName', 'YES', 'Must match an active series in your organization. Select from the dropdown or refer to the Valid Values sheet.'],
        ['VenueName',  'YES', 'Must match a venue already associated with the selected series. Select from dropdown or see Valid Values sheet.'],
        ['Team1Name',  'YES', 'Must match a team already in the selected series. Select from dropdown or see Valid Values sheet.'],
        ['Team2Name',  'YES', 'Must be a different team in the same series. Cannot be the same as Team1Name.'],
      ];
      rules.forEach(r => addInstrRow(r));

      instrWs.addRow([]);
      addInstrRow(['IMPORTANT NOTES', '', ''], true, teal);
      [
        '• The system will NOT create new Series, Venues, or Teams — they must already exist.',
        '• Player rosters are auto-populated with age-eligible players from each team\'s full roster.',
        '• Selectors can be assigned after import from the Game Details page.',
        '• Duplicate games (same series + date + teams) will be skipped with an error.',
        '• Do NOT rename or reorder the column headers in the Games Import sheet.',
        '• Use the Valid Values sheet to find which venues and teams belong to each series.',
        '• Dropdowns on the Games Import sheet show all valid values for your organization.',
      ].forEach(tip => addInstrRow([tip, '', '']));

      // ── Download ──────────────────────────────────────────────────────────
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'game_import_template.xlsx';
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: 'Template downloaded!',
        description: `Includes ${data.series.length} series, ${data.venues.length} venues, ${data.teams.length} teams as dropdown options.`,
      });
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
