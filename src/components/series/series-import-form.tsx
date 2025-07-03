
'use client';

import { useState, type ChangeEvent } from 'react';
import Papa from 'papaparse';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { importSeriesAction } from '@/lib/actions/import-actions'; // Updated import path
import type { CsvSeriesImportRow, SeriesImportResult } from '@/types';
import { Loader2, Upload, AlertTriangle, CheckCircle, ListChecks, Info } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/auth-context'; 
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';


const EXPECTED_HEADERS = ['SeriesName', 'AgeCategory', 'Year', 'MaleCutoffDate', 'FemaleCutoffDate', 'SeriesAdminEmails'];

export function SeriesImportForm() {
  const { activeOrganizationId, loading: authLoading } = useAuth(); 
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<CsvSeriesImportRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [importResult, setImportResult] = useState<SeriesImportResult | null>(null);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const { toast } = useToast();

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
              description: `CSV must contain headers: ${EXPECTED_HEADERS.join(', ')}. Found: ${headers?.join(', ')}`,
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
          setParsedData(validRows as CsvSeriesImportRow[]);
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
      
      const result = await importSeriesAction(parsedData, activeOrganizationId); 
      clearInterval(progressInterval);
      setCurrentProgress(100);
      setImportResult(result);

      if (result.success) {
        toast({
          title: 'Import Process Completed',
          description: `${result.successfulImports} series imported successfully for the active organization. ${result.failedImports} series failed.`,
        });
      } else {
        toast({
          title: 'Import Process Failed',
          description: result.message || 'An error occurred during the import.',
          variant: 'destructive',
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
  
  if (authLoading) {
    return <div className="flex justify-center items-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <span className="ml-2">Loading auth...</span></div>;
  }

  if (!activeOrganizationId && !authLoading) {
     return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>No Active Organization</AlertTitle>
        <AlertDescription>
          Please select an active organization from the navbar dropdown before importing series.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
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
            <Upload className="mr-2 h-4 w-4" /> Import Series ({parsedData.length} rows)
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
            <p>Successfully imported: <strong className="text-green-600">{importResult.successfulImports}</strong> series.</p>
            <p>Failed to import: <strong className="text-destructive">{importResult.failedImports}</strong> series.</p>

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
    </div>
  );
}

