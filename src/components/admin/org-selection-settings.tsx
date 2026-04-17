'use client';

/**
 * FILE: src/components/admin/org-selection-settings.tsx
 *
 * Selection model and rating/report scope settings for an organization.
 * Rendered on the org edit page. Admin and Org Admin only.
 */

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Settings2, Trophy, FileText, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Organization } from '@/types';
import { updateOrgSelectionSettingsAction } from '@/lib/actions/organization-actions';

interface OrgSelectionSettingsProps {
  org: Organization;
  onSaved?: (updated: Partial<Organization>) => void;
}

// ─── Radio option component ───────────────────────────────────────────────────

function RadioOption({
  value, current, onChange, label, description, disabled,
}: {
  value: string; current: string; onChange: (v: string) => void;
  label: string; description: string; disabled?: boolean;
}) {
  const selected = value === current;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(value)}
      className={cn(
        'w-full text-left flex items-start gap-3 p-3 rounded-lg border-2 transition-colors',
        selected ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/40',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <div className={cn(
        'mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center',
        selected ? 'border-primary' : 'border-muted-foreground'
      )}>
        {selected && <div className="h-2 w-2 rounded-full bg-primary" />}
      </div>
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </button>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────

function SectionHeading({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-start gap-2.5 mb-3">
      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function OrgSelectionSettings({ org, onSaved }: OrgSelectionSettingsProps) {
  const { toast } = useToast();

  const [selectionModel, setSelectionModel] = useState<string>(org.selectionModel || 'hybrid');
  const [ratingScope, setRatingScope] = useState<string>(org.ratingScope || 'opposing_only');
  const [ratingVisibility, setRatingVisibility] = useState<string>(org.ratingVisibility || 'admin_only');
  const [ratingAggregation, setRatingAggregation] = useState<string>(org.ratingAggregation || 'average');
  const [selectorReportScope, setSelectorReportScope] = useState<string>(org.selectorReportScope || 'opposing_only');
  const [isSaving, setIsSaving] = useState(false);

  const isRatingModel = selectionModel === 'rating' || selectionModel === 'hybrid';
  const isPerformanceModel = selectionModel === 'performance' || selectionModel === 'hybrid';

  const handleSave = async () => {
    setIsSaving(true);
    const updates = {
      selectionModel: selectionModel as Organization['selectionModel'],
      ratingScope: ratingScope as Organization['ratingScope'],
      ratingVisibility: ratingVisibility as Organization['ratingVisibility'],
      ratingAggregation: ratingAggregation as Organization['ratingAggregation'],
      selectorReportScope: selectorReportScope as Organization['selectorReportScope'],
    };
    const res = await updateOrgSelectionSettingsAction(org.id, updates);
    if (res.success) {
      toast({ title: 'Selection settings saved' });
      onSaved?.(updates);
    } else {
      toast({ title: 'Save failed', description: res.error, variant: 'destructive' });
    }
    setIsSaving(false);
  };

  const hasChanges =
    selectionModel !== (org.selectionModel || 'hybrid') ||
    ratingScope !== (org.ratingScope || 'opposing_only') ||
    ratingVisibility !== (org.ratingVisibility || 'admin_only') ||
    ratingAggregation !== (org.ratingAggregation || 'average') ||
    selectorReportScope !== (org.selectorReportScope || 'opposing_only');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="h-4 w-4 text-primary" /> Selection Settings
        </CardTitle>
        <CardDescription>
          Configure how your organisation selects players and what selectors can rate or report on.
          These settings affect the navbar, rating forms, and match report forms across the platform.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">

        {/* ── Selection Model ── */}
        <div>
          <SectionHeading
            icon={<BarChart3 className="h-4 w-4 text-primary" />}
            title="Selection Model"
            description="How does your organisation select players for the XI?"
          />
          <div className="space-y-2">
            <RadioOption
              value="rating"
              current={selectionModel}
              onChange={setSelectionModel}
              label="Rating-based"
              description="Selectors watch games and rate players. Team AI uses those ratings to suggest the XI. Scorecards and XI Selector are hidden."
            />
            <RadioOption
              value="performance"
              current={selectionModel}
              onChange={setSelectionModel}
              label="Performance-based"
              description="Scorecards drive selection. XI Selector uses match statistics to suggest the XI. Games, rating tools, and Team AI are hidden."
            />
            <RadioOption
              value="hybrid"
              current={selectionModel}
              onChange={setSelectionModel}
              label="Hybrid (recommended)"
              description="Both signals combined. Selector ratings and scorecard performance data are merged. Everything is visible. Requires player linking for full benefit."
            />
          </div>
        </div>

        {/* ── Rating Settings — only for rating/hybrid ── */}
        {isRatingModel && (
          <div className="space-y-6 border-t pt-6">
            <SectionHeading
              icon={<Trophy className="h-4 w-4 text-primary" />}
              title="Rating Settings"
              description="Controls how selectors rate players in the rating flow."
            />

            {/* Rating scope */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Who do selectors rate?</p>
              <div className="space-y-2">
                <RadioOption
                  value="opposing_only"
                  current={ratingScope}
                  onChange={setRatingScope}
                  label="Opposing team only"
                  description="Selectors rate the players from the other team. Reduces bias — you don't rate your own players."
                />
                <RadioOption
                  value="own_team"
                  current={ratingScope}
                  onChange={setRatingScope}
                  label="Own team only"
                  description="Selectors rate their own team's players. Useful for internal squad assessment."
                />
                <RadioOption
                  value="both_teams"
                  current={ratingScope}
                  onChange={setRatingScope}
                  label="Both teams"
                  description="Selectors can rate any player. Useful for neutral selectors or development programmes."
                />
              </div>
            </div>

            {/* Rating visibility */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Who can see ratings?</p>
              <div className="space-y-2">
                <RadioOption
                  value="admin_only"
                  current={ratingVisibility}
                  onChange={setRatingVisibility}
                  label="Admin only"
                  description="Only admins and org admins can see individual selector ratings. Selectors see only their own."
                />
                <RadioOption
                  value="selectors_own"
                  current={ratingVisibility}
                  onChange={setRatingVisibility}
                  label="Selectors see their own"
                  description="Each selector can see their own ratings but not other selectors'. Admins see all."
                />
                <RadioOption
                  value="all_selectors"
                  current={ratingVisibility}
                  onChange={setRatingVisibility}
                  label="All selectors"
                  description="All selectors can see each other's ratings. Encourages discussion but may introduce bias."
                />
              </div>
            </div>

            {/* Rating aggregation */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">How are ratings combined?</p>
              <div className="space-y-2">
                <RadioOption
                  value="average"
                  current={ratingAggregation}
                  onChange={setRatingAggregation}
                  label="Average across selectors"
                  description="All selector ratings for a player are averaged. Most balanced approach."
                />
                <RadioOption
                  value="latest"
                  current={ratingAggregation}
                  onChange={setRatingAggregation}
                  label="Most recent rating"
                  description="The latest rating submitted for each player is used. Reflects the most current view."
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Match Report Settings — only for performance/hybrid ── */}
        {isPerformanceModel && (
          <div className="space-y-4 border-t pt-6">
            <SectionHeading
              icon={<FileText className="h-4 w-4 text-primary" />}
              title="Match Report Settings"
              description="Controls what selectors can report on in the match report form."
            />

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Who do selectors report on?</p>
              <div className="space-y-2">
                <RadioOption
                  value="opposing_only"
                  current={selectorReportScope}
                  onChange={setSelectorReportScope}
                  label="Opposing team only"
                  description="Selectors submit a report evaluating the opposing team's players. Standard for most leagues."
                />
                <RadioOption
                  value="both_teams"
                  current={selectorReportScope}
                  onChange={setSelectorReportScope}
                  label="Both teams"
                  description="Selectors can report on any player from either team. Suitable for neutral selectors."
                />
                <RadioOption
                  value="own_team_only"
                  current={selectorReportScope}
                  onChange={setSelectorReportScope}
                  label="Own team only"
                  description="Selectors evaluate their own team's performance. Useful for self-assessment programmes."
                />
              </div>
            </div>
          </div>
        )}

        {/* Save */}
        <div className="border-t pt-4">
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            className="w-full sm:w-auto"
          >
            {isSaving
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
              : 'Save Selection Settings'
            }
          </Button>
          {!hasChanges && (
            <p className="text-xs text-muted-foreground mt-2">No changes to save.</p>
          )}
        </div>

      </CardContent>
    </Card>
  );
}
