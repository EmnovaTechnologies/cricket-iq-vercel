

'use client';

import { useState, type ChangeEvent } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { importPlayersAction } from '@/lib/actions/import-actions';
import { getPlayersTemplateData } from '@/lib/actions/players-template-action';
import type { CsvPlayerImportRow, PlayerImportResult } from '@/types';
import { Loader2, Upload, AlertTriangle, CheckCircle, ListChecks, FileSpreadsheet, Download } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/auth-context';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';

const EXPECTED_HEADERS = [
  'FirstName', 'LastName', 'CricClubsID', 'DateOfBirth', 'Gender', 'PrimarySkill',
  'DominantHandBatting', 'BattingOrder', 'DominantHandBowling',
  'BowlingStyle', 'PrimaryClubName', 'PrimaryTeamName'
];

interface PlayerImportFormProps {
  mode?: 'csv' | 'xlsx';
}

export function PlayerImportForm({ mode = 'csv' }: PlayerImportFormProps) {
  const { activeOrganizationId, loading: authLoading } = useAuth(); // Get activeOrganizationId
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<CsvPlayerImportRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [importResult, setImportResult] = useState<PlayerImportResult | null>(null);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const { toast } = useToast();

  // ── Excel import state ────────────────────────────────────────────────────
  const [xlsxFile, setXlsxFile] = useState<File | null>(null);
  const [xlsxFileName, setXlsxFileName] = useState<string | null>(null);
  const [xlsxParsedData, setXlsxParsedData] = useState<CsvPlayerImportRow[]>([]);
  const [xlsxIsLoading, setXlsxIsLoading] = useState(false);
  const [xlsxImportResult, setXlsxImportResult] = useState<PlayerImportResult | null>(null);
  const [xlsxProgress, setXlsxProgress] = useState(0);
  const [isGeneratingTemplate, setIsGeneratingTemplate] = useState(false);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(null);
    setParsedData([]);
    setImportResult(null);
    setCurrentProgress(0);
    setFileName(null);

    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== 'text/csv') {
        toast({
          title: 'Invalid File Type',
          description: 'Please upload a CSV file.',
          variant: 'destructive',
        });
        event.target.value = '';
        return;
      }
      setFile(selectedFile);
      setFileName(selectedFile.name);
      Papa.parse<Record<string, string>>(selectedFile, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const headers = results.meta.fields;
          if (!headers || !EXPECTED_HEADERS.every(h => headers.includes(h))) {
            toast({
              title: 'Invalid CSV Headers',
              description: `CSV must contain headers: ${EXPECTED_HEADERS.join(', ')}. Found: ${headers?.join(', ') || 'None'}`,
              variant: 'destructive',
            });
            setFile(null);
            setFileName(null);
            event.target.value = '';
            return;
          }
          const validRows = results.data.filter(row =>
            EXPECTED_HEADERS.some(header => row[header] && row[header].trim() !== '')
          );
          setParsedData(validRows as CsvPlayerImportRow[]);
        },
        error: (error) => {
          console.error('Error parsing CSV:', error);
          toast({
            title: 'CSV Parsing Error',
            description: 'Could not parse the CSV file. Please check its format.',
            variant: 'destructive',
          });
          setFile(null);
          setFileName(null);
          event.target.value = '';
        },
      });
    }
  };

  const handleSubmit = async () => {
    if (!activeOrganizationId) {
      toast({ title: 'Error', description: 'No active organization selected. Please select an organization first.', variant: 'destructive' });
      return;
    }
    if (!file || parsedData.length === 0) {
      toast({
        title: 'No Data to Import',
        description: 'Please select a valid CSV file with data.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    setImportResult(null);
    setCurrentProgress(0);

    try {
      let progressInterval = setInterval(() => {
        setCurrentProgress(prev => (prev < 90 ? prev + 10 : prev));
      }, 200);

      const result = await importPlayersAction(parsedData, activeOrganizationId); // Pass activeOrganizationId
      clearInterval(progressInterval);
      setCurrentProgress(100);
      setImportResult(result);

      if (result.success && result.successfulImports > 0) {
        toast({
          title: 'Import Process Completed',
          description: `${result.successfulImports} players imported successfully. ${result.failedImports} players failed.`,
        });
      } else if (result.failedImports > 0 && result.successfulImports === 0) {
         toast({
          title: 'Import Process Failed',
          description: `No players imported. ${result.failedImports} players had errors. ${result.message || ''}`,
          variant: 'destructive',
        });
      } else {
         toast({
          title: 'Import Completed (No changes or all failed)',
          description: result.message || 'No players were successfully imported. Check details below.',
          variant: result.errors.length > 0 ? 'destructive' : 'default',
        });
      }
    } catch (error) {
      console.error('Error during import:', error);
      toast({
        title: 'Import Error',
        description: 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ── Excel file handler ────────────────────────────────────────────────────
  const handleXlsxFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setXlsxFile(null);
    setXlsxParsedData([]);
    setXlsxImportResult(null);
    setXlsxProgress(0);
    setXlsxFileName(null);

    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.match(/\.(xlsx|xls)$/i)) {
      toast({ title: 'Invalid File Type', description: 'Please upload an Excel file (.xlsx or .xls).', variant: 'destructive' });
      event.target.value = '';
      return;
    }

    setXlsxFileName(selectedFile.name);
    setXlsxFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', raw: false });
        // Use 'Players Import' sheet if present, else first sheet
        const sheetName = workbook.SheetNames.find(n => n === 'Players Import') || workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        // Read headers explicitly from row 1
        const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:L1');
        const headers: string[] = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c })];
          headers.push(cell ? String(cell.v).trim() : '');
        }
        if (!EXPECTED_HEADERS.every(h => headers.includes(h))) {
          toast({
            title: 'Invalid Excel Headers',
            description: `Excel must contain: ${EXPECTED_HEADERS.join(', ')}. Found: ${headers.filter(Boolean).join(', ')}`,
            variant: 'destructive',
          });
          setXlsxFile(null); setXlsxFileName(null); event.target.value = '';
          return;
        }
        const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false, header: headers });
        // Skip header row (index 0), filter empty rows
        const validRows = rows.slice(1).filter(row =>
          EXPECTED_HEADERS.some(h => row[h] && String(row[h]).trim() !== '')
        ) as CsvPlayerImportRow[];
        setXlsxParsedData(validRows);
        toast({ title: 'Excel file ready', description: `${validRows.length} rows found. Click Import to proceed.` });
      } catch (err) {
        console.error('Error reading Excel file:', err);
        toast({ title: 'Excel Parsing Error', description: 'Could not read the Excel file. Please check its format.', variant: 'destructive' });
        setXlsxFile(null); setXlsxFileName(null); event.target.value = '';
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  // ── Dynamic template download ─────────────────────────────────────────────
  const handleDownloadTemplate = async () => {
    if (!activeOrganizationId) {
      toast({ title: 'No Organization', description: 'Please select an active organization first.', variant: 'destructive' });
      return;
    }
    setIsGeneratingTemplate(true);
    try {
      const data = await getPlayersTemplateData(activeOrganizationId);

      const LISTS: Record<string, string[]> = {
        Gender:             ['Male', 'Female'],
        PrimarySkill:       ['Batting', 'Bowling', 'Wicket Keeping'],
        DominantHandBatting:['Right Hand', 'Left Hand'],
        BattingOrder:       ['Top Order', 'Middle Order', 'Low Order'],
        DominantHandBowling:['Right Hand', 'Left Hand'],
        BowlingStyle:       ['Fast', 'Medium', 'Off Spin', 'Leg Spin', 'Left Hand - Orthodox', 'Left Hand - Unorthodox'],
        PrimaryClubName:    data.clubs,
        PrimaryTeamName:    data.teams,
      };

      const HEADERS = [
        { key: 'FirstName',          label: 'FirstName',          width: 16, color: '2E75B6' }, // required
        { key: 'LastName',           label: 'LastName',           width: 16, color: '2E75B6' }, // required
        { key: 'CricClubsID',        label: 'CricClubsID',        width: 18, color: '1F4E79' },
        { key: 'DateOfBirth',        label: 'DateOfBirth',        width: 16, color: '1F4E79' },
        { key: 'Gender',             label: 'Gender',             width: 12, color: '1F4E79' },
        { key: 'PrimarySkill',       label: 'PrimarySkill',       width: 20, color: '1F4E79' },
        { key: 'DominantHandBatting',label: 'DominantHandBatting',width: 22, color: '1F4E79' },
        { key: 'BattingOrder',       label: 'BattingOrder',       width: 18, color: '1F4E79' },
        { key: 'DominantHandBowling',label: 'DominantHandBowling',width: 22, color: 'F4B942' }, // conditional
        { key: 'BowlingStyle',       label: 'BowlingStyle',       width: 32, color: 'F4B942' }, // conditional
        { key: 'PrimaryClubName',    label: 'PrimaryClubName',    width: 22, color: '1F4E79' },
        { key: 'PrimaryTeamName',    label: 'PrimaryTeamName',    width: 26, color: '1F4E79' },
      ];

      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Cricket IQ';

      const white = 'FFFFFF';
      const offwh = 'F4F7FA';
      const teal  = '0B6E8C';
      const navy  = '0F2A54';

      // ── Hidden _Lists sheet ───────────────────────────────────────────────
      const listsSheet = wb.addWorksheet('_Lists', { state: 'veryHidden' });
      const listKeys = Object.keys(LISTS);
      const maxLen = Math.max(...listKeys.map(k => LISTS[k].length), 1);
      for (let i = 0; i < maxLen; i++) {
        listKeys.forEach((key, col) => {
          listsSheet.getCell(i + 1, col + 1).value = LISTS[key][i] || null;
        });
      }
      // Define named ranges
      listKeys.forEach((key, col) => {
        const len = LISTS[key].length || 1;
        const colLetter = String.fromCharCode(65 + col);
        wb.definedNames.add(`_Lists!$${colLetter}$1:$${colLetter}$${len}`, `${key}List`);
      });

      // ── Sheet 1: Players Import ───────────────────────────────────────────
      const ws = wb.addWorksheet('Players Import');
      ws.views = [{ state: 'frozen', ySplit: 1 }];

      // Header row
      const headerRow = ws.getRow(1);
      headerRow.height = 32;
      HEADERS.forEach((h, i) => {
        ws.getColumn(i + 1).width = h.width;
        // Force DateOfBirth column to text
        if (h.key === 'DateOfBirth') ws.getColumn(i + 1).numFmt = '@';
        const cell = headerRow.getCell(i + 1);
        cell.value = h.label;
        cell.font = { bold: true, color: { argb: 'FF' + white }, size: 11, name: 'Arial' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + h.color } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = {
          top:    { style: 'thin', color: { argb: 'FFD0DCE8' } },
          bottom: { style: 'thin', color: { argb: 'FFD0DCE8' } },
          left:   { style: 'thin', color: { argb: 'FFD0DCE8' } },
          right:  { style: 'thin', color: { argb: 'FFD0DCE8' } },
        };
      });

      // Data rows with dropdowns
      for (let r = 2; r <= 201; r++) {
        const row = ws.getRow(r);
        row.height = 18;
        HEADERS.forEach((h, i) => {
          const cell = row.getCell(i + 1);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + offwh } };
          cell.font = { name: 'Arial', size: 10 };
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
          cell.border = {
            top:    { style: 'thin', color: { argb: 'FFE8E8E8' } },
            bottom: { style: 'thin', color: { argb: 'FFE8E8E8' } },
            left:   { style: 'thin', color: { argb: 'FFE8E8E8' } },
            right:  { style: 'thin', color: { argb: 'FFE8E8E8' } },
          };
          // Add dropdown if this column has a list
          if (LISTS[h.key] && LISTS[h.key].length > 0) {
            cell.dataValidation = {
              type: 'list', allowBlank: true,
              formulae: [`${h.key}List`],
              showErrorMessage: true,
              errorStyle: h.key === 'DominantHandBowling' || h.key === 'BowlingStyle' ? 'warning' : 'warning',
              errorTitle: 'Invalid Value',
              error: 'Please select from the dropdown list.',
              showDropDown: false,
            };
          }
        });
      }

      // ── Sheet 2: Valid Values ─────────────────────────────────────────────
      const vvWs = wb.addWorksheet('Valid Values');
      vvWs.getColumn(1).width = 30;
      vvWs.getColumn(2).width = 40;

      const addVVSection = (title: string, values: string[]) => {
        const tr = vvWs.addRow([title]);
        tr.height = 24;
        const tc = tr.getCell(1);
        tc.font = { bold: true, color: { argb: 'FF' + white }, size: 11, name: 'Arial' };
        tc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + teal } };
        const hr = vvWs.addRow(['Value']);
        hr.getCell(1).font = { bold: true, name: 'Arial', size: 10 };
        hr.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0EAF2' } };
        values.forEach(v => { const dr = vvWs.addRow([v]); dr.getCell(1).font = { name: 'Arial', size: 10 }; });
        vvWs.addRow(['']);
      };

      addVVSection('GENDER',               LISTS.Gender);
      addVVSection('PRIMARY SKILL',         LISTS.PrimarySkill);
      addVVSection('DOMINANT HAND BATTING', LISTS.DominantHandBatting);
      addVVSection('BATTING ORDER',         LISTS.BattingOrder);
      addVVSection('DOMINANT HAND BOWLING (required if Bowling)', LISTS.DominantHandBowling);
      addVVSection('BOWLING STYLE (required if Bowling)',          LISTS.BowlingStyle);
      if (data.clubs.length > 0) addVVSection('PRIMARY CLUB NAME (your organization)', data.clubs);
      if (data.teams.length > 0) addVVSection('PRIMARY TEAM NAME (your organization)', data.teams);

      // ── Sheet 3: Instructions ─────────────────────────────────────────────
      const instrWs = wb.addWorksheet('Instructions');
      instrWs.getColumn(1).width = 24;
      instrWs.getColumn(2).width = 14;
      instrWs.getColumn(3).width = 75;

      const addI = (vals: string[], bold = false, bg?: string) => {
        const row = instrWs.addRow(vals);
        row.height = bg ? 26 : 18;
        vals.forEach((_, i) => {
          const c = row.getCell(i + 1);
          c.font = { name: 'Arial', size: bold ? 11 : 10, bold };
          if (bg) { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg } }; c.font = { ...c.font, color: { argb: 'FF' + white } }; }
        });
      };

      addI(['🏏  Cricket IQ — Player Import Template Instructions', '', ''], true, navy);
      instrWs.addRow(['']);
      addI(['COLUMN COLOUR LEGEND', '', ''], true);
      instrWs.addRow(['Medium Blue', 'Required', '']);
      instrWs.addRow(['Amber', 'Conditional — required only if PrimarySkill = Bowling', '']);
      instrWs.addRow(['Dark Blue', 'Optional', '']);
      instrWs.addRow(['']);
      addI(['COLUMN RULES', '', ''], true);
      instrWs.addRow(['Column', 'Required?', 'Rule']).eachCell(c => { c.font = { bold: true, name: 'Arial', size: 10 }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0EAF2' } }; });
      instrWs.addRow(['FirstName',           'YES',         'Player first name.']);
      instrWs.addRow(['LastName',            'YES',         'Player last name. Combined with FirstName for full display name.']);
      instrWs.addRow(['CricClubsID',         'Optional',    'Must be unique across all players.']);
      instrWs.addRow(['DateOfBirth',         'Optional',    'Format: MM/DD/YYYY  e.g. 03/15/2008']);
      instrWs.addRow(['Gender',              'Optional',    'Select from dropdown: Male, Female']);
      instrWs.addRow(['PrimarySkill',        'Optional',    'Select from dropdown: Batting, Bowling, Wicket Keeping']);
      instrWs.addRow(['DominantHandBatting', 'Optional',    'Select from dropdown: Right Hand, Left Hand']);
      instrWs.addRow(['BattingOrder',        'Optional',    'Select from dropdown: Top Order, Middle Order, Low Order']);
      instrWs.addRow(['DominantHandBowling', 'CONDITIONAL', 'Required if PrimarySkill = Bowling. Select from dropdown.']);
      instrWs.addRow(['BowlingStyle',        'CONDITIONAL', 'Required if PrimarySkill = Bowling. Select from dropdown.']);
      instrWs.addRow(['PrimaryClubName',     'Optional',    'Must match a club in your organization. Select from dropdown.']);
      instrWs.addRow(['PrimaryTeamName',     'Optional',    'Must match a team in your organization. Select from dropdown.']);
      instrWs.addRow(['']);
      addI(['TIPS', '', ''], true);
      ['Do NOT change the column headers in row 1.',
       'Use dropdowns to avoid spelling errors — all value columns have dropdowns.',
       'DateOfBirth must be typed as MM/DD/YYYY text — not an Excel date value.',
       'Leave optional columns blank if not applicable.',
       'CricClubsID must be unique. Duplicate IDs will be skipped with an error.',
      ].forEach(tip => instrWs.addRow(['• ' + tip, '', '']));

      // ── Download ──────────────────────────────────────────────────────────
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'player_import_template.xlsx'; a.click();
      URL.revokeObjectURL(url);

      toast({ title: 'Template downloaded!', description: `Dropdowns include ${data.teams.length} teams and ${data.clubs.length} clubs from your organization.` });
    } catch (e: any) {
      console.error('Template generation error:', e);
      toast({ title: 'Error', description: 'Could not generate template. Please try again.', variant: 'destructive' });
    } finally {
      setIsGeneratingTemplate(false);
    }
  };

  const handleXlsxSubmit = async () => {
    if (!activeOrganizationId) {
      toast({ title: 'Error', description: 'No active organization selected.', variant: 'destructive' });
      return;
    }
    if (!xlsxFile || xlsxParsedData.length === 0) {
      toast({ title: 'No Data to Import', description: 'Please select a valid Excel file with data.', variant: 'destructive' });
      return;
    }

    setXlsxIsLoading(true);
    setXlsxImportResult(null);
    setXlsxProgress(0);

    try {
      const progressInterval = setInterval(() => {
        setXlsxProgress(prev => (prev < 90 ? prev + 10 : prev));
      }, 200);

      const result = await importPlayersAction(xlsxParsedData, activeOrganizationId);
      clearInterval(progressInterval);
      setXlsxProgress(100);
      setXlsxImportResult(result);

      if (result.successfulImports > 0) {
        toast({ title: 'Import Completed', description: `${result.successfulImports} players imported. ${result.failedImports} failed.` });
      } else {
        toast({ title: 'Import Failed', description: result.message || 'No players were imported.', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Excel import error:', error);
      toast({ title: 'Import Error', description: 'An unexpected error occurred.', variant: 'destructive' });
    } finally {
      setXlsxIsLoading(false);
    }
  };

  if (authLoading) {
    return <div className="flex justify-center items-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <span className="ml-2">Loading auth...</span></div>;
  }

  if (!activeOrganizationId && !authLoading) {
     return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>No Active Organization</AlertTitle>
        <AlertDescription>
          Please select an active organization from the navbar dropdown before importing players.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── CSV section — only shown in csv mode ── */}
      {mode === 'csv' && (<>
      <div className="space-y-2">
        <Label htmlFor="csv-file" className="text-base">Select CSV File</Label>
        <Input
          id="csv-file"
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
          disabled={isLoading || !activeOrganizationId}
        />
        {fileName && <p className="text-sm text-muted-foreground">Selected file: {fileName}</p>}
        {parsedData.length > 0 && !isLoading && (
          <p className="text-sm text-green-600">Parsed {parsedData.length} rows from the CSV. Ready to import.</p>
        )}
      </div>

      <Button
        onClick={handleSubmit}
        disabled={!file || parsedData.length === 0 || isLoading || !activeOrganizationId}
        className="w-full sm:w-auto bg-primary hover:bg-primary/90"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...
          </>
        ) : (
          <>
            <Upload className="mr-2 h-4 w-4" /> Import Players ({parsedData.length} rows)
          </>
        )}
      </Button>

      {isLoading && (
        <div className="space-y-2 pt-2">
          <Label className="text-sm">Import Progress:</Label>
          <Progress value={currentProgress} className="w-full" />
          <p className="text-xs text-muted-foreground text-center">{currentProgress}%</p>
        </div>
      )}

      {importResult && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5" /> Import Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {importResult.message && (
              <div className={`flex items-center gap-2 ${importResult.errors.length === 0 && importResult.successfulImports > 0 ? 'text-green-600' : 'text-destructive'}`}>
                {importResult.errors.length === 0 && importResult.successfulImports > 0 ? <CheckCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                <span>{importResult.message}</span>
              </div>
            )}
            <p>Successfully imported: <strong className="text-green-600">{importResult.successfulImports}</strong> players.</p>
            <p>Failed to import: <strong className="text-destructive">{importResult.failedImports}</strong> players.</p>

            {importResult.errors && importResult.errors.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-destructive">Error Details:</h4>
                <ScrollArea className="h-60 rounded-md border p-3">
                  <ul className="space-y-3">
                    {importResult.errors.map((err, index) => (
                      <li key={index} className="text-xs p-2 bg-destructive/10 rounded-md">
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
      )}

      {/* end csv mode */}
      </>)}

      {/* ── Excel section — only shown in xlsx mode ── */}
      {mode === 'xlsx' && (<>
      <Separator className="my-2" />
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Download the Excel template — it includes dropdowns for Gender, Primary Skill, Batting Order, Bowling Style, and your organization's clubs and teams.
          </p>
          <Button
            variant="outline"
            onClick={handleDownloadTemplate}
            disabled={isGeneratingTemplate || !activeOrganizationId}
            className="border-green-600 text-green-700 hover:bg-green-50 gap-2"
          >
            {isGeneratingTemplate
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
              : <><FileSpreadsheet className="h-4 w-4" /> Download Excel Template <Download className="h-3.5 w-3.5" /></>}
          </Button>
          {!activeOrganizationId && <p className="text-xs text-destructive">Select an active organization to generate the template.</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="xlsx-file" className="text-base">Select Excel File</Label>
          <Input
            id="xlsx-file"
            type="file"
            accept=".xlsx,.xls"
            onChange={handleXlsxFileChange}
            className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
            disabled={xlsxIsLoading || !activeOrganizationId}
          />
          {xlsxFileName && <p className="text-sm text-muted-foreground">Selected file: {xlsxFileName}</p>}
          {xlsxParsedData.length > 0 && !xlsxIsLoading && (
            <p className="text-sm text-green-600">Found {xlsxParsedData.length} rows. Ready to import.</p>
          )}
        </div>

        <Button
          onClick={handleXlsxSubmit}
          disabled={!xlsxFile || xlsxParsedData.length === 0 || xlsxIsLoading || !activeOrganizationId}
          className="w-full sm:w-auto bg-green-700 hover:bg-green-800 text-white"
        >
          {xlsxIsLoading ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...</>
          ) : (
            <><Upload className="mr-2 h-4 w-4" /> Import from Excel ({xlsxParsedData.length} rows)</>
          )}
        </Button>

        {xlsxIsLoading && (
          <div className="space-y-2 pt-2">
            <Label className="text-sm">Import Progress:</Label>
            <Progress value={xlsxProgress} className="w-full" />
            <p className="text-xs text-muted-foreground text-center">{xlsxProgress}%</p>
          </div>
        )}

        {xlsxImportResult && (
          <Card className="mt-4 border-green-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-700">
                <ListChecks className="h-5 w-5" /> Excel Import Results
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {xlsxImportResult.message && (
                <div className={`flex items-center gap-2 ${xlsxImportResult.errors.length === 0 && xlsxImportResult.successfulImports > 0 ? 'text-green-600' : 'text-destructive'}`}>
                  {xlsxImportResult.errors.length === 0 && xlsxImportResult.successfulImports > 0
                    ? <CheckCircle className="h-5 w-5" />
                    : <AlertTriangle className="h-5 w-5" />}
                  <span>{xlsxImportResult.message}</span>
                </div>
              )}
              <p>Successfully imported: <strong className="text-green-600">{xlsxImportResult.successfulImports}</strong> players.</p>
              <p>Failed to import: <strong className="text-destructive">{xlsxImportResult.failedImports}</strong> players.</p>
              {xlsxImportResult.errors && xlsxImportResult.errors.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-destructive">Error Details:</h4>
                  <ScrollArea className="h-60 rounded-md border p-3">
                    <ul className="space-y-3">
                      {xlsxImportResult.errors.map((err, index) => (
                        <li key={index} className="text-xs p-2 bg-destructive/10 rounded-md">
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
        )}
      </div>
      {/* end xlsx mode */}
      </>)}
    </div>
  );
}