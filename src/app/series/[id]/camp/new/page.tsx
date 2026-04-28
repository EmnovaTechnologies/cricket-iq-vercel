'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createCampAction } from '@/lib/actions/camp-actions';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Trophy, Loader2 } from 'lucide-react';
import { FITNESS_TEST_TYPES } from '@/lib/constants';

export default function NewCampPage() {
  const params = useParams<{ id: string }>();
  const seriesId = params.id;
  const router = useRouter();
  const { toast } = useToast();
  const { currentUser, activeOrganizationId } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
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

  const handleSubmit = async () => {
    if (!form.name || !form.startDate || !form.endDate) {
      toast({ title: 'Missing fields', description: 'Name, start date and end date are required.', variant: 'destructive' });
      return;
    }
    if (!currentUser || !activeOrganizationId) return;

    setIsSubmitting(true);
    const res = await createCampAction({
      organizationId: activeOrganizationId,
      seriesId,
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
      router.push(`/series/${seriesId}/camp/${res.campId}`);
    } else {
      toast({ title: 'Error', description: res.error, variant: 'destructive' });
    }
    setIsSubmitting(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/series/${seriesId}/camp`}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Camps
          </Link>
        </Button>
        <h1 className="text-2xl font-headline font-bold text-primary flex items-center gap-2">
          <Trophy className="h-6 w-6" /> New Selection Camp
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Camp Details</CardTitle>
          <CardDescription>Set up the selection camp for this series.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Camp Name *</label>
            <Input placeholder="e.g. SoCal Hub U13 Selection Camp 2026"
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

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Venue</label>
            <Input placeholder="e.g. Canyonside Park" value={form.venue} onChange={e => set('venue', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Player Quota (invited)</label>
              <Input type="number" min={1} value={form.quota} onChange={e => set('quota', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Selection Target (final team)</label>
              <Input type="number" min={1} value={form.selectionTarget} onChange={e => set('selectionTarget', e.target.value)} />
            </div>
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

          <div className="border-t pt-4 space-y-4">
            <p className="text-sm font-medium text-muted-foreground">Fitness Test (optional)</p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Test Type</label>
              <Select value={form.fitnessTestType} onValueChange={v => set('fitnessTestType', v)}>
                <SelectTrigger><SelectValue placeholder="Select test type..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {FITNESS_TEST_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.fitnessTestType && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Passing Score</label>
                <Input type="number" step="0.1" placeholder="e.g. 16.1"
                  value={form.fitnessTestPassingScore}
                  onChange={e => set('fitnessTestPassingScore', e.target.value)} />
                <p className="text-xs text-muted-foreground">Players scoring at or above this value will be marked as Pass.</p>
              </div>
            )}
          </div>

          <Button className="w-full" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trophy className="mr-2 h-4 w-4" />}
            Create Camp
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
