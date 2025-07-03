
import { SeriesImportForm } from '@/components/series/series-import-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileText, Info, Download, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { AGE_CATEGORIES } from '@/lib/constants';

export default function ImportSeriesPage() {
  const ageCategoriesString = AGE_CATEGORIES.join(', ');

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Card>
        <CardHeader>
           <div className="flex justify-between items-start mb-2">
            <div className="flex-1">
              <CardTitle className="text-2xl font-headline text-primary flex items-center gap-2">
                <FileText className="h-6 w-6" />
                Import Series from CSV
              </CardTitle>
              <CardDescription>
                Upload a CSV file to bulk import series data. First,{' '}
                <Button variant="outline" size="sm" asChild className="text-xs -translate-y-px px-2 h-auto py-0.5">
                  <Link href="/sample-series-import.csv" download>
                    <Download className="mr-1 h-3 w-3" /> Download Sample Template
                  </Link>
                </Button>
                {' '}and ensure your CSV matches its format.
              </CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/series"><ArrowLeft className="mr-2 h-4 w-4" />Back to Series</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Alert className="mb-6">
            <Info className="h-4 w-4" />
            <AlertTitle>Important Notes for CSV Import</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>The CSV file must contain the following headers: <strong>SeriesName, AgeCategory, Year, MaleCutoffDate, FemaleCutoffDate, SeriesAdminEmails</strong>.</li>
                <li><strong>SeriesName</strong> must be unique; existing series names will cause an error for that row.</li>
                <li><strong>AgeCategory</strong> must be one of: {ageCategoriesString}.</li>
                <li><strong>Year</strong> must be a valid year (e.g., 2024).</li>
                <li><strong>MaleCutoffDate</strong> and <strong>FemaleCutoffDate</strong> must be in <strong>MM/DD/YYYY</strong> format. These are mandatory.</li>
                <li><strong>SeriesAdminEmails</strong> (optional) should be a comma-separated list of emails of *existing* users in the system. If an email is not found, it will be ignored with a warning for that series row.</li>
                <li>The system will <strong>not</strong> create new user accounts for Series Admins. They must pre-exist.</li>
              </ul>
            </AlertDescription>
          </Alert>
          <SeriesImportForm />
        </CardContent>
      </Card>
    </div>
  );
}

