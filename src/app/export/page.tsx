'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import {
  getExportScopeAction,
  exportPlayersAction,
  exportRatingsAction,
  type ExportScope,
  type ExportSeries,
  type ExportOrg,
} from '@/lib/actions/export-data-action';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Download, FileSpreadsheet, FileText, Users, Star,
  ShieldAlert, Loader2, Building, Layers, Info
} from 'lucide-react';
import * as XLSX from 'xlsx';

type RatingsFilter = 'all' | 'finalized' | 'not_finalized';

export default function ExportPage() {
  const { currentUser, effectivePermissions } = useAuth();

  const [scope, setScope] = useState<ExportScope | null>(null);
  const [loadingScope, setLoadingScope] = useState(true);

  // Scope selectors
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [selectedSeriesId, setSelectedSeriesId] = useState<string>('');
  const [ratingsFilter, setRatingsFilter] = useState<RatingsFilter>('all');

  // Loading states
  const [exportingPlayers, setExportingPlayers] = useState<'xlsx' | 'csv' | null>(null);
  const [exportingRatings, setExportingRatings] = useState<'xlsx' | 'csv' | null>(null);

  const canExportOrg = effectivePermissions[PERMISSIONS.DATA_EXPORT_ORG];
  const canExportSeries = effectivePermissions[PERMISSIONS.DATA_EXPORT_SERIES];

  useEffect(() => {
    if (!currentUser) return;
    const load = async () => {
      setLoadingScope(true);
      try {
        const s = await getExportScopeAction(currentUser.uid);
        setScope(s);
        // Auto-select first org if only one
        if (s.orgs.length === 1) setSelectedOrgId(s.orgs[0].id);
      } catch (e) {
        console.error('Failed to load export scope:', e);
      } finally {
        setLoadingScope(false);
      }
    };
    load();
  }, [currentUser]);

  // Filter series by selected org
  const filteredSeries = scope?.series.filter(s =>
    !selectedOrgId || s.organizationId === selectedOrgId
  ) || [];

  const selectedSeries = scope?.series.find(s => s.id === selectedSeriesId);
  const selectedOrg = scope?.orgs.find(o => o.id === selectedOrgId);

  // Determine export scope params
  const getExportParams = () => {
    if (selectedSeriesId && selectedSeries) {
      return {
        seriesId: selectedSeriesId,
        organizationId: undefined,
        seriesName: `${selectedSeries.name}_${selectedSeries.year}`,
        orgName: selectedSeries.organizationName,
      };
    }
    if (selectedOrgId && canExportOrg) {
      return {
        seriesId: undefined,
        organizationId: selectedOrgId,
        seriesName: undefined,
        orgName: selectedOrg?.name,
      };
    }
    return null;
  };

  const canExport = !!getExportParams();

  // ── Download helpers ───────────────────────────────────────────────────────
  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
  };

  const rowsToCSV = (rows: Record<string, any>[]): string => {
    if (rows.length === 0) return '';
    const headers = Object.keys(rows[0]);
    const lines = [headers.join(',')];
    rows.forEach(row => {
      lines.push(headers.map(h => {
        const v = String(row[h] ?? '').replace(/"/g, '""');
        return v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v}"` : v;
      }).join(','));
    });
    return lines.join('\r\n');
  };

  // ── Export Players ─────────────────────────────────────────────────────────
  const handleExportPlayers = async (format: 'xlsx' | 'csv') => {
    const params = getExportParams();
    if (!params) return;
    setExportingPlayers(format);
    try {
      const { rows, fileName } = await exportPlayersAction(params);
      if (rows.length === 0) {
        alert('No player data found for the selected scope.');
        return;
      }
      if (format === 'xlsx') {
        const ExcelJS = (await import('exceljs')).default;
        const wb = new ExcelJS.Workbook();
        wb.creator = 'Cricket IQ';
        const ws = wb.addWorksheet('Players');
        ws.views = [{ state: 'frozen', ySplit: 1 }];

        const headers = Object.keys(rows[0]);
        const headerRow = ws.getRow(1);
        headerRow.height = 28;
        headers.forEach((h, i) => {
          ws.getColumn(i + 1).width = h.length + 4;
          const cell = headerRow.getCell(i + 1);
          cell.value = h;
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial', size: 10 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2A54' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });

        rows.forEach((row, ri) => {
          const r = ws.getRow(ri + 2);
          headers.forEach((h, ci) => {
            r.getCell(ci + 1).value = row[h as keyof typeof row];
            r.getCell(ci + 1).font = { name: 'Arial', size: 10 };
          });
        });

        const buffer = await wb.xlsx.writeBuffer();
        downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileName}.xlsx`);
      } else {
        const csv = rowsToCSV(rows);
        downloadBlob(new Blob([csv], { type: 'text/csv' }), `${fileName}.csv`);
      }
    } catch (e: any) {
      console.error('Export error:', e);
      alert('Export failed: ' + (e.message || 'Unknown error'));
    } finally {
      setExportingPlayers(null);
    }
  };

  // ── Export Ratings ─────────────────────────────────────────────────────────
  const handleExportRatings = async (format: 'xlsx' | 'csv') => {
    const params = getExportParams();
    if (!params) return;
    setExportingRatings(format);
    try {
      const { summaryRows, detailRows, fileNameBase } = await exportRatingsAction({
        ...params, ratingsFilter,
      });

      if (summaryRows.length === 0 && detailRows.length === 0) {
        alert('No ratings data found for the selected scope and filter.');
        return;
      }

      if (format === 'xlsx') {
        const ExcelJS = (await import('exceljs')).default;
        const wb = new ExcelJS.Workbook();
        wb.creator = 'Cricket IQ';

        const addSheet = (name: string, rows: Record<string, any>[]) => {
          if (rows.length === 0) return;
          const ws = wb.addWorksheet(name);
          ws.views = [{ state: 'frozen', ySplit: 1 }];
          const headers = Object.keys(rows[0]);
          const hr = ws.getRow(1);
          hr.height = 28;
          headers.forEach((h, i) => {
            ws.getColumn(i + 1).width = Math.max(h.length + 4, 14);
            const cell = hr.getCell(i + 1);
            cell.value = h;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial', size: 10 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B6E8C' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          });
          rows.forEach((row, ri) => {
            const r = ws.getRow(ri + 2);
            headers.forEach((h, ci) => {
              r.getCell(ci + 1).value = row[h as keyof typeof row];
              r.getCell(ci + 1).font = { name: 'Arial', size: 10 };
            });
          });
        };

        addSheet('Summary', summaryRows);
        addSheet('Detail', detailRows);

        const buffer = await wb.xlsx.writeBuffer();
        downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileNameBase}.xlsx`);
      } else {
        // Two CSV files
        if (summaryRows.length > 0) {
          downloadBlob(new Blob([rowsToCSV(summaryRows)], { type: 'text/csv' }), `${fileNameBase}_summary.csv`);
        }
        // Small delay between downloads
        await new Promise(r => setTimeout(r, 300));
        if (detailRows.length > 0) {
          downloadBlob(new Blob([rowsToCSV(detailRows)], { type: 'text/csv' }), `${fileNameBase}_detail.csv`);
        }
      }
    } catch (e: any) {
      console.error('Export error:', e);
      alert('Export failed: ' + (e.message || 'Unknown error'));
    } finally {
      setExportingRatings(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AuthProviderClientComponent
      requiredPermission={PERMISSIONS.PAGE_VIEW_EXPORT}
      FallbackComponent={
        <div className="max-w-2xl mx-auto mt-8">
          <Alert variant="destructive">
            <ShieldAlert className="h-5 w-5" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>You do not have permission to access the Data Export page.</AlertDescription>
          </Alert>
        </div>
      }
    >
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-headline font-bold text-primary flex items-center gap-2">
            <Download className="h-8 w-8" /> Data Export
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Export player and ratings data. Select your scope below before exporting.
          </p>
        </div>

        {loadingScope ? (
          <div className="flex items-center gap-2 py-10 justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-muted-foreground">Loading available data...</span>
          </div>
        ) : !scope ? (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>Could not load export scope. Please refresh and try again.</AlertDescription>
          </Alert>
        ) : (
          <>
            {/* ── Scope Selection ── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Layers className="h-5 w-5 text-primary" /> Export Scope
                </CardTitle>
                <CardDescription>
                  {scope.isSeriesAdmin && !scope.isOrgAdmin && !scope.isSuperAdmin
                    ? 'Select a series to export data for.'
                    : 'Optionally filter by organization and/or series, or export all data for the organization.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* Org selector — super admin and org admin with multiple orgs */}
                {(scope.isSuperAdmin || scope.orgs.length > 1) && (
                  <div className="space-y-1.5">
                    <Label htmlFor="org-select" className="flex items-center gap-1.5">
                      <Building className="h-4 w-4" /> Organization
                    </Label>
                    <Select value={selectedOrgId} onValueChange={v => { setSelectedOrgId(v); setSelectedSeriesId(''); }}>
                      <SelectTrigger id="org-select">
                        <SelectValue placeholder="All organizations" />
                      </SelectTrigger>
                      <SelectContent>
                        {canExportOrg && <SelectItem value="">All organizations</SelectItem>}
                        {scope.orgs.map(o => (
                          <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Series selector */}
                <div className="space-y-1.5">
                  <Label htmlFor="series-select" className="flex items-center gap-1.5">
                    <Layers className="h-4 w-4" />
                    Series
                    {!scope.isSeriesAdmin || scope.isOrgAdmin || scope.isSuperAdmin
                      ? ' (optional — leave blank to export all org data)'
                      : ' (required)'}
                  </Label>
                  <Select value={selectedSeriesId} onValueChange={setSelectedSeriesId}>
                    <SelectTrigger id="series-select">
                      <SelectValue placeholder={
                        scope.isSeriesAdmin && !scope.isOrgAdmin && !scope.isSuperAdmin
                          ? 'Select a series...'
                          : 'All series in organization'
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {(canExportOrg) && (
                        <SelectItem value="">All series in organization</SelectItem>
                      )}
                      {filteredSeries.map(s => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} {s.year} — {s.ageCategory}
                          {scope.isSuperAdmin && s.organizationName && ` (${s.organizationName})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Active scope badge */}
                {canExport && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-sm text-muted-foreground">Exporting:</span>
                    {selectedSeries ? (
                      <Badge className="bg-primary/10 text-primary border-primary/20">
                        {selectedSeries.name} {selectedSeries.year}
                      </Badge>
                    ) : selectedOrg ? (
                      <Badge className="bg-primary/10 text-primary border-primary/20">
                        All data — {selectedOrg.name}
                      </Badge>
                    ) : (
                      <Badge variant="outline">All organizations</Badge>
                    )}
                  </div>
                )}

                {!canExport && (
                  <Alert className="border-amber-200 bg-amber-50">
                    <Info className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-700 text-sm">
                      {scope.isSeriesAdmin && !scope.isOrgAdmin
                        ? 'Please select a series to enable export.'
                        : 'Please select an organization or series to enable export.'}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* ── Player Export ── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="h-5 w-5 text-primary" /> Player Data Export
                </CardTitle>
                <CardDescription>
                  Export player profiles including demographics, skills, and team assignments.
                  {selectedSeriesId
                    ? ' Players are from all teams participating in the selected series.'
                    : ' All players in the selected organization.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-muted-foreground mb-4 bg-muted/40 rounded-lg p-3">
                  <strong>Columns:</strong> PlayerName, FirstName, LastName, CricClubsID, DateOfBirth, Gender, PrimarySkill, DominantHandBatting, BattingOrder, DominantHandBowling, BowlingStyle, ClubName, PrimaryTeamName, GamesPlayed, SeriesName, OrganizationId
                </div>
                <div className="flex gap-3 flex-wrap">
                  <Button
                    onClick={() => handleExportPlayers('xlsx')}
                    disabled={!canExport || !!exportingPlayers}
                    className="bg-green-700 hover:bg-green-800 text-white gap-2"
                  >
                    {exportingPlayers === 'xlsx'
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Exporting...</>
                      : <><FileSpreadsheet className="h-4 w-4" /> Export as Excel</>}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleExportPlayers('csv')}
                    disabled={!canExport || !!exportingPlayers}
                    className="gap-2"
                  >
                    {exportingPlayers === 'csv'
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Exporting...</>
                      : <><FileText className="h-4 w-4" /> Export as CSV</>}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* ── Ratings Export ── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Star className="h-5 w-5 text-primary" /> Player Ratings Export
                </CardTitle>
                <CardDescription>
                  Export player ratings with averages and per-selector detail including comments.
                  Excel exports include two sheets (Summary + Detail). CSV exports produce two separate files.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* Ratings filter */}
                <div className="space-y-1.5">
                  <Label htmlFor="ratings-filter">Ratings Status Filter</Label>
                  <Select value={ratingsFilter} onValueChange={v => setRatingsFilter(v as RatingsFilter)}>
                    <SelectTrigger id="ratings-filter" className="w-64">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All ratings</SelectItem>
                      <SelectItem value="finalized">Finalized ratings only</SelectItem>
                      <SelectItem value="not_finalized">Not finalized only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3 space-y-1">
                  <p><strong>Summary sheet:</strong> PlayerName, SeriesName, GameDate, Team1, Team2, Venue, AvgBatting, AvgBowling, AvgFielding, AvgWicketKeeping, SelectorsRated, RatingsFinalized</p>
                  <p><strong>Detail sheet:</strong> PlayerName, SeriesName, GameDate, Team1, Team2, Venue, SelectorEmail, Batting, Bowling, Fielding, WicketKeeping, BattingComment, BowlingComment, FieldingComment, WicketKeepingComment</p>
                </div>

                <div className="flex gap-3 flex-wrap">
                  <Button
                    onClick={() => handleExportRatings('xlsx')}
                    disabled={!canExport || !!exportingRatings}
                    className="bg-green-700 hover:bg-green-800 text-white gap-2"
                  >
                    {exportingRatings === 'xlsx'
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Exporting...</>
                      : <><FileSpreadsheet className="h-4 w-4" /> Export as Excel</>}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleExportRatings('csv')}
                    disabled={!canExport || !!exportingRatings}
                    className="gap-2"
                  >
                    {exportingRatings === 'csv'
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Exporting...</>
                      : <><FileText className="h-4 w-4" /> Export as CSV (2 files)</>}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AuthProviderClientComponent>
  );
}
