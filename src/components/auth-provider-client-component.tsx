
// src/components/auth-provider-client-component.tsx
'use client';

import { useAuth } from '@/contexts/auth-context';
import type { PermissionKey } from '@/types';
import { Loader2, LogOut, Hourglass, Shield } from 'lucide-react';
import { ReactNode, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PERMISSIONS } from '@/lib/permissions-master-list'; 

interface AuthProviderClientComponentProps {
  children: ReactNode;
  requiredPermission: PermissionKey;
  FallbackComponent?: ReactNode;
}

export function AuthProviderClientComponent({
  children,
  requiredPermission,
  FallbackComponent,
}: AuthProviderClientComponentProps) {
  const { currentUser, userProfile, isAuthLoading, logout, effectivePermissions, isLoggingOut } = useAuth();

  if (isLoggingOut) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Logging out & redirecting...</p>
      </div>
    );
  }

  // Use single, reliable loading state
  if (isAuthLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Authenticating & loading data...</p>
      </div>
    );
  }

  if (!currentUser) {
    // This state should ideally not be hit if redirects are working, but as a fallback
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Session ended. Redirecting to login...</p>
      </div>
    );
  }
  
  if (!userProfile) {
     return (
      <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading user profile...</p>
      </div>
    );
  }

  const isEffectivelyUnassigned = userProfile.roles.length === 1 && userProfile.roles[0] === 'unassigned';
  if (isEffectivelyUnassigned && requiredPermission !== PERMISSIONS.PAGE_VIEW_DASHBOARD) {
     return (
      <div className="max-w-md mx-auto mt-10 text-center p-6 border rounded-lg shadow-md">
        <Hourglass className="h-12 w-12 text-primary mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-primary mb-2">Account Pending Role Assignment</h2>
        <p className="text-muted-foreground mb-4 text-sm">
          Your account is awaiting role assignment by an administrator. You will be able to access this page once a role is assigned.
        </p>
        <Button variant="outline" onClick={logout}>
          <LogOut className="mr-2 h-4 w-4" /> Logout
        </Button>
      </div>
    );
  }

  if (!effectivePermissions || !effectivePermissions[requiredPermission]) {
    return FallbackComponent || (
        <div className="max-w-2xl mx-auto text-center py-10">
            <Alert variant="destructive">
                <Shield className="h-5 w-5" />
                <AlertTitle>Access Denied</AlertTitle>
                <AlertDescription>
                You do not have the required permission ('{requiredPermission}') to view this page.
                </AlertDescription>
            </Alert>
        </div>
    );
  }
  
  return <>{children}</>;
}
