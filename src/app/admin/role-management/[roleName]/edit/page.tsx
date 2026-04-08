
// src/app/admin/role-management/[roleName]/edit/page.tsx
import { RolePermissionForm } from '@/components/admin/role-permission-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldCheck, ArrowLeft, UserCog } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { UserRole, PermissionKey } from '@/types'; // Added PermissionKey
import { USER_ROLES } from '@/lib/constants';
import { PERMISSIONS } from '@/lib/permissions-master-list'; // Ensure PERMISSIONS is imported

interface EditRolePermissionsPageProps {
  params: Promise<{ roleName: UserRole | string }>; // roleName from URL
}

export default async function EditRolePermissionsPage({ params }: EditRolePermissionsPageProps) {
  const { roleName } = await params;
  const decodedRoleName = decodeURIComponent(roleName);

  // Validate if the roleName from URL is a known, manageable role
  const isValidRole = USER_ROLES.includes(decodedRoleName as UserRole) && decodedRoleName !== 'admin' && decodedRoleName !== 'unassigned';

  // Top-level AuthProviderClientComponent to protect the page itself, even if the role is invalid for FORM display.
  // The form itself will handle the valid role logic.
  return (
    <AuthProviderClientComponent
      requiredPermission={PERMISSIONS.PAGE_VIEW_ADMIN_ROLE_MANAGEMENT_EDIT} // Corrected prop
      FallbackComponent={
        <div className="max-w-2xl mx-auto">
          <Alert variant="destructive" className="mt-8">
            <ShieldCheck className="h-5 w-5" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              You do not have permission to edit role permissions (requires '{PERMISSIONS.PAGE_VIEW_ADMIN_ROLE_MANAGEMENT_EDIT}' permission).
            </AlertDescription>
          </Alert>
        </div>
      }
    >
      {isValidRole ? (
        <div className="max-w-3xl mx-auto">
          <div className="mb-4">
              <Button variant="outline" size="sm" asChild>
                  <Link href="/admin/role-management"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Roles List</Link>
              </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-headline text-primary flex items-center gap-2">
                  <UserCog className="h-6 w-6" /> Edit Permissions for '{decodedRoleName.charAt(0).toUpperCase() + decodedRoleName.slice(1)}' Role
              </CardTitle>
              <CardDescription>
                Toggle permissions for the '{decodedRoleName.charAt(0).toUpperCase() + decodedRoleName.slice(1)}' role. Changes will be saved for future use but are not yet enforced application-wide.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RolePermissionForm roleName={decodedRoleName as UserRole} />
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto">
          <Alert variant="destructive" className="mt-8">
            <ShieldCheck className="h-5 w-5" />
            <AlertTitle>Invalid Role</AlertTitle>
            <AlertDescription>
              The role "{decodedRoleName}" is not a valid or manageable role.
              <Link href="/admin/role-management" className="block mt-2">
                <Button variant="outline" size="sm"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Role Management</Button>
              </Link>
            </AlertDescription>
          </Alert>
        </div>
      )}
    </AuthProviderClientComponent>
  );
}
