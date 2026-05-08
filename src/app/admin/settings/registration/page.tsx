'use client';

/**
 * FILE: src/app/admin/settings/registration/page.tsx
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { getRegistrationSettingsAction, saveRegistrationSettingsAction } from '@/lib/actions/registration-settings-action';
import { getPromoCodesAction, createPromoCodeAction, togglePromoCodeAction, deletePromoCodeAction, type PromoCodeRow } from '@/lib/actions/promo-code-actions';
import { getActiveSeriesForOrgAction } from '@/lib/actions/registration-payment-action';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Save, CreditCard, ShieldAlert, Tag, Plus, Trash2, ToggleLeft, ToggleRight, Info } from 'lucide-react';
import { format } from 'date-fns';

export default function RegistrationSettingsPage() {
  const { userProfile, isAuthLoading, activeOrganizationId } = useAuth();
  const { toast } = useToast();

  const isSuperAdmin = userProfile?.roles?.includes('admin');

  // ── Fee settings state ──
  const [feeDisplay, setFeeDisplay] = useState('3.99');
  const [isActive, setIsActive] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // ── Promo codes state ──
  const [promoCodes, setPromoCodes] = useState<PromoCodeRow[]>([]);
  const [promoLoading, setPromoLoading] = useState(false);
  const [activeSeries, setActiveSeries] = useState<{ id: string; name: string }[]>([]);
  const [showAddPromo, setShowAddPromo] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PromoCodeRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // New promo form
  const [newCode, setNewCode] = useState('');
  const [newDiscountType, setNewDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [newDiscountValue, setNewDiscountValue] = useState('');
  const [newSeriesId, setNewSeriesId] = useState('global');
  const [newMaxUses, setNewMaxUses] = useState('0');
  const [newExpiresAt, setNewExpiresAt] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const orgId = activeOrganizationId || '';

  // ── Load fee settings ──
  useEffect(() => {
    if (!isSuperAdmin) { setIsLoading(false); return; }
    getRegistrationSettingsAction()
      .then((data) => {
        setFeeDisplay((data.defaultFee / 100).toFixed(2));
        setIsActive(data.isActive ?? true);
      })
      .catch(() => toast({ title: 'Could not load settings', variant: 'destructive' }))
      .finally(() => setIsLoading(false));
  }, [isSuperAdmin]);

  // ── Load promo codes + series ──
  const loadPromoCodes = useCallback(async () => {
    if (!orgId) return;
    setPromoLoading(true);
    try {
      const [codes, series] = await Promise.all([
        getPromoCodesAction(orgId),
        getActiveSeriesForOrgAction(orgId),
      ]);
      setPromoCodes(codes);
      setActiveSeries(series);
    } catch {
      toast({ title: 'Could not load promo codes', variant: 'destructive' });
    } finally {
      setPromoLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (isSuperAdmin && orgId) loadPromoCodes();
  }, [isSuperAdmin, orgId, loadPromoCodes]);

  // ── Save fee ──
  const handleSave = async () => {
    const dollars = parseFloat(feeDisplay);
    if (isNaN(dollars) || dollars < 0) {
      toast({ title: 'Invalid fee amount', variant: 'destructive' });
      return;
    }
    const cents = Math.round(dollars * 100);
    setIsSaving(true);
    const res = await saveRegistrationSettingsAction(cents, isActive);
    if (res.success) {
      toast({ title: 'Registration settings saved' });
    } else {
      toast({ title: 'Save failed', description: res.error, variant: 'destructive' });
    }
    setIsSaving(false);
  };

  // ── Create promo code ──
  const handleCreatePromo = async () => {
    setCreateError(null);
    const val = parseFloat(newDiscountValue);
    if (isNaN(val) || val <= 0) { setCreateError('Enter a valid discount value.'); return; }

    setIsCreating(true);
    const res = await createPromoCodeAction({
      code: newCode,
      orgId,
      seriesId: newSeriesId === 'global' ? undefined : newSeriesId,
      discountType: newDiscountType,
      discountValue: newDiscountType === 'fixed' ? Math.round(val * 100) : val,
      maxUses: parseInt(newMaxUses) || 0,
      expiresAt: newExpiresAt || undefined,
    });

    if (res.success) {
      toast({ title: 'Promo code created' });
      setShowAddPromo(false);
      setNewCode(''); setNewDiscountValue(''); setNewSeriesId('global');
      setNewMaxUses('0'); setNewExpiresAt(''); setNewDiscountType('percent');
      await loadPromoCodes();
    } else {
      setCreateError(res.error || 'Failed to create promo code.');
    }
    setIsCreating(false);
  };

  // ── Toggle active ──
  const handleToggle = async (promo: PromoCodeRow) => {
    const res = await togglePromoCodeAction(promo.id, !promo.isActive);
    if (res.success) {
      await loadPromoCodes();
    } else {
      toast({ title: 'Could not update promo code', variant: 'destructive' });
    }
  };

  // ── Delete ──
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const res = await deletePromoCodeAction(deleteTarget.id);
    if (res.success) {
      toast({ title: 'Promo code deleted' });
      await loadPromoCodes();
    } else {
      toast({ title: 'Could not delete promo code', variant: 'destructive' });
    }
    setIsDeleting(false);
    setDeleteTarget(null);
  };

  if (isAuthLoading || isLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!isSuperAdmin) {
    return (
      <div className="max-w-2xl mx-auto mt-8">
        <Alert variant="destructive">
          <ShieldAlert className="h-5 w-5" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>Only system administrators can manage registration settings.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <CreditCard className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-headline font-bold text-primary">Registration Settings</h1>
          <p className="text-muted-foreground text-sm">Configure the default player registration fee and promo codes</p>
        </div>
      </div>

      {/* ── Fee config ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registration Fee</CardTitle>
          <CardDescription>
            This fee is charged to players when they register for a series.
            Set to $0.00 to allow free registration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm font-medium">Default Fee (USD)</Label>
              <p className="text-xs text-muted-foreground">Applied to all new registrations</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">$</span>
              <Input
                type="number" min="0" step="0.01"
                className="h-9 w-24 text-right"
                value={feeDisplay}
                onChange={(e) => setFeeDisplay(e.target.value)}
              />
            </div>
          </div>
          <div className="border-t pt-4 flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm font-medium">Registration Active</Label>
              <p className="text-xs text-muted-foreground">When off, the registration page will not accept new registrations</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current Configuration</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          <div className="py-2 flex justify-between text-sm">
            <span className="text-muted-foreground">Fee per registration</span>
            <span className="font-medium">{parseFloat(feeDisplay) === 0 ? 'Free' : `$${parseFloat(feeDisplay || '0').toFixed(2)}`}</span>
          </div>
          <div className="py-2 flex justify-between text-sm">
            <span className="text-muted-foreground">Payment provider</span>
            <span className="font-medium">Stripe (Test Mode)</span>
          </div>
          <div className="py-2 flex justify-between text-sm">
            <span className="text-muted-foreground">Receipts</span>
            <span className="font-medium">Sent automatically by Stripe</span>
          </div>
          <div className="py-2 flex justify-between text-sm">
            <span className="text-muted-foreground">Refunds</span>
            <span className="font-medium">Via Stripe Dashboard</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {isSaving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

      {/* ── Promo Codes ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Tag className="h-4 w-4" /> Promo Codes
              </CardTitle>
              <CardDescription>Create discount codes for player registration</CardDescription>
            </div>
            <Button size="sm" onClick={() => setShowAddPromo(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Code
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {promoLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : promoCodes.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
              <Info className="h-4 w-4 shrink-0" /> No promo codes yet. Click "Add Code" to create one.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Series</TableHead>
                  <TableHead>Uses</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promoCodes.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono font-semibold text-sm">{p.code}</TableCell>
                    <TableCell className="text-sm">
                      {p.discountType === 'percent'
                        ? `${p.discountValue}%`
                        : `$${(p.discountValue / 100).toFixed(2)}`}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.seriesName || <span className="italic">Global</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.maxUses === 0 ? `${p.usedCount} / ∞` : `${p.usedCount} / ${p.maxUses}`}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.expiresAt ? format(new Date(p.expiresAt), 'MMM d, yyyy') : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.isActive ? 'default' : 'secondary'} className={p.isActive ? 'bg-green-100 text-green-800 border-green-200' : ''}>
                        {p.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleToggle(p)}
                          title={p.isActive ? 'Deactivate' : 'Activate'}>
                          {p.isActive
                            ? <ToggleRight className="h-4 w-4 text-green-600" />
                            : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(p)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Add Promo Dialog ── */}
      <Dialog open={showAddPromo} onOpenChange={setShowAddPromo}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Promo Code</DialogTitle>
            <DialogDescription>Add a discount code for player registration.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Code</Label>
              <Input
                placeholder="e.g. SUMMER25"
                value={newCode}
                onChange={e => setNewCode(e.target.value.toUpperCase())}
                className="font-mono uppercase"
              />
              <p className="text-xs text-muted-foreground">Letters and numbers only, auto-uppercased</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Discount Type</Label>
                <Select value={newDiscountType} onValueChange={(v) => setNewDiscountType(v as 'percent' | 'fixed')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percent (%)</SelectItem>
                    <SelectItem value="fixed">Fixed ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Value</Label>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted-foreground">{newDiscountType === 'fixed' ? '$' : ''}</span>
                  <Input
                    type="number" min="0" step={newDiscountType === 'fixed' ? '0.01' : '1'}
                    placeholder={newDiscountType === 'percent' ? '10' : '1.00'}
                    value={newDiscountValue}
                    onChange={e => setNewDiscountValue(e.target.value)}
                  />
                  <span className="text-sm text-muted-foreground">{newDiscountType === 'percent' ? '%' : ''}</span>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Series (optional)</Label>
              <Select value={newSeriesId} onValueChange={setNewSeriesId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global (all series)</SelectItem>
                  {activeSeries.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Leave as Global to apply to any series</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Max Uses</Label>
                <Input
                  type="number" min="0" placeholder="0 = unlimited"
                  value={newMaxUses}
                  onChange={e => setNewMaxUses(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">0 = unlimited</p>
              </div>
              <div className="space-y-1">
                <Label>Expires (optional)</Label>
                <Input
                  type="date"
                  value={newExpiresAt}
                  onChange={e => setNewExpiresAt(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>

            {createError && (
              <p className="text-sm text-destructive">{createError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddPromo(false); setCreateError(null); }}>Cancel</Button>
            <Button onClick={handleCreatePromo} disabled={isCreating || !newCode.trim() || !newDiscountValue}>
              {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Promo Code</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong className="font-mono">{deleteTarget?.code}</strong>?
              This cannot be undone. Players who already used it will not be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
