'use client';

/**
 * FILE: src/components/scorecard-import-modal.tsx
 * Reusable modal for importing a match report from photo or Word doc.
 * On success, stores parsed report in sessionStorage and navigates to
 * the scorecard's Match Report tab with fields pre-filled.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  parseMatchReportImageAction,
  parseMatchReportDocxAction,
} from '@/lib/actions/match-report-import-action';
import type { MatchScorecard } from '@/types';
import { Upload, ImageIcon, FileText, Loader2, CheckCircle2, X } from 'lucide-react';

interface ScorecardImportModalProps {
  sc: MatchScorecard;
  open: boolean;
  onClose: () => void;
  rosterPlayerNames: string[]; // kept for backwards compat
  rosterByTeam?: Record<string, string[]>; // preferred: players keyed by team name
}

export function ScorecardImportModal({
  sc, open, onClose, rosterPlayerNames, rosterByTeam,
}: ScorecardImportModalProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isImporting, setIsImporting] = useState(false);
  const [done, setDone] = useState(false);

  // Derive per-team rosters
  const rosterA = rosterByTeam?.[sc.team1] || rosterPlayerNames.slice(0, Math.ceil(rosterPlayerNames.length / 2));
  const rosterB = rosterByTeam?.[sc.team2] || rosterPlayerNames.slice(Math.ceil(rosterPlayerNames.length / 2));

  const handleSuccess = (parsed: any) => {
    // Store in sessionStorage keyed by scorecardId
    sessionStorage.setItem(
      `import_report_${sc.id}`,
      JSON.stringify(parsed)
    );
    setDone(true);
    toast({
      title: 'Report scanned ✓',
      description: 'Opening scorecard — fields will be pre-filled.',
    });
    setTimeout(() => {
      onClose();
      router.push(`/scorecards/${sc.id}?tab=match-report&import=1`);
    }, 1200);
  };

  const handleImage = async (file: File) => {
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async ev => {
      const base64 = (ev.target?.result as string).split(',')[1];
      const res = await parseMatchReportImageAction(
        base64, file.type as any, sc.team1, sc.team2, rosterA, rosterB
      );
      if (res.success && res.parsed) handleSuccess(res.parsed);
      else toast({ title: 'Import failed', description: res.error, variant: 'destructive' });
      setIsImporting(false);
    };
    reader.readAsDataURL(file);
  };

  const handleDocx = async (file: File) => {
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        // Load mammoth via CDN (not installed as npm package)
        let mammoth: any = (window as any).mammoth;
        if (!mammoth) {
          await new Promise<void>((res, rej) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
            s.onload = () => res(); s.onerror = rej;
            document.head.appendChild(s);
          });
          mammoth = (window as any).mammoth;
        }
        const result = await mammoth.extractRawText({ arrayBuffer: ev.target?.result as ArrayBuffer });
        const res = await parseMatchReportDocxAction(result.value, sc.team1, sc.team2, rosterA, rosterB);
        if (res.success && res.parsed) handleSuccess(res.parsed);
        else toast({ title: 'Import failed', description: res.error, variant: 'destructive' });
      } catch (err: any) {
        toast({ title: 'Could not read docx', description: err.message, variant: 'destructive' });
      }
      setIsImporting(false);
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" /> Import Match Report
          </DialogTitle>
          <DialogDescription>
            {sc.team1} vs {sc.team2}
            {sc.date ? ` · ${sc.date}` : ''}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <CheckCircle2 className="h-12 w-12 text-green-600" />
            <p className="text-sm font-medium text-green-700">Report scanned — opening scorecard...</p>
          </div>
        ) : isImporting ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Scanning report — please wait...</p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Upload a handwritten or typed match report. Fields will be auto-filled — you can review and edit before submitting.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col items-center justify-center gap-2 p-5 border-2 border-dashed border-primary/30 rounded-lg cursor-pointer hover:bg-primary/5 hover:border-primary/60 transition-colors text-center">
                <ImageIcon className="h-8 w-8 text-primary" />
                <span className="text-sm font-medium">Photo / Scan</span>
                <span className="text-xs text-muted-foreground">JPG, PNG, WebP</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleImage(f); e.target.value = ''; }} />
              </label>
              <label className="flex flex-col items-center justify-center gap-2 p-5 border-2 border-dashed border-primary/30 rounded-lg cursor-pointer hover:bg-primary/5 hover:border-primary/60 transition-colors text-center">
                <FileText className="h-8 w-8 text-primary" />
                <span className="text-sm font-medium">Word Document</span>
                <span className="text-xs text-muted-foreground">.docx</span>
                <input type="file" accept=".docx" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleDocx(f); e.target.value = ''; }} />
              </label>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Works with handwritten scans and Word doc templates
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
