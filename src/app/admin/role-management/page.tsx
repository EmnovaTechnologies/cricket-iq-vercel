// src/app/admin/role-management/page.tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { ShieldCheck, ListChecks, UserCog, Edit } from 'lucide-react';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import type { UserRole, PermissionKey } from '@/types'; // Added PermissionKey
import { USER_ROLES } from '@/lib/constants'; // Import user roles
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PERMISSIONS } from '@/lib/permissions-master-list'; // Ensure PERMISSIONS is imported


// Filter out special roles that shouldn't be managed from the UI
const manageableRoles: UserRole[] = USER_ROLES.filter(role => role !== 'unassigned' && role !== 'admin');

export default function RoleManagementPage() {
  return (
    <AuthProviderClientComponent
      requiredPermission={PERMISSIONS.PAGE_VIEW_ADMIN_ROLE_MANAGEMENT_LIST} // Corrected prop
      FallbackComponent={
        <div className="max-w-2xl mx-auto">
          <Alert variant="destructive" className="mt-8">
            <ShieldCheck className="h-5 w-5" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              You do not have permission to manage role permissions (requires '{PERMISSIONS.PAGE_VIEW_ADMIN_ROLE_MANAGEMENT_LIST}' permission). This action is restricted to super administrators.
            </AlertDescription>
          </Alert>
        </div>
      }
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-headline text-primary flex items-center gap-2">
              <UserCog className="h-6 w-6" /> Role Permission Management
            </CardTitle>
            <CardDescription>
              View and configure permissions for different user roles within the application.
              Changes made here will define what users in each role can access and do.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {manageableRoles.length === 0 ? (
              <p className="text-muted-foreground">No manageable roles defined in the system yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {manageableRoles.map((role) => (
                  <Card key={role} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <ListChecks className="h-5 w-5 text-accent" />
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4">
                      <CardDescription className="text-xs">
                        Configure page access, feature visibility, and action permissions for the '{role}' role.
                      </CardDescription>
                    </CardContent>
                    <CardFooter>
                      <Button asChild variant="outline" size="sm" className="w-full">
                        <Link href={`/admin/role-management/${role}/edit`}>
                           <Edit className="mr-2 h-4 w-4" /> Edit Permissions
                        </Link>
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
         <Alert variant="default" className="mt-6">
            <ShieldCheck className="h-5 w-5" />
            <AlertTitle>Note on Permission Enforcement</AlertTitle>
            <AlertDescription>
              Currently, this interface is for configuring permissions. The application's actual enforcement of these configured permissions
              (beyond existing role checks) is not yet implemented. This UI sets up the definitions for future integration.
            </AlertDescription>
          </Alert>
      </div>
    </AuthProviderClientComponent>
  );
}
