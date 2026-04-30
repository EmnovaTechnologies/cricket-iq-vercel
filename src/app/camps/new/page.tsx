'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createCampAction, getCampsForOrgAction } from '@/lib/actions/camp-actions';
import { getAllSeriesFromDB } from '@/lib/db';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import type { Series } from '@/types';
import { ArrowLeft, Trophy, Loader2 } from 'lucide-react';
import { FITNESS_TEST_TYPES } from '@/lib/constants';

function NewCampForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { currentUser, activeOrganizationId } = useAuth();

  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [existingCampSeriesIds, setExistingCampSeriesIds] = useState<Set<string>>(new Set());
  const [isLoadingSeries, setIsLoadingSeries] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState({
    seriesId: searchParams.get('seriesId') || '',
    name: '',
    startDate: '',
    endDate: '',
    venue: '',
    quota: 40,
    selectionTarget: 15,
    status: 'upcoming' as const,
    fitnessTestType: '',
    fitnessTestPassingScore: '',
  });
  const set = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (!activeOrganizationId) return;
    Promise.all([
      getAllSeriesFromDB(activeOrganizationId),
      getCampsForOrgAction(activeOrganizationId),
    ]).then(([series, campsRes]) => {
      setSeriesList((series || []).filter((s: Series) => s.status !== 'archived'));
      if (campsRes.success && campsRes.camps) {
        setExistingCampSeriesIds(new Set(campsRes.camps.map(c => c.seriesId)));
      }
      setIsLoadingSeries(false);
    });
  }, [activeOrganizationId]);

  // Auto-fill name when series is selected
  const handleSeriesChange = (seriesId: string) => {
    set('seriesId', seriesId);
    const s = seriesList.find(s => s.id === seriesId);
    if (s && !form.name) {
      set('name', `${s.name} — Selection Camp`);
    }
  };

  const handleSubmit = async () => {
    if (!form.seriesId || !form.name || !form.startDate || !form.endDate) {
      toast({ title: 'Missing fields', description: 'Series, name, start and end date are required.', variant: 'destructive' });
      return;
    }
    if (!currentUser || !activeOrganizationId) return;
    setIsSubmitting(true);
    const res = await createCampAction({
      organizationId: activeOrganizationId,
      seriesId: form.seriesId,
      name: form.name,
      year: new Date(form.startDate).getFullYear(),
      startDate: form.startDate,
      endDate: form.endDate,
      venue: form.venue,
      quota: Number(form.quota),
      selectionTarget: Number(form.selectionTarget),
      status: form.status,
      fitnessTestType: form.fitnessTestType || undefined,
      fitnessTestPassingScore: form.fitnessTestPassingScore ? Number(form.fitnessTestPassingScore) : undefined,
      createdBy: currentUser.uid,
    });
    if (res.success) {
      toast({ title: 'Camp created!' });
      router.push(`/camps/${res.campId}`);
    } else {
      toast({ title: 'Error', description: res.error, variant: 'destructive' });
    }
    setIsSubmitting(false);
  };

  const availableSeries = seriesList.filter(s => !existingCampSeriesIds.has(s.id));

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link href="/camps"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Camps</Link>
        </Button>
      </div>
      <h1 className="text-3xl font-headline font-bold text-primary flex items-center gap-2">
        <Trophy className="h-8 w-8" /> New Selection Camp
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Camp Details</CardTitle>
          <CardDescription>Select a series and configure the selection camp.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Series picker */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Series *</label>
            {isLoadingSeries ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading series...
              </div>
            ) : (
              <Select value={form.seriesId} onValueChange={handleSeriesChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a series..." />
                </SelectTrigger>
                <SelectContent>
                  {availableSeries.length === 0 ? (
                    <SelectItem value="none" disabled>All active series already have camps</SelectItem>
                  ) : (
                    availableSeries.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.ageCategory} · {s.year})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
            {existingCampSeriesIds.size > 0 && (
              <p className="text-xs text-muted-foreground">
                {existingCampSeriesIds.size} series already {existingCampSeriesIds.size === 1 ? 'has' : 'have'} a camp and are not shown.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Camp Name *</label>
            <Input placeholder="e.g. SoCal Hub U15 Selection Camp 2026"
              value={form.name} onChange={e => set('name', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Start Date *</label>
              <Input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">End Date *</label>
              <Input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Venue</label>
              <Input placeholder="e.g. Canyonside Park" value={form.venue} onChange={e => set('venue', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Status</label>
              <Select value={form.status} onValueChange={v => set('status', v)}>
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
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Player Quota (invited)</label>
              <Input type="number" min={1} value={form.quota} onChange={e => set('quota', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Selection Target</label>
              <Input type="number" min={1} value={form.selectionTarget} onChange={e => set('selectionTarget', e.target.value)} />
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Fitness Test (optional)</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Test Type</label>
                <Select value={form.fitnessTestType || 'none'} onValueChange={v => set('fitnessTestType', v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Select test type..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {FITNESS_TEST_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.fitnessTestType && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Passing Score</label>
                  <Input type="number" step="0.1" placeholder="e.g. 16.1"
                    value={form.fitnessTestPassingScore}
                    onChange={e => set('fitnessTestPassingScore', e.target.value)} />
                </div>
              )}
            </div>
          </div>

          <Button className="w-full" onClick={handleSubmit} disabled={isSubmitting || !form.seriesId}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trophy className="mr-2 h-4 w-4" />}
            Create Camp
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function NewCampPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center min-h-[calc(100vh-12rem)]"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>}>
      <NewCampForm />
    </Suspense>
  );
}
