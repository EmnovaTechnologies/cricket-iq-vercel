'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getCampsForSeriesAction } from '@/lib/actions/camp-actions';
import { useAuth } from '@/contexts/auth-context';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import type { SelectionCamp } from '@/types';
import {
  Loader2, ShieldAlert, PlusCircle, ArrowLeft,
  Users, CalendarDays, MapPin, Target, Trophy
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

const statusColors: Record<SelectionCamp['status'], string> = {
  upcoming: 'bg-blue-100 text-blue-700 border-blue-200',
  active: 'bg-green-100 text-green-700 border-green-200',
  completed: 'bg-muted text-muted-foreground',
};

export default function CampListPage() {
  const params = useParams<{ id: string }>();
  const seriesId = params.id;
  const router = useRouter();
  const { effectivePermissions } = useAuth();

  const [camps, setCamps] = useState<SelectionCamp[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canManageCamp = effectivePermissions[PERMISSIONS.SERIES_MANAGE_TEAMS_ASSIGNED] ||
    effectivePermissions[PERMISSIONS.ORGANIZATIONS_EDIT_ASSIGNED] ||
    effectivePermissions[PERMISSIONS.ORGANIZATIONS_EDIT_ANY];

  useEffect(() => {
    if (!seriesId) return;
    getCampsForSeriesAction(seriesId).then(res => {
      if (res.success) setCamps(res.camps || []);
      else setError(res.error || 'Could not load camps.');
      setIsLoading(false);
    });
  }, [seriesId]);

  return (
    <AuthProviderClientComponent
      requiredPermission={PERMISSIONS.PAGE_VIEW_SERIES_DETAILS}
      FallbackComponent={
        <Alert variant="destructive" className="mt-8 max-w-2xl mx-auto">
          <ShieldAlert className="h-5 w-5" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>You do not have permission to view selection camps.</AlertDescription>
        </Alert>
      }
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/series/${seriesId}/details`}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Series
              </Link>
            </Button>
            <h1 className="text-2xl font-headline font-bold text-primary flex items-center gap-2">
              <Trophy className="h-6 w-6" /> Selection Camps
            </h1>
          </div>
          {canManageCamp && (
            <Button asChild>
              <Link href={`/series/${seriesId}/camp/new`}>
                <PlusCircle className="mr-2 h-4 w-4" /> New Camp
              </Link>
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : camps.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <Trophy className="h-14 w-14 mx-auto text-muted-foreground/30" />
            <p className="text-muted-foreground">No selection camps yet for this series.</p>
            {canManageCamp && (
              <Button asChild variant="outline">
                <Link href={`/series/${seriesId}/camp/new`}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Create First Camp
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {camps.map(camp => (
              <Card key={camp.id} className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => router.push(`/series/${seriesId}/camp/${camp.id}`)}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base font-semibold leading-tight">{camp.name}</CardTitle>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border capitalize shrink-0 ${statusColors[camp.status]}`}>
                      {camp.status}
                    </span>
                  </div>
                  <CardDescription className="flex items-center gap-1 text-xs">
                    <CalendarDays className="h-3 w-3" />
                    {camp.startDate ? format(parseISO(camp.startDate), 'PP') : '—'}
                    {camp.endDate && camp.endDate !== camp.startDate && ` → ${format(parseISO(camp.endDate), 'PP')}`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {camp.venue && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {camp.venue}
                    </p>
                  )}
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Users className="h-3 w-3" /> {camp.quota} invited
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Target className="h-3 w-3" /> {camp.selectionTarget} to select
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AuthProviderClientComponent>
  );
}
