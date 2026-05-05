'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  getCampByIdAction, updateCampAction, deleteCampAction,
  getCampPlayersAction, getCampAssessmentsAction, getCampFitnessResultsAction,
  assignSelectorToCampAction, removeSelectorFromCampAction,
} from '@/lib/actions/camp-actions';
import { getUsersForOrgAdminViewFromDB, getSeriesByIdFromDB } from '@/lib/db';
import { useAuth } from '@/contexts/auth-context';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { useToast } from '@/hooks/use-toast';
import { CampTabContent } from '@/components/camp/camp-tab-content';
import { CampSelectorPanel } from '@/components/camp/camp-selector-panel';
import type {
  SelectionCamp, CampPlayer, CampAssessment,
  CampFitnessResult, CampSelectorAssignment
} from '@/types';
import {
  Loader2, ArrowLeft, Trophy, CalendarDays, MapPin,
  Activity, ShieldAlert, Edit3, Trash2, Layers, CheckCircle, Lock, Star, Users
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { FITNESS_TEST_TYPES } from '@/lib/constants';

const statusColors: Record<SelectionCamp['status'], string> = {
  upcoming: 'bg-blue-100 text-blue-700 border-blue-200',
  active: 'bg-green-100 text-green-700 border-green-200',
  completed: 'bg-muted text-muted-foreground border',
};

export default function CampDetailPage() {
  const params = useParams<{ campId: string }>();
  const { campId } = params;
  const router = useRouter();
  const { currentUser, userProfile, activeOrganizationId, effectivePermissions } = useAuth();
  const { toast } = useToast();

  const [camp, setCamp] = useState<SelectionCamp | null>(null);
  const [seriesName, setSeriesName] = useState<string>('');
  const [campPlayers, setCampPlayers] = useState<CampPlayer[]>([]);
  const [campAssessments, setCampAssessments] = useState<CampAssessment[]>([]);
  const [campFitness, setCampFitness] = useState<CampFitnessResult[]>([]);
  const [availableSelectors, setAvailableSelectors] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingCamp, setIsEditingCamp] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeletingCamp, setIsDeletingCamp] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '', startDate: '', endDate: '', venue: '',
    quota: 40, selectionTarget: 15,
    status: 'upcoming' as SelectionCamp['status'],
    fitnessTestType: '', fitnessTestPassingScore: '',
  });
  const setE = (key: string, value: any) => setEditForm(prev => ({ ...prev, [key]: value }));

  const canManage = effectivePermissions[PERMISSIONS.SERIES_MANAGE_TEAMS_ASSIGNED] ||
    effectivePermissions[PERMISSIONS.ORGANIZATIONS_EDIT_ASSIGNED] ||
    effectivePermissions[PERMISSIONS.ORGANIZATIONS_EDIT_ANY];

  useEffect(() => {
    if (!campId || !activeOrganizationId) return;
    Promise.all([
      getCampByIdAction(campId),
      getCampPlayersAction(campId),
      getCampAssessmentsAction(campId),
      getCampFitnessResultsAction(campId),
      getUsersForOrgAdminViewFromDB(activeOrganizationId),
    ]).then(async ([campRes, playersRes, assessRes, fitnessRes, usersRes]) => {
      if (campRes.success && campRes.camp) {
        const c = campRes.camp;
        setCamp(c);
        setEditForm({
          name: c.name, startDate: c.startDate, endDate: c.endDate,
          venue: c.venue || '', quota: c.quota, selectionTarget: c.selectionTarget,
          status: c.status, fitnessTestType: c.fitnessTestType || '',
          fitnessTestPassingScore: c.fitnessTestPassingScore?.toString() || '',
        });
        // Load series name
        try {
          const s = await getSeriesByIdFromDB(c.seriesId);
          if (s) setSeriesName(s.name);
        } catch {}
      }
      if (playersRes.success) setCampPlayers(playersRes.players || []);
      if (assessRes.success) setCampAssessments(assessRes.assessments || []);
      if (fitnessRes.success) setCampFitness(fitnessRes.results || []);
      setAvailableSelectors((usersRes || []).filter((u: any) =>
        u.roles?.includes('selector') || u.roles?.includes('Series Admin')
      ));
      setIsLoading(false);
    });
  }, [campId, activeOrganizationId]);

  const handleUpdate = async () => {
    if (!camp) return;
    setIsUpdating(true);
    const res = await updateCampAction(camp.id, {
      name: editForm.name, startDate: editForm.startDate, endDate: editForm.endDate,
      venue: editForm.venue, quota: Number(editForm.quota),
      selectionTarget: Number(editForm.selectionTarget), status: editForm.status,
      fitnessTestType: editForm.fitnessTestType || undefined,
      fitnessTestPassingScore: editForm.fitnessTestPassingScore ? Number(editForm.fitnessTestPassingScore) : undefined,
    });
    if (res.success) {
      setCamp(prev => prev ? { ...prev, ...editForm, quota: Number(editForm.quota), selectionTarget: Number(editForm.selectionTarget) } : prev);
      setIsEditingCamp(false);
      toast({ title: 'Camp updated!' });
    } else {
      toast({ title: 'Error', description: res.error, variant: 'destructive' });
    }
    setIsUpdating(false);
  };

  const handleDelete = async () => {
    if (!camp || !window.confirm(`Delete "${camp.name}"? This cannot be undone.`)) return;
    setIsDeletingCamp(true);
    const res = await deleteCampAction(camp.id);
    if (res.success) { toast({ title: 'Camp deleted' }); router.push('/camps'); }
    else { toast({ title: 'Cannot delete', description: res.error, variant: 'destructive' }); }
    setIsDeletingCamp(false);
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
      <AlertDescription>This camp does not exist or you don't have access.</AlertDescription>
    </Alert>
  );

  const assessedBibs = new Set(campAssessments.map(a => a.bibNumber)).size;
  const lockedCount = campAssessments.filter(a => a.isLocked).length;
  const selectedCount = campPlayers.filter(p => p.selectionStatus === 'selected').length;

  return (
    <div className="space-y-8">
      {/* Top nav bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="outline" size="sm" asChild>
          <Link href="/camps"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Camps</Link>
        </Button>
        <div className="flex items-center gap-2">
          {canManage && (
            <Select value={camp.status} onValueChange={async v => {
              const res = await updateCampAction(camp.id, { status: v as SelectionCamp['status'] });
              if (res.success) setCamp(prev => prev ? { ...prev, status: v as SelectionCamp['status'] } : prev);
            }}>
              <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          )}
          {canManage && (
            <Button size="sm" variant="outline" onClick={() => setIsEditingCamp(v => !v)}>
              <Edit3 className="h-3.5 w-3.5 mr-1" /> {isEditingCamp ? 'Cancel' : 'Edit'}
            </Button>
          )}
          {canManage && campPlayers.length === 0 && (
            <Button size="sm" variant="outline" className="text-destructive border-destructive hover:bg-destructive/10"
              onClick={handleDelete} disabled={isDeletingCamp}>
              {isDeletingCamp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      </div>

      {/* Page title */}
      <div>
        <h1 className="text-3xl font-headline font-bold text-primary flex items-center gap-2">
          <Trophy className="h-8 w-8" /> {camp.name}
        </h1>
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          {seriesName && (
            <Link href={`/series/${camp.seriesId}/details`}
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              onClick={e => e.stopPropagation()}>
              <Layers className="h-3.5 w-3.5" /> {seriesName} →
            </Link>
          )}
          {camp.startDate && (
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {format(parseISO(camp.startDate), 'PP')}
              {camp.endDate !== camp.startDate && ` → ${format(parseISO(camp.endDate), 'PP')}`}
            </span>
          )}
          {camp.venue && (
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {camp.venue}
            </span>
          )}
          {camp.fitnessTestType && (
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Activity className="h-3.5 w-3.5" /> {camp.fitnessTestType} · pass ≥ {camp.fitnessTestPassingScore}
            </span>
          )}
        </div>
      </div>

      {/* Edit form */}
      {isEditingCamp && (
        <Card>
          <CardContent className="pt-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Camp Name</label>
              <Input value={editForm.name} onChange={e => setE('name', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><label className="text-sm font-medium">Start Date</label><Input type="date" value={editForm.startDate} onChange={e => setE('startDate', e.target.value)} /></div>
              <div className="space-y-1.5"><label className="text-sm font-medium">End Date</label><Input type="date" value={editForm.endDate} onChange={e => setE('endDate', e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><label className="text-sm font-medium">Venue</label><Input value={editForm.venue} onChange={e => setE('venue', e.target.value)} /></div>
              <div className="space-y-1.5"><label className="text-sm font-medium">Status</label>
                <Select value={editForm.status} onValueChange={v => setE('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upcoming">Upcoming</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><label className="text-sm font-medium">Quota</label><Input type="number" min={1} value={editForm.quota} onChange={e => setE('quota', e.target.value)} /></div>
              <div className="space-y-1.5"><label className="text-sm font-medium">Selection Target</label><Input type="number" min={1} value={editForm.selectionTarget} onChange={e => setE('selectionTarget', e.target.value)} /></div>
            </div>
            <div className="border-t pt-3 space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Fitness Test</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Test Type</label>
                  <Select value={editForm.fitnessTestType || 'none'} onValueChange={v => setE('fitnessTestType', v === 'none' ? '' : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {FITNESS_TEST_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {editForm.fitnessTestType && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Passing Score</label>
                    <Input type="number" step="0.1" value={editForm.fitnessTestPassingScore} onChange={e => setE('fitnessTestPassingScore', e.target.value)} />
                  </div>
                )}
              </div>
            </div>
            <Button className="w-full" onClick={handleUpdate} disabled={isUpdating}>
              {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
              Save Changes
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Selector panel */}
      {canManage && currentUser && (
        <CampSelectorPanel
          campId={camp.id}
          assignments={camp.assignedSelectors || []}
          availableSelectors={availableSelectors}
          assignedBy={currentUser.uid}
          onAssignmentsChanged={updated => setCamp(prev => prev ? { ...prev, assignedSelectors: updated } : prev)}
        />
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Players invited', value: campPlayers.length, max: camp.quota, icon: <Users className="h-4 w-4" /> },
          { label: 'Bibs assessed', value: assessedBibs, max: campPlayers.length, icon: <Star className="h-4 w-4" /> },
          { label: 'Locked', value: lockedCount, max: campAssessments.length, icon: <Lock className="h-4 w-4" /> },
          { label: 'Selected', value: selectedCount, max: camp.selectionTarget, icon: <CheckCircle className="h-4 w-4" /> },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">{stat.icon}<span className="text-xs">{stat.label}</span></div>
              <p className="text-2xl font-bold text-primary">{stat.value}<span className="text-sm font-normal text-muted-foreground">/{stat.max}</span></p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Inline sub-tabs */}
      <CampTabContent
        camp={camp}
        seriesId={camp.seriesId}
        initialPlayers={campPlayers}
        initialAssessments={campAssessments}
        initialFitness={campFitness}
      />
    </div>
  );
}
