'use client';

import { ScorecardImportForm } from '@/components/scorecards/scorecard-import-form';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert } from 'lucide-react';

export default function ImportScorecardPage() {
  return (
    <AuthProviderClientComponent
      requiredPermission={PERMISSIONS.SCORECARDS_IMPORT}
      FallbackComponent={
        <div className="max-w-2xl mx-auto mt-8">
          <Alert variant="destructive">
            <ShieldAlert className="h-5 w-5" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>You do not have permission to import scorecards.</AlertDescription>
          </Alert>
        </div>
      }
    >
      <ScorecardImportForm />
    </AuthProviderClientComponent>
  );
}
