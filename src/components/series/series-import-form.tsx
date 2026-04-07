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
    // Pre-validate dates
    const dateRegex = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
    const dateErrors: string[] = [];
    parsedData.forEach((row, i) => {
      const rowNum = i + 2;
      if (row.MaleCutoffDate && !dateRegex.test(String(row.MaleCutoffDate).trim())) {
        dateErrors.push(`Row ${rowNum}: MaleCutoffDate "${row.MaleCutoffDate}" — use MM/DD/YYYY with 4-digit year`);
      }
      if (row.FemaleCutoffDate && !dateRegex.test(String(row.FemaleCutoffDate).trim())) {
        dateErrors.push(`Row ${rowNum}: FemaleCutoffDate "${row.FemaleCutoffDate}" — use MM/DD/YYYY with 4-digit year`);
      }
    });
    if (dateErrors.length > 0) {
      toast({ title: 'Invalid Date Format', description: dateErrors[0] + (dateErrors.length > 1 ? ` (+${dateErrors.length - 1} more)` : ''), variant: 'destructive' });
      return;
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
        const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false, header: headers, dateNF: 'MM/DD/YYYY' });
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

    // Pre-validate dates — must have 4-digit year (Excel may strip leading zeros from month/day)
    const dateRegex = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
    const dateErrors: string[] = [];
    xlsxParsedData.forEach((row, i) => {
      const rowNum = i + 2;
      const malDate = String(row.MaleCutoffDate || '').trim();
      const femDate = String(row.FemaleCutoffDate || '').trim();
      if (malDate && !dateRegex.test(malDate)) {
        dateErrors.push(`Row ${rowNum}: MaleCutoffDate "${malDate}" — must be MM/DD/YYYY with 4-digit year (e.g. 9/1/2009 or 09/01/2009)`);
      }
      if (femDate && !dateRegex.test(femDate)) {
        dateErrors.push(`Row ${rowNum}: FemaleCutoffDate "${femDate}" — must be MM/DD/YYYY with 4-digit year (e.g. 9/1/2007 or 09/01/2007)`);
      }
    });
    if (dateErrors.length > 0) {
      toast({
        title: 'Invalid Date Format',
        description: dateErrors[0] + (dateErrors.length > 1 ? ` (+${dateErrors.length - 1} more)` : ''),
        variant: 'destructive',
      });
      return;
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
      const ageCategories = [...AGE_CATEGORIES];

      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Cricket IQ';

      const navy  = '0F2A54';
      const blue  = '2E75B6';
      const teal  = '0B6E8C';
      const white = 'FFFFFF';
      const offwh = 'F4F7FA';

      // ── Hidden Lists sheet ────────────────────────────────────────────────
      const listsSheet = wb.addWorksheet('_Lists', { state: 'veryHidden' });
      const maxRows = Math.max(ageCategories.length, years.length, data.selectorEmails.length, 1);
      for (let i = 0; i < maxRows; i++) {
        listsSheet.getCell(i + 1, 1).value = ageCategories[i] || null;   // A = age categories
        listsSheet.getCell(i + 1, 2).value = years[i] || null;            // B = years
        listsSheet.getCell(i + 1, 3).value = data.selectorEmails[i] || null; // C = emails
      }
      const aLen = ageCategories.length || 1;
      const yLen = years.length || 1;
      const eLen = data.selectorEmails.length || 1;
      wb.definedNames.add(`_Lists!$A$1:$A$${aLen}`, 'AgeCategoryList');
      wb.definedNames.add(`_Lists!$B$1:$B$${yLen}`, 'YearList');
      if (data.selectorEmails.length > 0) {
        wb.definedNames.add(`_Lists!$C$1:$C$${eLen}`, 'EmailList');
      }

      // ── Sheet 1: Series Import ────────────────────────────────────────────
      const ws = wb.addWorksheet('Series Import');
      ws.views = [{ state: 'frozen', ySplit: 1 }];

      const headers = [
        { key: 'SeriesName',       label: 'SeriesName',       width: 36, required: true,  color: blue },
        { key: 'AgeCategory',      label: 'AgeCategory',      width: 20, required: true,  color: blue },
        { key: 'Year',             label: 'Year',             width: 10, required: true,  color: blue },
        { key: 'MaleCutoffDate',   label: 'MaleCutoffDate',   width: 18, required: true,  color: blue },
        { key: 'FemaleCutoffDate', label: 'FemaleCutoffDate', width: 18, required: true,  color: blue },
        { key: 'SeriesAdminEmails',label: 'SeriesAdminEmails',width: 40, required: false, color: navy },
      ];

      const headerRow = ws.getRow(1);
      headerRow.height = 32;
      headers.forEach((h, i) => {
        ws.getColumn(i + 1).width = h.width;
        // Force date columns to text to prevent Excel auto-converting to date serial
        if (h.key === 'MaleCutoffDate' || h.key === 'FemaleCutoffDate') {
          ws.getColumn(i + 1).numFmt = '@';
        }
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

      for (let r = 2; r <= 101; r++) {
        const row = ws.getRow(r);
        row.height = 18;
        headers.forEach((_, i) => {
          const cell = row.getCell(i + 1);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + offwh } };
          cell.font = { name: 'Arial', size: 10 };
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE8E8E8' } },
            bottom: { style: 'thin', color: { argb: 'FFE8E8E8' } },
            left: { style: 'thin', color: { argb: 'FFE8E8E8' } },
            right: { style: 'thin', color: { argb: 'FFE8E8E8' } },
          };
          // Force date columns (MaleCutoffDate=4, FemaleCutoffDate=5) to Text
          if (i === 3 || i === 4) {
            cell.numFmt = '@';
          }
        });

        // AgeCategory dropdown (col 2)
        ws.getCell(r, 2).dataValidation = {
          type: 'list', allowBlank: true, showErrorMessage: true,
          formulae: ['AgeCategoryList'],
          errorStyle: 'stop', errorTitle: 'Invalid Age Category',
          error: 'Please select a valid age category from the dropdown.',
          showDropDown: false,
        };
        // Year dropdown (col 3)
        ws.getCell(r, 3).dataValidation = {
          type: 'list', allowBlank: true, showErrorMessage: false,
          formulae: ['YearList'],
          showDropDown: false,
        };
        // SeriesAdminEmails dropdown (col 6) — only if emails exist
        if (data.selectorEmails.length > 0) {
          ws.getCell(r, 6).dataValidation = {
            type: 'list', allowBlank: true, showErrorMessage: false,
            formulae: ['EmailList'],
            showDropDown: false,
          };
        }
      }

      // ── Sheet 2: Valid Values ─────────────────────────────────────────────
      const vvWs = wb.addWorksheet('Valid Values');
      vvWs.getColumn(1).width = 50;
      vvWs.getColumn(2).width = 20;

      const addSection = (title: string, colHeader: string, rows: string[]) => {
        const tr = vvWs.addRow([title]);
        tr.height = 24;
        const tc = tr.getCell(1);
        tc.font = { bold: true, color: { argb: 'FF' + white }, size: 11, name: 'Arial' };
        tc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + teal } };
        tc.alignment = { vertical: 'middle' };

        const hr = vvWs.addRow([colHeader]);
        hr.getCell(1).font = { bold: true, name: 'Arial', size: 10 };
        hr.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0EAF2' } };

        rows.forEach(v => {
          const dr = vvWs.addRow([v]);
          dr.height = 16;
          dr.getCell(1).font = { name: 'Arial', size: 10 };
        });
        vvWs.addRow(['']);
      };

      addSection('AGE CATEGORIES', 'Value', ageCategories);
      addSection('SUGGESTED YEARS (you may also type any year 2000–2100)', 'Value', years);
      addSection(
        'SERIES ADMIN EMAILS (Selectors / Admins in your org)',
        'Email',
        data.selectorEmails.length > 0 ? data.selectorEmails : ['No eligible users found for this organization']
      );

      // ── Sheet 3: Instructions ─────────────────────────────────────────────
      const instrWs = wb.addWorksheet('Instructions');
      instrWs.getColumn(1).width = 22;
      instrWs.getColumn(2).width = 12;
      instrWs.getColumn(3).width = 80;

      const addInstrRow = (vals: string[], bold = false, bgColor?: string) => {
        const row = instrWs.addRow(vals);
        row.height = bgColor ? 24 : 18;
        vals.forEach((_, i) => {
          const cell = row.getCell(i + 1);
          cell.font = { name: 'Arial', size: bold ? 11 : 10, bold };
          if (bgColor) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgColor } };
            cell.font = { ...cell.font, color: { argb: 'FF' + white } };
          }
        });
      };

      addInstrRow(['🏏  Cricket IQ — Series Import Template Instructions', '', ''], true, navy);
      instrWs.addRow(['']);
      addInstrRow(['COLUMN COLOUR LEGEND', '', ''], true);
      instrWs.addRow(['Medium Blue (required)', 'Required — must be filled in', '']);
      instrWs.addRow(['Dark Blue (optional)', 'Optional field', '']);
      instrWs.addRow(['']);
      addInstrRow(['COLUMN RULES', '', ''], true);
      instrWs.addRow(['Column', 'Required?', 'Rule']).eachCell(c => { c.font = { bold: true, name: 'Arial', size: 10 }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0EAF2' } }; });
      instrWs.addRow(['SeriesName', 'YES', 'Must be unique — existing names will error for that row.']);
      instrWs.addRow(['AgeCategory', 'YES', `Select from dropdown. Must be one of: ${ageCategories.join(', ')}.`]);
      instrWs.addRow(['Year', 'YES', 'Select from dropdown or type any 4-digit year (2000–2100).']);
      instrWs.addRow(['MaleCutoffDate', 'YES', 'Format: MM/DD/YYYY  e.g. 01/01/2008']);
      instrWs.addRow(['FemaleCutoffDate', 'YES', 'Format: MM/DD/YYYY  e.g. 01/01/2008']);
      instrWs.addRow(['SeriesAdminEmails', 'Optional', 'Select from dropdown or type comma-separated emails of existing users. Unknown emails are ignored.']);
      instrWs.addRow(['']);
      addInstrRow(['TIPS', '', ''], true);
      ['Do NOT change the column headers in row 1.',
       'AgeCategory has a required dropdown — must select from the list.',
       'Year dropdown shows common years — you may also type any valid year.',
       'SeriesAdminEmails dropdown shows eligible users — you may type multiple emails separated by commas.',
       'Dates must be typed as MM/DD/YYYY text — not Excel date values.',
       'Series are imported into the currently active organization.',
       'The system will NOT create new user accounts for Series Admins.',
      ].forEach(tip => instrWs.addRow(['• ' + tip, '', '']));

      // ── Download ──────────────────────────────────────────────────────────
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'series_import_template.xlsx'; a.click();
      URL.revokeObjectURL(url);

      toast({
        title: 'Template downloaded!',
        description: `Includes ${ageCategories.length} age categories and ${data.selectorEmails.length} selector emails.`,
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
