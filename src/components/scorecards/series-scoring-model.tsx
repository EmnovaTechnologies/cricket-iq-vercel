'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import {
  getScoringConfigAction,
  getSeriesScoringConfigAction,
  getOrgScoringConfigAction,
  saveScoringConfigAction,
  deleteSeriesScoringConfigAction,
} from '@/lib/actions/scoring-config-actions';
import type { ScorecardScoringConfig } from '@/types';
import { DEFAULT_SCORING_CONFIG } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save, BarChart3, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PERMISSIONS } from '@/lib/permissions-master-list';

interface SeriesScoringModelProps {
  seriesId: string;
  organizationId: string;
  seriesAdminUids?: string[];
  /** If true, shows edit controls. If false, read-only. */
  canEdit?: boolean;
}

export function SeriesScoringModel({
  seriesId,
  organizationId,
  seriesAdminUids = [],
  canEdit = false,
}: SeriesScoringModelProps) {
  const { currentUser } = useAuth();
  const { toast } = useToast();

  const [orgConfig, setOrgConfig] = useState<ScorecardScoringConfig | null>(null);
  const [seriesConfig, setSeriesConfig] = useState<ScorecardScoringConfig | null>(null);
  const [editConfig, setEditConfig] = useState<ScorecardScoringConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [useCustom, setUseCustom] = useState(false);

  useEffect(() => {
    if (!organizationId || !seriesId) return;
    setIsLoading(true);
    Promise.all([
      getOrgScoringConfigAction(organizationId),
      getSeriesScoringConfigAction(organizationId, seriesId),
    ]).then(([org, series]) => {
      setOrgConfig(org);
      setSeriesConfig(series);
      setUseCustom(!!series);
      setEditConfig(series || { ...org, organizationId, seriesId });
      setIsLoading(false);
    });
  }, [organizationId, seriesId]);

  const handleToggleCustom = (enabled: boolean) => {
    setUseCustom(enabled);
    if (enabled && !seriesConfig) {
      // Copy from org config as starting point
      setEditConfig({ ...(orgConfig || DEFAULT_SCORING_CONFIG), organizationId, seriesId });
    }
  };

  const handleSave = async () => {
    if (!editConfig) return;
    setIsSaving(true);
    const res = await saveScoringConfigAction({ ...editConfig, organizationId, seriesId });
    if (res.success) {
      setSeriesConfig({ ...editConfig, organizationId, seriesId });
      toast({ title: 'Series scoring model saved' });
    } else {
      toast({ title: 'Save failed', description: res.error, variant: 'destructive' });
    }
    setIsSaving(false);
  };

  const num = (val: any) => parseFloat(val) || 0;

  const field = (
    section: 'batting' | 'bowling' | 'fielding',
    key: string,
    label: string,
    hint?: string,
    readonly = false
  ) => {
    const value = readonly
      ? (orgConfig as any)?.[section]?.[key] ?? 0
      : (editConfig as any)?.[section]?.[key] ?? 0;

    return (
      <div className="flex items-center justify-between gap-4 py-1.5 border-b last:border-0">
        <div>
          <p className="text-xs font-medium">{label}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {readonly ? (
          <span className="text-xs font-medium text-muted-foreground w-16 text-right">{value}</span>
        ) : (
          <Input
            type="number" step="0.5"
            className="h-7 w-16 text-xs text-right shrink-0"
            value={value}
            onChange={e => setEditConfig(prev => prev ? ({
              ...prev,
              [section]: { ...(prev[section] as any), [key]: num(e.target.value) }
            }) : prev)}
          />
        )}
      </div>
    );
  };

  if (isLoading) {
    return <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const activeConfig = seriesConfig || orgConfig;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Series Scoring Model
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {seriesConfig
              ? 'This series uses a custom scoring model.'
              : 'This series uses the organization default scoring model.'}
          </p>
        </div>
        {seriesConfig && (
          <Badge variant="secondary" className="text-xs">Custom</Badge>
        )}
        {!seriesConfig && (
          <Badge variant="outline" className="text-xs">Org Default</Badge>
        )}
      </div>

      {canEdit && (
        <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/20">
          <Switch checked={useCustom} onCheckedChange={handleToggleCustom} />
          <div>
            <p className="text-sm font-medium">Use custom scoring model for this series</p>
            <p className="text-xs text-muted-foreground">
              {useCustom
                ? 'Custom weights below will apply to performance scoring and AI selection for this series.'
                : 'Organization scoring model will be used. Enable to customize for this series.'}
            </p>
          </div>
        </div>
      )}

      {/* Scoring fields */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Batting */}
        <div className="space-y-1">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">Batting</p>
          {field('batting', 'runsMultiplier', 'Runs ×', undefined, !canEdit || !useCustom)}
          {field('batting', 'foursMultiplier', '4s ×', undefined, !canEdit || !useCustom)}
          {field('batting', 'sixesMultiplier', '6s ×', undefined, !canEdit || !useCustom)}
          {field('batting', 'srBonus200', 'SR > 200 bonus', undefined, !canEdit || !useCustom)}
          {field('batting', 'srBonus150', 'SR > 150 bonus', undefined, !canEdit || !useCustom)}
          {field('batting', 'srBonus100', 'SR > 100 bonus', undefined, !canEdit || !useCustom)}
          {field('batting', 'srPenaltySub50', 'SR < 50 penalty', '≥5 balls', !canEdit || !useCustom)}
        </div>

        {/* Bowling */}
        <div className="space-y-1">
          <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">Bowling</p>
          {field('bowling', 'wicketsMultiplier', 'Wickets ×', undefined, !canEdit || !useCustom)}
          {field('bowling', 'dotsMultiplier', 'Dots ×', undefined, !canEdit || !useCustom)}
          {field('bowling', 'econBonus4', 'Econ < 4 bonus', undefined, !canEdit || !useCustom)}
          {field('bowling', 'econBonus6', 'Econ < 6 bonus', undefined, !canEdit || !useCustom)}
          {field('bowling', 'econPenalty8', 'Econ > 8 penalty', undefined, !canEdit || !useCustom)}
          {field('bowling', 'widesMultiplier', 'Wides ×', 'negative', !canEdit || !useCustom)}
          {field('bowling', 'noballsMultiplier', 'No-balls ×', 'negative', !canEdit || !useCustom)}
        </div>

        {/* Fielding */}
        <div className="space-y-1">
          <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-2">Fielding</p>
          {field('fielding', 'catchesMultiplier', 'Catches ×', undefined, !canEdit || !useCustom)}
          {field('fielding', 'runOutsMultiplier', 'Run Outs ×', undefined, !canEdit || !useCustom)}
          {field('fielding', 'stumpingsMultiplier', 'Stumpings ×', undefined, !canEdit || !useCustom)}
          {field('fielding', 'keeperCatchesMultiplier', 'Keeper Catches ×', undefined, !canEdit || !useCustom)}
          {field('fielding', 'byesMultiplier', 'Byes ×', 'negative', !canEdit || !useCustom)}
        </div>
      </div>

      {canEdit && useCustom && (
        <Button onClick={handleSave} disabled={isSaving} size="sm">
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {isSaving ? 'Saving...' : 'Save Series Scoring Model'}
        </Button>
      )}
    </div>
  );
}
