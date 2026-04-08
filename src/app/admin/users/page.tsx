'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import type { UserProfile as UserProfileType, UserRole, Organization } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserRoleCell } from '@/components/admin/user-role-cell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { getAllUsersFromDB, getUsersForOrgAdminViewFromDB, getAllOrganizationsFromDB } from '@/lib/db';
import { Loader2, AlertCircle, ShieldAlert, Info, Filter, Search, Building } from 'lucide-react';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { USER_ROLES } from '@/lib/constants';

export default function AdminUserManagementPage() {
  const { currentUser, userProfile, isAuthLoading, effectivePermissions, activeOrganizationId } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<UserProfileType[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Filters
  const [nameFilter, setNameFilter] = useState('');
  const [emailFilter, setEmailFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [orgFilter, setOrgFilter] = useState<string>('all'); // super admin only

  const isSuperAdmin = userProfile?.roles.includes('admin') ?? false;

  const handleRolesUpdated = () => setRefreshKey(prev => prev + 1);

  useEffect(() => {
    if (isAuthLoading) { setLoadingUsers(true); return; }
    if (!currentUser) { router.push('/login?redirect=/admin/users'); return; }

    const fetchData = async () => {
      setLoadingUsers(true);
      setFetchError(null);
      setUsers([]);

      try {
        const canViewOrgList = effectivePermissions[PERMISSIONS.USERS_VIEW_LIST_ASSIGNED_ORG];

        if (isSuperAdmin) {
          // Fetch all users and all orgs in parallel
          const [fetchedUsers, fetchedOrgs] = await Promise.all([
            getAllUsersFromDB(),
            getAllOrganizationsFromDB(),
          ]);
          setUsers(fetchedUsers);
          setOrganizations(fetchedOrgs);
        } else if (canViewOrgList) {
          if (activeOrganizationId) {
            const fetchedUsers = await getUsersForOrgAdminViewFromDB(activeOrganizationId);
            setUsers(fetchedUsers);
          }
        } else {
          setFetchError('You do not have permission to view any user list.');
        }
      } catch (err: any) {
        console.error('Failed to fetch users:', err);
        setFetchError(err.message || 'An error occurred while fetching users.');
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchData();
  }, [currentUser, isAuthLoading, effectivePermissions, activeOrganizationId, router, isSuperAdmin, refreshKey]);

  // Build org name lookup for super admin
  const orgNameById = useMemo(() => {
    const map: Record<string, string> = {};
    organizations.forEach(o => { map[o.id] = o.name; });
    return map;
  }, [organizations]);

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const nameMatch = !nameFilter || user.displayName?.toLowerCase().includes(nameFilter.toLowerCase());
      const emailMatch = !emailFilter || user.email?.toLowerCase().includes(emailFilter.toLowerCase());
      const roleMatch = roleFilter === 'all' || user.roles.includes(roleFilter as UserRole);
      const orgMatch = !isSuperAdmin || orgFilter === 'all' ||
        (user.assignedOrganizationIds || []).includes(orgFilter);
      return nameMatch && emailMatch && roleMatch && orgMatch;
    });
  }, [users, nameFilter, emailFilter, roleFilter, orgFilter, isSuperAdmin]);

  const getInitials = (name?: string | null, email?: string | null) => {
    if (name) return name.split(' ').map(n => n[0]).join('').toUpperCase();
    if (email) return email.substring(0, 2).toUpperCase();
    return 'U';
  };

  const renderContent = () => {
    if (isAuthLoading || loadingUsers) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-20rem)]">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg text-muted-foreground">Loading User Data...</p>
        </div>
      );
    }

    if (fetchError) {
      return (
        <Alert variant="destructive" className="mt-8">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle>Error Loading Users</AlertTitle>
          <AlertDescription>{fetchError}</AlertDescription>
        </Alert>
      );
    }

    if (effectivePermissions[PERMISSIONS.USERS_VIEW_LIST_ASSIGNED_ORG] && !activeOrganizationId && !isSuperAdmin) {
      return (
        <Alert variant="default" className="mt-8 border-primary/50">
          <Info className="h-5 w-5 text-primary" />
          <AlertTitle>Select an Organization</AlertTitle>
          <AlertDescription>
            Please select an organization from the dropdown in the navigation bar to view its users.
          </AlertDescription>
        </Alert>
      );
    }

    const canManageRoles = effectivePermissions[PERMISSIONS.USERS_MANAGE_ROLES_ANY] || effectivePermissions[PERMISSIONS.USERS_MANAGE_ROLES_ASSIGNED_ORG];

    return (
      <>
        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2 text-foreground">
              <Filter className="h-5 w-5" /> Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`grid gap-4 ${isSuperAdmin ? 'grid-cols-1 md:grid-cols-4' : 'grid-cols-1 md:grid-cols-3'}`}>

              {/* Org filter — super admin only */}
              {isSuperAdmin && (
                <div>
                  <label htmlFor="org-filter" className="block text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <Building className="h-3.5 w-3.5" /> Filter by Organization
                  </label>
                  <Select value={orgFilter} onValueChange={setOrgFilter}>
                    <SelectTrigger id="org-filter">
                      <SelectValue placeholder="All Organizations" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Organizations</SelectItem>
                      {organizations.map(org => (
                        <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Name filter */}
              <div className="relative">
                <label htmlFor="name-filter" className="block text-sm font-medium text-muted-foreground mb-1">Filter by Name</label>
                <Search className="absolute left-3 top-[calc(50%_+_6px)] -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input id="name-filter" placeholder="Filter by name..." value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)} className="pl-10" />
              </div>

              {/* Email filter */}
              <div className="relative">
                <label htmlFor="email-filter" className="block text-sm font-medium text-muted-foreground mb-1">Filter by Email</label>
                <Search className="absolute left-3 top-[calc(50%_+_6px)] -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input id="email-filter" placeholder="Filter by email..." value={emailFilter}
                  onChange={(e) => setEmailFilter(e.target.value)} className="pl-10" />
              </div>

              {/* Role filter */}
              <div>
                <label htmlFor="role-filter" className="block text-sm font-medium text-muted-foreground mb-1">Filter by Role</label>
                <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as UserRole | 'all')}>
                  <SelectTrigger id="role-filter">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    {USER_ROLES.map(role => (
                      <SelectItem key={role} value={role} className="capitalize">{role}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* User table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-headline text-primary">User Management</CardTitle>
            <CardDescription>
              {isSuperAdmin
                ? `Showing ${filteredUsers.length} of ${users.length} users across all organizations.`
                : 'View and manage user roles in the system. Your view is based on your permissions.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {users.length === 0 ? (
              <p className="text-muted-foreground">No users found for the selected scope.</p>
            ) : filteredUsers.length === 0 ? (
              <p className="text-muted-foreground">No users match the current filter criteria.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">Avatar</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      {isSuperAdmin && <TableHead>Organization(s)</TableHead>}
                      <TableHead>Roles</TableHead>
                      <TableHead>Last Login</TableHead>
                      <TableHead className="min-w-[280px]">Change Roles</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow key={user.uid}>
                        <TableCell>
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={undefined} alt={user.displayName || user.email || 'User'} />
                            <AvatarFallback>{getInitials(user.displayName, user.email)}</AvatarFallback>
                          </Avatar>
                        </TableCell>
                        <TableCell className="font-medium">{user.displayName || 'N/A'}</TableCell>
                        <TableCell>{user.email || 'N/A'}</TableCell>
                        <TableCell>{user.phoneNumber || 'N/A'}</TableCell>
                        {isSuperAdmin && (
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {(user.assignedOrganizationIds || []).length > 0
                                ? (user.assignedOrganizationIds || []).map(orgId => (
                                    <Badge key={orgId} variant="outline" className="text-xs">
                                      {orgNameById[orgId] || orgId}
                                    </Badge>
                                  ))
                                : <span className="text-xs text-muted-foreground">None</span>}
                            </div>
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(user.roles || ['unassigned']).map(role => (
                              <Badge key={role} variant={role === 'admin' ? 'default' : 'secondary'} className="capitalize">
                                {role}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          {user.lastLogin
                            ? formatDistanceToNow(parseISO(user.lastLogin), { addSuffix: true })
                            : 'Never'}
                        </TableCell>
                        <TableCell>
                          {canManageRoles ? (
                            <UserRoleCell
                              user={user}
                              isCallingUserSuperAdmin={isSuperAdmin}
                              onRolesUpdated={handleRolesUpdated}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">Role changes not permitted.</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </>
    );
  };

  return (
    <AuthProviderClientComponent
      requiredPermission={PERMISSIONS.PAGE_VIEW_ADMIN_USERS_LIST}
      FallbackComponent={
        <div className="max-w-2xl mx-auto">
          <Alert variant="destructive" className="mt-8">
            <ShieldAlert className="h-5 w-5" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              You do not have permission to view the user management page (requires '{PERMISSIONS.PAGE_VIEW_ADMIN_USERS_LIST}' permission).
            </AlertDescription>
          </Alert>
        </div>
      }
    >
      <div className="space-y-6">
        {renderContent()}
      </div>
    </AuthProviderClientComponent>
  );
}
