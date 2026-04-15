'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { getOrgScoringConfigAction, saveScoringConfigAction } from '@/lib/actions/scoring-config-actions';
import { getAllOrganizationsFromDB } from '@/lib/db';
import type { ScorecardScoringConfig, Organization } from '@/types';
import { DEFAULT_SCORING_CONFIG } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Save, BarChart3, RotateCcw, ShieldAlert } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

export default function ScoringConfigPage() {
  const { userProfile, activeOrganizationId, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const isSuperAdmin = userProfile?.roles?.includes('admin');
  const isOrgAdmin = userProfile?.roles?.includes('Organization Admin');

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [config, setConfig] = useState<ScorecardScoringConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load orgs for super admin
  useEffect(() => {
    if (isSuperAdmin) {
      getAllOrganizationsFromDB().then(orgs => {
        setOrganizations(orgs);
        if (orgs.length > 0 && !selectedOrgId) {
          const defaultOrg = activeOrganizationId || orgs[0].id;
          setSelectedOrgId(defaultOrg);
        }
      });
    } else if (isOrgAdmin && activeOrganizationId) {
      setSelectedOrgId(activeOrganizationId);
    }
  }, [isSuperAdmin, isOrgAdmin, activeOrganizationId]);

  // Load config when org selected
  useEffect(() => {
    if (!selectedOrgId) return;
    setIsLoading(true);
    getOrgScoringConfigAction(selectedOrgId).then(cfg => {
      setConfig(cfg);
      setIsLoading(false);
    });
  }, [selectedOrgId]);

  const handleSave = async () => {
    if (!config || !selectedOrgId) return;
    setIsSaving(true);
    const res = await saveScoringConfigAction({ ...config, organizationId: selectedOrgId });
    if (res.success) {
      toast({ title: 'Scoring formula saved' });
    } else {
      toast({ title: 'Save failed', description: res.error, variant: 'destructive' });
    }
    setIsSaving(false);
  };

  const handleReset = () => {
    if (!selectedOrgId) return;
    setConfig({ ...DEFAULT_SCORING_CONFIG, organizationId: selectedOrgId });
    toast({ title: 'Reset to defaults', description: 'Click Save to apply.' });
  };

  const num = (val: any) => parseFloat(val) || 0;

  const field = (
    section: 'batting' | 'bowling' | 'fielding',
    key: string,
    label: string,
    hint?: string
  ) => (
    <div className="flex items-center justify-between gap-4 py-2 border-b last:border-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Input
        type="number"
        step="0.5"
        className="h-8 w-20 text-sm text-right shrink-0"
        value={(config as any)?.[section]?.[key] ?? ''}
        onChange={e => setConfig(prev => prev ? ({
          ...prev,
          [section]: { ...(prev[section] as any), [key]: num(e.target.value) }
        }) : prev)}
      />
    </div>
  );

  if (authLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!isSuperAdmin && !isOrgAdmin) {
    return (
      <div className="max-w-2xl mx-auto mt-8">
        <Alert variant="destructive">
          <ShieldAlert className="h-5 w-5" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>You do not have permission to manage the scoring formula.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-headline font-bold text-primary">Scoring Formula</h1>
          <p className="text-muted-foreground text-sm">Configure how player performance is scored from scorecards</p>
        </div>
      </div>

      {/* Org selector — super admin only */}
      {isSuperAdmin && organizations.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Label className="shrink-0">Organization</Label>
              <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                <SelectTrigger className="max-w-xs">
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map(org => (
                    <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : config ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Batting */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-blue-700">Batting</CardTitle>
              <CardDescription className="text-xs">Points per batting performance</CardDescription>
            </CardHeader>
            <CardContent>
              {field('batting', 'runsMultiplier', 'Runs ×', 'Points per run')}
              {field('batting', 'foursMultiplier', '4s ×')}
              {field('batting', 'sixesMultiplier', '6s ×')}
              {field('batting', 'srBonus200', 'SR > 200 bonus')}
              {field('batting', 'srBonus150', 'SR > 150 bonus')}
              {field('batting', 'srBonus100', 'SR > 100 bonus')}
              {field('batting', 'srPenaltySub50', 'SR < 50 penalty', '≥5 balls faced')}
            </CardContent>
          </Card>

          {/* Bowling */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-green-700">Bowling</CardTitle>
              <CardDescription className="text-xs">Points per bowling performance</CardDescription>
            </CardHeader>
            <CardContent>
              {field('bowling', 'wicketsMultiplier', 'Wickets ×')}
              {field('bowling', 'dotsMultiplier', 'Dots ×')}
              {field('bowling', 'econBonus4', 'Econ < 4 bonus')}
              {field('bowling', 'econBonus6', 'Econ < 6 bonus')}
              {field('bowling', 'econPenalty8', 'Econ > 8 penalty')}
              {field('bowling', 'widesMultiplier', 'Wides ×', 'Use negative')}
              {field('bowling', 'noballsMultiplier', 'No-balls ×', 'Use negative')}
            </CardContent>
          </Card>

          {/* Fielding */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-purple-700">Fielding</CardTitle>
              <CardDescription className="text-xs">Points per fielding contribution</CardDescription>
            </CardHeader>
            <CardContent>
              {field('fielding', 'catchesMultiplier', 'Catches ×')}
              {field('fielding', 'runOutsMultiplier', 'Run Outs ×')}
              {field('fielding', 'stumpingsMultiplier', 'Stumpings ×')}
              {field('fielding', 'keeperCatchesMultiplier', 'Keeper Catches ×')}
              {field('fielding', 'byesMultiplier', 'Byes ×', 'Use negative')}
            </CardContent>
          </Card>
        </div>

        {/* Coach Top Rating */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-yellow-700">Coach Top Rating</CardTitle>
            <CardDescription className="text-xs">Points per mention in opposing coach's Top 3 (max 3 mentions)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4 py-2">
              <div>
                <p className="text-sm font-medium">Per Mention ×</p>
                <p className="text-xs text-muted-foreground">Applied up to 3 times per player</p>
              </div>
              <Input
                type="number" step="0.5"
                className="h-8 w-20 text-sm text-right shrink-0"
                value={config?.coachTopRatingPerMention ?? 15}
                onChange={e => setConfig(prev => prev ? ({ ...prev, coachTopRatingPerMention: num(e.target.value) }) : prev)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={handleReset} disabled={isSaving}>
            <RotateCcw className="mr-2 h-4 w-4" /> Reset to Defaults
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {isSaving ? 'Saving...' : 'Save Formula'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
