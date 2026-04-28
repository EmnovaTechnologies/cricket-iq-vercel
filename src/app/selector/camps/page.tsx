'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getCampsForSelectorAction } from '@/lib/actions/camp-actions';
import { useAuth } from '@/contexts/auth-context';
import type { SelectionCamp } from '@/types';
import {
  Loader2, Trophy, CalendarDays, MapPin, Users,
  Target, Star, ArrowRight, ShieldAlert
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

const statusColors: Record<SelectionCamp['status'], string> = {
  upcoming: 'bg-blue-100 text-blue-700 border-blue-200',
  active: 'bg-green-100 text-green-700 border-green-200',
  completed: 'bg-muted text-muted-foreground border',
};

export default function SelectorCampsPage() {
  const { currentUser, userProfile, activeOrganizationId } = useAuth();
  const [camps, setCamps] = useState<SelectionCamp[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser || !activeOrganizationId) return;
    getCampsForSelectorAction(currentUser.uid, activeOrganizationId).then(res => {
      if (res.success) setCamps(res.camps || []);
      else setError(res.error || 'Could not load camps.');
      setIsLoading(false);
    });
  }, [currentUser, activeOrganizationId]);

  if (isLoading) return (
    <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-headline font-bold text-primary flex items-center gap-2">
        <Trophy className="h-8 w-8" /> My Camps
      </h1>

      {error ? (
        <Alert variant="destructive">
          <ShieldAlert className="h-5 w-5" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : camps.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Trophy className="h-14 w-14 mx-auto text-muted-foreground/20" />
          <p className="text-muted-foreground font-medium">No camps assigned yet</p>
          <p className="text-sm text-muted-foreground">
            You will appear here once a Series Admin assigns you to a selection camp.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {camps.map(camp => (
            <Card key={camp.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base font-semibold leading-tight">{camp.name}</CardTitle>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border capitalize shrink-0 ${statusColors[camp.status]}`}>
                    {camp.status}
                  </span>
                </div>
                {camp.startDate && (
                  <CardDescription className="flex items-center gap-1 text-xs">
                    <CalendarDays className="h-3 w-3" />
                    {format(parseISO(camp.startDate), 'PP')}
                    {camp.endDate && camp.endDate !== camp.startDate && ` → ${format(parseISO(camp.endDate), 'PP')}`}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="flex items-center gap-4 flex-wrap">
                  {camp.venue && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {camp.venue}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="h-3 w-3" /> {camp.quota} players
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Target className="h-3 w-3" /> {camp.selectionTarget} to select
                  </span>
                </div>
                {camp.fitnessTestType && (
                  <p className="text-xs text-muted-foreground">
                    Fitness: {camp.fitnessTestType} · Pass ≥ {camp.fitnessTestPassingScore}
                  </p>
                )}
                <Button asChild className="w-full" size="sm">
                  <Link href={`/series/${camp.seriesId}/camp/${camp.id}/assess`}>
                    <Star className="mr-2 h-3.5 w-3.5" />
                    Start / Continue Assessing
                    <ArrowRight className="ml-2 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
