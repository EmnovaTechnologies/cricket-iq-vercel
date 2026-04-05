

'use client';

import { useState, type ChangeEvent } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { importPlayersAction } from '@/lib/actions/import-actions';
import type { CsvPlayerImportRow, PlayerImportResult } from '@/types';
import { Loader2, Upload, AlertTriangle, CheckCircle, ListChecks, FileSpreadsheet } from 'lucide-react';
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

    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (!validTypes.includes(selectedFile.type) && !selectedFile.name.match(/\.(xlsx|xls)$/i)) {
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
        const workbook = XLSX.read(data, { type: 'array', cellDates: false });

        // Use first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(worksheet, {
          defval: '',
          raw: false, // format all values as strings
        });

        if (rows.length === 0) {
          toast({ title: 'Empty File', description: 'No data rows found in the Excel file.', variant: 'destructive' });
          setXlsxFile(null); setXlsxFileName(null); event.target.value = '';
          return;
        }

        const headers = Object.keys(rows[0]);
        if (!EXPECTED_HEADERS.every(h => headers.includes(h))) {
          toast({
            title: 'Invalid Excel Headers',
            description: `Excel must contain headers: ${EXPECTED_HEADERS.join(', ')}. Found: ${headers.join(', ')}`,
            variant: 'destructive',
          });
          setXlsxFile(null); setXlsxFileName(null); event.target.value = '';
          return;
        }

        // Filter out completely empty rows and the example row (row 2 in template)
        const validRows = rows.filter(row =>
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
        <p className="text-sm text-muted-foreground">
          Upload the downloaded Excel template with your player data. The first sheet named <strong>Players Import</strong> will be used.
        </p>

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