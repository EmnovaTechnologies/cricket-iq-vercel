'use client';

/**
 * FILE: src/app/admin/settings/registration/page.tsx
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { getRegistrationSettingsAction, saveRegistrationSettingsAction } from '@/lib/actions/registration-settings-action';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save, CreditCard, ShieldAlert } from 'lucide-react';

export default function RegistrationSettingsPage() {
  const { userProfile, isAuthLoading } = useAuth();
  const { toast } = useToast();

  const isSuperAdmin = userProfile?.roles?.includes('admin');

  const [feeDisplay, setFeeDisplay] = useState('3.99');
  const [isActive, setIsActive] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

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
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <CreditCard className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-headline font-bold text-primary">Registration Settings</h1>
          <p className="text-muted-foreground text-sm">Configure the default player registration fee</p>
        </div>
      </div>

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
                type="number"
                min="0"
                step="0.01"
                className="h-9 w-24 text-right"
                value={feeDisplay}
                onChange={(e) => setFeeDisplay(e.target.value)}
              />
            </div>
          </div>

          <div className="border-t pt-4 flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm font-medium">Registration Active</Label>
              <p className="text-xs text-muted-foreground">
                When off, the registration page will not accept new registrations
              </p>
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
            <span className="font-medium">
              {parseFloat(feeDisplay) === 0 ? 'Free' : `$${parseFloat(feeDisplay || '0').toFixed(2)}`}
            </span>
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
    </div>
  );
}
