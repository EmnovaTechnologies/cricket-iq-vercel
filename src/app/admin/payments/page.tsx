'use client';

/**
 * FILE: src/app/admin/payments/page.tsx
 *
 * Payment ledger for system admins.
 * Shows all playerPayments with player name, series, amount, status, receipt link.
 * System admin can waive payment for any player.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { getPaymentsAction, waivePaymentAction, type PaymentRow } from '@/lib/actions/admin-payments-action';
import { getAllOrganizationsFromDB } from '@/lib/db';
import type { Organization } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, CreditCard, ShieldAlert, ExternalLink, HandCoins, Search } from 'lucide-react';
import { format } from 'date-fns';

function StatusBadge({ status }: { status: PaymentRow['status'] }) {
  const variants: Record<string, string> = {
    succeeded: 'bg-green-100 text-green-800 border-green-200',
    waived: 'bg-blue-100 text-blue-800 border-blue-200',
    pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    failed: 'bg-red-100 text-red-800 border-red-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${variants[status] || ''}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function AdminPaymentsPage() {
  const { userProfile, isAuthLoading, activeOrganizationId } = useAuth();
  const { toast } = useToast();

  const isSuperAdmin = userProfile?.roles?.includes('admin');

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('all');
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [filtered, setFiltered] = useState<PaymentRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);

  // Waive dialog
  const [waiveTarget, setWaiveTarget] = useState<PaymentRow | null>(null);
  const [isWaiving, setIsWaiving] = useState(false);

  const loadPayments = useCallback(async () => {
    setIsLoading(true);
    try {
      const orgFilter = selectedOrgId === 'all' ? undefined : selectedOrgId;
      const data = await getPaymentsAction(orgFilter);
      setPayments(data);
    } catch {
      toast({ title: 'Could not load payments', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => {
    if (!isSuperAdmin) { setIsLoading(false); return; }
    getAllOrganizationsFromDB().then(orgs => setOrganizations(orgs));
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    loadPayments();
  }, [loadPayments, isSuperAdmin]);

  // Filter
  useEffect(() => {
    let result = payments;
    if (statusFilter !== 'all') result = result.filter(p => p.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.playerName.toLowerCase().includes(q) ||
        p.seriesName.toLowerCase().includes(q) ||
        p.stripeSessionId.toLowerCase().includes(q)
      );
    }
    setFiltered(result);
  }, [payments, statusFilter, search]);

  const handleWaive = async () => {
    if (!waiveTarget || !userProfile) return;
    setIsWaiving(true);
    const res = await waivePaymentAction(
      waiveTarget.playerId,
      waiveTarget.seriesId,
      waiveTarget.organizationId,
      userProfile.uid,
    );
    if (res.success) {
      toast({ title: 'Payment waived successfully' });
      await loadPayments();
    } else {
      toast({ title: 'Waive failed', description: res.error, variant: 'destructive' });
    }
    setIsWaiving(false);
    setWaiveTarget(null);
  };

  const totalRevenue = payments
    .filter(p => p.status === 'succeeded' && !p.stripeSessionId.startsWith('free-'))
    .reduce((sum, p) => sum + p.amount, 0);

  if (isAuthLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!isSuperAdmin) {
    return (
      <div className="max-w-2xl mx-auto mt-8">
        <Alert variant="destructive">
          <ShieldAlert className="h-5 w-5" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>Only system administrators can view the payment ledger.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <CreditCard className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-headline font-bold text-primary">Payment Ledger</h1>
          <p className="text-muted-foreground text-sm">All player registration payments</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total Payments</p>
            <p className="text-2xl font-bold">{payments.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Revenue Collected</p>
            <p className="text-2xl font-bold text-green-600">${(totalRevenue / 100).toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Waived</p>
            <p className="text-2xl font-bold text-blue-600">
              {payments.filter(p => p.status === 'waived').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Free Registrations</p>
            <p className="text-2xl font-bold">
              {payments.filter(p => p.status === 'succeeded' && p.stripeSessionId.startsWith('free-')).length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {organizations.length > 0 && (
          <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All organizations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All organizations</SelectItem>
              {organizations.map(o => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="succeeded">Succeeded</SelectItem>
            <SelectItem value="waived">Waived</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search player, series…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">No payments found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead>Series</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Receipt</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.playerName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.seriesName}</TableCell>
                    <TableCell>
                      {p.amount === 0
                        ? <span className="text-muted-foreground text-sm">Free</span>
                        : <span className="font-medium">${(p.amount / 100).toFixed(2)}</span>
                      }
                      {p.originalAmount > p.amount && (
                        <span className="ml-1 line-through text-xs text-muted-foreground">
                          ${(p.originalAmount / 100).toFixed(2)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell><StatusBadge status={p.status} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.paidAt ? format(new Date(p.paidAt), 'MMM d, yyyy') : '—'}
                    </TableCell>
                    <TableCell>
                      {p.receiptUrl ? (
                        <a
                          href={p.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          View <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {p.status !== 'waived' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setWaiveTarget(p)}
                          className="h-7 px-2 text-xs"
                        >
                          <HandCoins className="h-3 w-3 mr-1" /> Waive
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Waive confirmation dialog */}
      <Dialog open={!!waiveTarget} onOpenChange={() => setWaiveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Waive Payment</DialogTitle>
            <DialogDescription>
              This will mark the registration fee as waived for{' '}
              <strong>{waiveTarget?.playerName}</strong> in{' '}
              <strong>{waiveTarget?.seriesName}</strong>.
              They will gain full access without paying.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWaiveTarget(null)} disabled={isWaiving}>
              Cancel
            </Button>
            <Button onClick={handleWaive} disabled={isWaiving}>
              {isWaiving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Waive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
