'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  getCampByIdAction, getCampPlayersAction,
  getCampAssessmentsAction, getCampFitnessResultsAction, updateCampAction
} from '@/lib/actions/camp-actions';
import { useAuth } from '@/contexts/auth-context';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { useToast } from '@/hooks/use-toast';
import type { SelectionCamp, CampPlayer, CampAssessment, CampFitnessResult } from '@/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2, ArrowLeft, Trophy, Users, Star, Activity,
  ClipboardList, Brain, ShieldAlert, MapPin, CalendarDays,
  Target, CheckCircle, Lock
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

export default function CampOverviewPage() {
  const params = useParams<{ id: string; campId: string }>();
  const { id: seriesId, campId } = params;
  const router = useRouter();
  const { effectivePermissions, currentUser } = useAuth();
  const { toast } = useToast();

  const [camp, setCamp] = useState<SelectionCamp | null>(null);
  const [players, setPlayers] = useState<CampPlayer[]>([]);
  const [assessments, setAssessments] = useState<CampAssessment[]>([]);
  const [fitnessResults, setFitnessResults] = useState<CampFitnessResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const canManage = effectivePermissions[PERMISSIONS.SERIES_MANAGE_TEAMS_ASSIGNED] ||
    effectivePermissions[PERMISSIONS.ORGANIZATIONS_EDIT_ASSIGNED] ||
    effectivePermissions[PERMISSIONS.ORGANIZATIONS_EDIT_ANY];

  useEffect(() => {
    if (!campId) return;
    Promise.all([
      getCampByIdAction(campId),
      getCampPlayersAction(campId),
      getCampAssessmentsAction(campId),
      getCampFitnessResultsAction(campId),
    ]).then(([campRes, playersRes, assessRes, fitnessRes]) => {
      if (campRes.success) setCamp(campRes.camp!);
      if (playersRes.success) setPlayers(playersRes.players || []);
      if (assessRes.success) setAssessments(assessRes.assessments || []);
      if (fitnessRes.success) setFitnessResults(fitnessRes.results || []);
      setIsLoading(false);
    });
  }, [campId]);

  const handleStatusChange = async (status: SelectionCamp['status']) => {
    if (!campId) return;
    setIsUpdatingStatus(true);
    const res = await updateCampAction(campId, { status });
    if (res.success) {
      setCamp(prev => prev ? { ...prev, status } : prev);
      toast({ title: `Camp status updated to ${status}` });
    } else {
      toast({ title: 'Error', description: res.error, variant: 'destructive' });
    }
    setIsUpdatingStatus(false);
  };

  if (isLoading) return (
    <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
    </div>
  );

  if (!camp) return (
    <Alert variant="destructive" className="max-w-xl mx-auto mt-8">
      <ShieldAlert className="h-5 w-5" />
      <AlertTitle>Camp not found</AlertTitle>
      <AlertDescription>This camp does not exist.</AlertDescription>
    </Alert>
  );

  const assessedBibs = new Set(assessments.map(a => a.bibNumber)).size;
  const lockedAssessments = assessments.filter(a => a.isLocked).length;
  const fitnessRecorded = fitnessResults.length;
  const selectedPlayers = players.filter(p => p.selectionStatus === 'selected').length;
  const reservePlayers = players.filter(p => p.selectionStatus === 'reserve').length;

  const statusColors = {
    upcoming: 'bg-blue-100 text-blue-700 border-blue-200',
    active: 'bg-green-100 text-green-700 border-green-200',
    completed: 'bg-muted text-muted-foreground border',
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/series/${seriesId}/camp`}>
              <ArrowLeft className="mr-2 h-4 w-4" /> All Camps
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-headline font-bold text-primary flex items-center gap-2"><Trophy className="h-8 w-8" /> {camp.name}</h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {camp.startDate && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                  {format(parseISO(camp.startDate), 'PP')}
                  {camp.endDate !== camp.startDate && ` → ${format(parseISO(camp.endDate), 'PP')}`}
                </span>
              )}
              {camp.venue && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {camp.venue}
                </span>
              )}
            </div>
          </div>
        </div>
        {canManage ? (
          <Select value={camp.status} onValueChange={v => handleStatusChange(v as SelectionCamp['status'])}
            disabled={isUpdatingStatus}>
            <SelectTrigger className="w-36 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="upcoming">Upcoming</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs border capitalize ${statusColors[camp.status]}`}>
            {camp.status}
          </span>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Players Invited', value: players.length, max: camp.quota, icon: <Users className="h-4 w-4" /> },
          { label: 'Bibs Assessed', value: assessedBibs, max: players.length, icon: <Star className="h-4 w-4" /> },
          { label: 'Assessments Locked', value: lockedAssessments, max: assessments.length, icon: <Lock className="h-4 w-4" /> },
          { label: 'Fitness Recorded', value: fitnessRecorded, max: players.length, icon: <Activity className="h-4 w-4" /> },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">{stat.icon}<span className="text-xs">{stat.label}</span></div>
              <p className="text-2xl font-bold text-primary">{stat.value}<span className="text-sm font-normal text-muted-foreground">/{stat.max}</span></p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Final selection summary */}
      {(selectedPlayers > 0 || reservePlayers > 0) && (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="p-4 flex items-center gap-4">
            <CheckCircle className="h-8 w-8 text-green-600 shrink-0" />
            <div>
              <p className="font-semibold text-green-800">Final selection in progress</p>
              <p className="text-sm text-green-700">{selectedPlayers} selected · {reservePlayers} reserve · Target: {camp.selectionTarget}</p>
            </div>
            <Button asChild size="sm" className="ml-auto bg-green-700 hover:bg-green-800">
              <Link href={`/series/${seriesId}/camp/${campId}/results`}>View Results</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Action cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => router.push(`/series/${seriesId}/camp/${campId}/players`)}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10"><Users className="h-5 w-5 text-primary" /></div>
              <div>
                <CardTitle className="text-base">Players & Bibs</CardTitle>
                <CardDescription className="text-xs">{players.length} / {camp.quota} invited</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">Invite players from the series and assign bib numbers.</p>
            <Button variant="link" className="p-0 h-auto mt-2 text-sm">Manage players →</Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => router.push(`/series/${seriesId}/camp/${campId}/assess`)}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-amber-50"><Star className="h-5 w-5 text-amber-500" /></div>
              <div>
                <CardTitle className="text-base">Coach Assessment</CardTitle>
                <CardDescription className="text-xs">{assessedBibs} bibs assessed · {lockedAssessments} locked</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">Rate players by bib number. Truly blind — names not shown.</p>
            <Button variant="link" className="p-0 h-auto mt-2 text-sm">Start assessing →</Button>
          </CardContent>
        </Card>

        {camp.fitnessTestType && (
          <Card className="hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => router.push(`/series/${seriesId}/camp/${campId}/fitness`)}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-50"><Activity className="h-5 w-5 text-blue-500" /></div>
                <div>
                  <CardTitle className="text-base">Fitness Tests</CardTitle>
                  <CardDescription className="text-xs">{fitnessRecorded} / {players.length} recorded · {camp.fitnessTestType}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground">Record fitness test scores. Pass/fail based on score ≥ {camp.fitnessTestPassingScore}.</p>
              <Button variant="link" className="p-0 h-auto mt-2 text-sm">Record fitness →</Button>
            </CardContent>
          </Card>
        )}

        {canManage && (
          <Card className="hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => router.push(`/series/${seriesId}/camp/${campId}/results`)}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-purple-50"><Brain className="h-5 w-5 text-purple-500" /></div>
                <div>
                  <CardTitle className="text-base">Results & AI Selection</CardTitle>
                  <CardDescription className="text-xs">Target: {camp.selectionTarget} players</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground">View aggregated scores, run AI selection, finalise the team.</p>
              <Button variant="link" className="p-0 h-auto mt-2 text-sm">View results →</Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
