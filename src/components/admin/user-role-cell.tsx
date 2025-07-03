
'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import type { UserProfile, UserRole, Organization } from '@/types';
import { USER_ROLES } from '@/lib/constants';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-context';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { db } from '@/lib/firebase';
import { doc, writeBatch, getDocs, collection, query, where, arrayRemove } from 'firebase/firestore';


interface UserRoleCellProps {
  user: UserProfile;
  isCallingUserSuperAdmin: boolean;
  onRolesUpdated: () => void;
}

export function UserRoleCell({ user, isCallingUserSuperAdmin, onRolesUpdated }: UserRoleCellProps) {
  const [selectedRoles, setSelectedRoles] = useState<UserRole[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { effectivePermissions } = useAuth();
  
  useEffect(() => {
    setSelectedRoles(user.roles || ['unassigned']);
  }, [user]);

  const handleRoleChange = (role: UserRole, checked: boolean) => {
    setSelectedRoles(prev => {
      let newRoles = [...prev];
      if (checked) {
        if (!newRoles.includes(role)) { newRoles.push(role); }
      } else {
        if (role !== 'player') { newRoles = newRoles.filter(r => r !== role); }
      }
      
      if (newRoles.length > 1 && newRoles.includes('unassigned')) {
        newRoles = newRoles.filter(r => r !== 'unassigned');
      }

      if (newRoles.length === 0) {
        newRoles = ['unassigned'];
      }
      return newRoles;
    });
  };

  const handleSaveRoles = async () => {
    setIsLoading(true);

    const canManageAny = effectivePermissions[PERMISSIONS.USERS_MANAGE_ROLES_ANY];

    if (user.roles.includes('admin') && !canManageAny) {
      toast({ title: 'Permission Denied', description: 'You cannot change the roles of a super admin.', variant: 'destructive' });
      setIsLoading(false);
      return;
    }

    if (selectedRoles.includes('admin') && !canManageAny) {
      toast({ title: 'Permission Denied', description: "You do not have permission to grant the 'admin' role.", variant: 'destructive' });
      setIsLoading(false);
      return;
    }
    
    const wasOrgAdmin = user.roles.includes('Organization Admin');
    const isRemovingOrgAdminRole = wasOrgAdmin && !selectedRoles.includes('Organization Admin');

    try {
      const batch = writeBatch(db);
      const targetUserDocRef = doc(db, 'users', user.uid);
      batch.update(targetUserDocRef, { roles: selectedRoles });

      if (isRemovingOrgAdminRole) {
        const orgsQuery = query(
          collection(db, 'organizations'),
          where('organizationAdminUids', 'array-contains', user.uid)
        );
        const orgsSnapshot = await getDocs(orgsQuery);
        const orgsAsAdmin = orgsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Organization));
        
        for (const org of orgsAsAdmin) {
          if (org.organizationAdminUids.length === 1) {
            toast({
              title: 'Update Blocked',
              description: `Cannot remove role: User is the last 'Organization Admin' for "${org.name}". Please assign another admin to that organization first.`,
              variant: 'destructive',
              duration: 7000,
            });
            setIsLoading(false);
            return;
          }
           const orgRef = doc(db, 'organizations', org.id);
           batch.update(orgRef, { organizationAdminUids: arrayRemove(user.uid) });
        }
      }

      await batch.commit();

      toast({
        title: 'Roles Updated',
        description: `Roles for ${user.displayName || user.email} updated successfully.`,
      });
      onRolesUpdated();

    } catch (e: any) {
       toast({
        title: 'Update Failed',
        description: e.message || 'An unexpected error occurred. Check Firestore permissions.',
        variant: 'destructive',
      });
    } finally {
       setIsLoading(false);
    }
  };


  const isUserBeingEditedSuperAdmin = user.roles.includes('admin');
  
  const initialRolesSet = new Set(user.roles || ['unassigned']);
  const selectedRolesSet = new Set(selectedRoles);
  const rolesAreUnchanged = initialRolesSet.size === selectedRolesSet.size && [...initialRolesSet].every(role => selectedRolesSet.has(role));

  return (
    <Card className="border-0 shadow-none">
      <CardContent className="p-0 space-y-2">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {USER_ROLES.map((role) => {
            const isDisabled = isLoading ||
                               (isUserBeingEditedSuperAdmin && role === 'admin') ||
                               (role === 'admin' && !isCallingUserSuperAdmin) ||
                               (role === 'player');

            return (
              <div key={role} className="flex items-center space-x-2">
                <Checkbox
                  id={`${user.uid}-${role}`}
                  checked={selectedRoles.includes(role)}
                  onCheckedChange={(checked) => handleRoleChange(role, !!checked)}
                  disabled={isDisabled}
                  aria-label={`Assign ${role} role`}
                />
                <Label
                  htmlFor={`${user.uid}-${role}`}
                  className={`text-sm font-medium leading-none ${isDisabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                >
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </Label>
              </div>
            );
          })}
        </div>
      </CardContent>
      <CardFooter className="p-0 pt-3">
        <Button
          onClick={handleSaveRoles}
          disabled={isLoading || rolesAreUnchanged}
          size="sm"
          variant="outline"
          className="w-full"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Roles'}
        </Button>
      </CardFooter>
      {isUserBeingEditedSuperAdmin && <p className="text-xs text-muted-foreground mt-1">Super admin role cannot be removed.</p>}
      <p className="text-xs text-muted-foreground mt-1">Player role is managed via registration.</p>
    </Card>
  );
}
