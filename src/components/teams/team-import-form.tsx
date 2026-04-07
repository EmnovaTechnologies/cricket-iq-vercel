'use client';

import { useState, type ChangeEvent } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { importTeamsAdminAction } from '@/lib/actions/import-teams-admin-action';
import { getTeamsTemplateData } from '@/lib/actions/teams-template-action';
import { Loader2, Upload, AlertTriangle, CheckCircle, ListChecks, FileSpreadsheet, Download } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/auth-context';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { AGE_CATEGORIES } from '@/lib/constants';

const EXPECTED_HEADERS = ['TeamName', 'ClubName', 'AgeCategory', 'TeamManagerEmails'];

type CsvTeamRow = { TeamName: string; ClubName?: string; AgeCategory?: string; TeamManagerEmails?: string; [key: string]: string | undefined };

interface TeamImportResult {
  success: boolean;
  message: string;
  successfulImports: number;
  failedImports: number;
  errors: { rowNumber: number; csvRow: Record<string, any>; error: string }[];
}

interface TeamImportFormProps {
  mode?: 'csv' | 'xlsx';
}

export function TeamImportForm({ mode = 'csv' }: TeamImportFormProps) {
  const { activeOrganizationId, loading: authLoading } = useAuth();
  const { toast } = useToast();

  // ── CSV state ──────────────────────────────────────────────────────────────
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<CsvTeamRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [importResult, setImportResult] = useState<TeamImportResult | null>(null);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);

  // ── Excel state ────────────────────────────────────────────────────────────
  const [xlsxFile, setXlsxFile] = useState<File | null>(null);
  const [xlsxFileName, setXlsxFileName] = useState<string | null>(null);
  const [xlsxParsedData, setXlsxParsedData] = useState<CsvTeamRow[]>([]);
  const [xlsxIsLoading, setXlsxIsLoading] = useState(false);
  const [xlsxImportResult, setXlsxImportResult] = useState<TeamImportResult | null>(null);
  const [xlsxProgress, setXlsxProgress] = useState(0);
  const [isGeneratingTemplate, setIsGeneratingTemplate] = useState(false);

  // ── CSV handlers ───────────────────────────────────────────────────────────
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
        if (!headers || !['TeamName'].every(h => headers.includes(h))) {
          toast({ title: 'Invalid CSV Headers', description: `CSV must contain at minimum: TeamName. Found: ${headers?.join(', ')}`, variant: 'destructive' });
          setFile(null); setFileName(null); event.target.value = ''; return;
        }
        const validRows = results.data.filter(row => row['TeamName']?.trim());
        setParsedData(validRows as CsvTeamRow[]);
      },
      error: () => {
        toast({ title: 'CSV Parsing Error', description: 'Could not parse the CSV file.', variant: 'destructive' });
        setFile(null); setFileName(null); event.target.value = '';
      },
    });
  };

  const handleSubmit = async () => {
    if (!activeOrganizationId) { toast({ title: 'No Organization', description: 'Please select an active organization.', variant: 'destructive' }); return; }
    if (!file || parsedData.length === 0) { toast({ title: 'No Data', description: 'Please select a valid CSV file.', variant: 'destructive' }); return; }
    setIsLoading(true); setImportResult(null); setCurrentProgress(0);
    try {
      const interval = setInterval(() => setCurrentProgress(p => p < 90 ? p + 10 : p), 200);
      const result = await importTeamsAdminAction(parsedData, activeOrganizationId);
      clearInterval(interval); setCurrentProgress(100); setImportResult(result);
      toast({ title: result.success ? 'Import Completed' : 'Import Failed', description: `${result.successfulImports} imported, ${result.failedImports} failed.`, variant: result.success ? 'default' : 'destructive' });
    } catch { toast({ title: 'Import Error', description: 'An unexpected error occurred.', variant: 'destructive' }); }
    finally { setIsLoading(false); }
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
    setXlsxFileName(selectedFile.name); setXlsxFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', raw: false });
        const sheetName = workbook.SheetNames.find(n => n === 'Teams Import') || workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:D1');
        const headers: string[] = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c })];
          headers.push(cell ? String(cell.v).trim() : '');
        }
        if (!headers.includes('TeamName')) {
          toast({ title: 'Invalid Headers', description: `Excel must contain at minimum: TeamName. Found: ${headers.filter(Boolean).join(', ')}`, variant: 'destructive' });
          setXlsxFile(null); setXlsxFileName(null); event.target.value = ''; return;
        }
        const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false, header: headers });
        const validRows = rows.slice(1).filter(row => row['TeamName']?.trim()) as CsvTeamRow[];
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
    if (!activeOrganizationId) { toast({ title: 'No Organization', description: 'Please select an active organization.', variant: 'destructive' }); return; }
    if (!xlsxFile || xlsxParsedData.length === 0) { toast({ title: 'No Data', description: 'Please select a valid Excel file.', variant: 'destructive' }); return; }
    setXlsxIsLoading(true); setXlsxImportResult(null); setXlsxProgress(0);
    try {
      const interval = setInterval(() => setXlsxProgress(p => p < 90 ? p + 10 : p), 200);
      const result = await importTeamsAdminAction(xlsxParsedData, activeOrganizationId);
      clearInterval(interval); setXlsxProgress(100); setXlsxImportResult(result);
      toast({ title: result.success ? 'Import Completed' : 'Import Failed', description: `${result.successfulImports} imported, ${result.failedImports} failed.`, variant: result.success ? 'default' : 'destructive' });
    } catch { toast({ title: 'Import Error', description: 'An unexpected error occurred.', variant: 'destructive' }); }
    finally { setXlsxIsLoading(false); }
  };

  // ── Dynamic template generation ────────────────────────────────────────────
  const handleDownloadTemplate = async () => {
    if (!activeOrganizationId) {
      toast({ title: 'No Organization', description: 'Please select an active organization first.', variant: 'destructive' }); return;
    }
    setIsGeneratingTemplate(true);
    try {
      const data = await getTeamsTemplateData(activeOrganizationId);
      const ageCategories = [...AGE_CATEGORIES];

      const LISTS: Record<string, string[]> = {
        ClubName:           data.clubs,
        AgeCategory:        ageCategories,
        TeamManagerEmails:  data.managerEmails,
      };

      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Cricket IQ';

      const white = 'FFFFFF';
      const offwh = 'F4F7FA';
      const teal  = '0B6E8C';
      const navy  = '0F2A54';
      const blue  = '2E75B6';

      // ── Hidden _Lists sheet ───────────────────────────────────────────────
      const listsSheet = wb.addWorksheet('_Lists', { state: 'veryHidden' });
      const listKeys = Object.keys(LISTS);
      const maxLen = Math.max(...listKeys.map(k => LISTS[k].length), 1);
      for (let i = 0; i < maxLen; i++) {
        listKeys.forEach((key, col) => {
          listsSheet.getCell(i + 1, col + 1).value = LISTS[key][i] || null;
        });
      }
      listKeys.forEach((key, col) => {
        const len = LISTS[key].length || 1;
        const colLetter = String.fromCharCode(65 + col);
        wb.definedNames.add(`_Lists!$${colLetter}$1:$${colLetter}$${len}`, `${key}List`);
      });

      // ── Sheet 1: Teams Import ─────────────────────────────────────────────
      const HEADERS = [
        { key: 'TeamName',          label: 'TeamName',          width: 30, color: blue  }, // required
        { key: 'ClubName',          label: 'ClubName',          width: 24, color: navy  }, // optional
        { key: 'AgeCategory',       label: 'AgeCategory',       width: 20, color: navy  }, // optional
        { key: 'TeamManagerEmails', label: 'TeamManagerEmails', width: 44, color: navy  }, // optional
      ];

      const ws = wb.addWorksheet('Teams Import');
      ws.views = [{ state: 'frozen', ySplit: 1 }];

      const headerRow = ws.getRow(1);
      headerRow.height = 32;
      HEADERS.forEach((h, i) => {
        ws.getColumn(i + 1).width = h.width;
        const cell = headerRow.getCell(i + 1);
        cell.value = h.label;
        cell.font = { bold: true, color: { argb: 'FF' + white }, size: 11, name: 'Arial' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + h.color } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD0DCE8' } }, bottom: { style: 'thin', color: { argb: 'FFD0DCE8' } },
          left: { style: 'thin', color: { argb: 'FFD0DCE8' } }, right: { style: 'thin', color: { argb: 'FFD0DCE8' } },
        };
      });

      for (let r = 2; r <= 201; r++) {
        const row = ws.getRow(r);
        row.height = 18;
        HEADERS.forEach((h, i) => {
          const cell = row.getCell(i + 1);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + offwh } };
          cell.font = { name: 'Arial', size: 10 };
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE8E8E8' } }, bottom: { style: 'thin', color: { argb: 'FFE8E8E8' } },
            left: { style: 'thin', color: { argb: 'FFE8E8E8' } }, right: { style: 'thin', color: { argb: 'FFE8E8E8' } },
          };
          // Add dropdown for columns with lists
          const list = LISTS[h.key];
          if (list && list.length > 0) {
            cell.dataValidation = {
              type: 'list', allowBlank: true, showErrorMessage: h.key === 'AgeCategory',
              formulae: [`${h.key}List`],
              errorStyle: 'stop', errorTitle: 'Invalid Value',
              error: 'Please select from the dropdown list.',
              showDropDown: false,
            };
          }
        });
      }

      // ── Sheet 2: Valid Values ─────────────────────────────────────────────
      const vvWs = wb.addWorksheet('Valid Values');
      vvWs.getColumn(1).width = 50;
      vvWs.getColumn(2).width = 20;

      const addSection = (title: string, values: string[], note?: string) => {
        const tr = vvWs.addRow([title]);
        tr.height = 24;
        const tc = tr.getCell(1);
        tc.font = { bold: true, color: { argb: 'FF' + white }, size: 11, name: 'Arial' };
        tc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + teal } };
        const hr = vvWs.addRow(['Value']);
        hr.getCell(1).font = { bold: true, name: 'Arial', size: 10 };
        hr.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0EAF2' } };
        if (values.length > 0) {
          values.forEach(v => { const dr = vvWs.addRow([v]); dr.getCell(1).font = { name: 'Arial', size: 10 }; });
        } else {
          vvWs.addRow(['(none defined for this organization)']);
        }
        if (note) vvWs.addRow([note]);
        vvWs.addRow(['']);
      };

      addSection('CLUB NAMES (from your organization)', data.clubs);
      addSection('AGE CATEGORIES', ageCategories);
      addSection('TEAM MANAGER EMAILS (eligible users in your organization)', data.managerEmails, 'You may also type emails manually. Unrecognized emails will be skipped with a warning.');

      // ── Sheet 3: Instructions ─────────────────────────────────────────────
      const instrWs = wb.addWorksheet('Instructions');
      instrWs.getColumn(1).width = 24; instrWs.getColumn(2).width = 12; instrWs.getColumn(3).width = 75;

      const addI = (vals: string[], bold = false, bg?: string) => {
        const row = instrWs.addRow(vals);
        row.height = bg ? 26 : 18;
        vals.forEach((_, i) => {
          const c = row.getCell(i + 1);
          c.font = { name: 'Arial', size: bold ? 11 : 10, bold };
          if (bg) { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg } }; c.font = { ...c.font, color: { argb: 'FF' + white } }; }
        });
      };

      addI(['🏏  Cricket IQ — Team Import Template Instructions', '', ''], true, navy);
      instrWs.addRow(['']);
      addI(['COLUMN COLOUR LEGEND', '', ''], true);
      instrWs.addRow(['Medium Blue', 'Required — must be filled in', '']);
      instrWs.addRow(['Dark Blue', 'Optional', '']);
      instrWs.addRow(['']);
      addI(['COLUMN RULES', '', ''], true);
      instrWs.addRow(['Column', 'Required?', 'Rule']).eachCell(c => { c.font = { bold: true, name: 'Arial', size: 10 }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0EAF2' } }; });
      instrWs.addRow(['TeamName',          'YES',      'Must be unique within the organization. Duplicate names will be skipped with an error.']);
      instrWs.addRow(['ClubName',          'Optional', 'Must match a club defined for your organization. Select from dropdown. See Valid Values sheet.']);
      instrWs.addRow(['AgeCategory',       'Optional', `Select from dropdown. Must be one of: ${ageCategories.join(', ')}.`]);
      instrWs.addRow(['TeamManagerEmails', 'Optional', 'Comma-separated emails of existing users. Select from dropdown or type manually. Unrecognized emails are skipped with a warning.']);
      instrWs.addRow(['']);
      addI(['TIPS', '', ''], true);
      ['Do NOT change the column headers in row 1.',
       'TeamName is the only required field.',
       'ClubName must exactly match a club defined for the organization.',
       'Teams are created as empty shells — players are added separately.',
       'Team Managers are assigned to the team and linked to the organization.',
       'Teams are imported into the currently active organization.',
      ].forEach(tip => instrWs.addRow(['• ' + tip, '', '']));

      // ── Download ──────────────────────────────────────────────────────────
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'team_import_template.xlsx'; a.click();
      URL.revokeObjectURL(url);

      toast({ title: 'Template downloaded!', description: `Includes ${data.clubs.length} clubs, ${ageCategories.length} age categories, and ${data.managerEmails.length} manager emails.` });
    } catch (e: any) {
      console.error('Template generation error:', e);
      toast({ title: 'Error', description: 'Could not generate template. Please try again.', variant: 'destructive' });
    } finally { setIsGeneratingTemplate(false); }
  };

  // ── Results renderer ───────────────────────────────────────────────────────
  const renderResults = (result: TeamImportResult) => (
    <Card className="mt-4">
      <CardHeader><CardTitle className="flex items-center gap-2"><ListChecks className="h-5 w-5" /> Import Results</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className={`flex items-center gap-2 ${result.success ? 'text-green-600' : 'text-destructive'}`}>
          {result.success ? <CheckCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          <span>{result.message}</span>
        </div>
        <p>Successfully imported: <strong className="text-green-600">{result.successfulImports}</strong> teams.</p>
        <p>Failed to import: <strong className="text-destructive">{result.failedImports}</strong> teams.</p>
        {result.errors?.length > 0 && (
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

  if (authLoading) return <div className="flex justify-center items-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /><span className="ml-2">Loading...</span></div>;

  if (!activeOrganizationId) return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>No Active Organization</AlertTitle>
      <AlertDescription>Please select an active organization from the navbar before importing teams.</AlertDescription>
    </Alert>
  );

  return (
    <div className="space-y-6">
      {/* ── CSV section ── */}
      {mode === 'csv' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="csv-team-file" className="text-base">Select CSV File</Label>
            <Input id="csv-team-file" type="file" accept=".csv" onChange={handleFileChange} disabled={isLoading}
              className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" />
            {fileName && <p className="text-sm text-muted-foreground">Selected: {fileName}</p>}
            {parsedData.length > 0 && !isLoading && <p className="text-sm text-green-600">Parsed {parsedData.length} rows. Ready to import.</p>}
          </div>
          <Button onClick={handleSubmit} disabled={!file || parsedData.length === 0 || isLoading} className="w-full sm:w-auto bg-primary hover:bg-primary/90">
            {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...</> : <><Upload className="mr-2 h-4 w-4" /> Import Teams ({parsedData.length} rows)</>}
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
              Download the Excel template — it includes dropdowns for ClubName, AgeCategory, and Team Manager emails from your organization.
            </p>
            <Button variant="outline" onClick={handleDownloadTemplate} disabled={isGeneratingTemplate || !activeOrganizationId} className="border-green-600 text-green-700 hover:bg-green-50 gap-2">
              {isGeneratingTemplate ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</> : <><FileSpreadsheet className="h-4 w-4" /> Download Excel Template <Download className="h-3.5 w-3.5" /></>}
            </Button>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="xlsx-team-file" className="text-base">Select Excel File</Label>
            <Input id="xlsx-team-file" type="file" accept=".xlsx,.xls" onChange={handleXlsxFileChange} disabled={xlsxIsLoading}
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
