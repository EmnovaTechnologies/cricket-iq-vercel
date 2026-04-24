'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import type { UserProfile as UserProfileType, UserRole, Organization } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { UserRoleCell } from '@/components/admin/user-role-cell';
import { UserOrgCell } from '@/components/admin/user-org-cell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { formatDistanceToNow, parseISO, format } from 'date-fns';
import { getAllUsersFromDB, getUsersForOrgAdminViewFromDB, getAllOrganizationsFromDB } from '@/lib/db';
import { updateUserClubAction } from '@/lib/actions/user-actions';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Loader2, AlertCircle, ShieldAlert, Info, Filter, Search, Building, X, User, Phone, Calendar, Clock } from 'lucide-react';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { USER_ROLES } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const NO_CLUB = '__none__';

function getInitials(name?: string | null, email?: string | null) {
  if (name) return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  if (email) return email.substring(0, 2).toUpperCase();
  return 'U';
}

function AvatarColor(uid: string) {
  const colors = [
    'bg-blue-100 text-blue-700',
    'bg-amber-100 text-amber-700',
    'bg-green-100 text-green-700',
    'bg-purple-100 text-purple-700',
    'bg-rose-100 text-rose-700',
    'bg-teal-100 text-teal-700',
  ];
  const idx = uid.charCodeAt(0) % colors.length;
  return colors[idx];
}

// ── User Drawer ─────────────────────────────────────────────────────────────
interface UserDrawerProps {
  user: UserProfileType;
  allOrgs: Organization[];
  orgClubs: string[];
  isSuperAdmin: boolean;
  onUpdated: () => void;
  onClose: () => void;
}

function UserDrawer({ user, allOrgs, orgClubs, isSuperAdmin, onUpdated, onClose }: UserDrawerProps) {
  const { toast } = useToast();
  const [clubValue, setClubValue] = useState(user.clubName || NO_CLUB);
  const [isSavingClub, setIsSavingClub] = useState(false);

  // Reset club when user changes
  useEffect(() => {
    setClubValue(user.clubName || NO_CLUB);
  }, [user.uid, user.clubName]);

  const handleSaveClub = async () => {
    setIsSavingClub(true);
    const newClub = clubValue === NO_CLUB ? null : clubValue;
    const res = await updateUserClubAction(user.uid, newClub);
    if (res.success) {
      toast({ title: 'Club updated', description: newClub ? `Club set to ${newClub}.` : 'Club association removed.' });
      onUpdated();
    } else {
      toast({ title: 'Update failed', description: res.error, variant: 'destructive' });
    }
    setIsSavingClub(false);
  };

  const clubChanged = clubValue !== (user.clubName || NO_CLUB);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b bg-muted/40 shrink-0">
        <div className="flex items-center gap-3">
          <Avatar className="h-11 w-11">
            <AvatarFallback className={cn('text-sm font-medium', AvatarColor(user.uid))}>
              {getInitials(user.displayName, user.email)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold text-base leading-tight">{user.displayName || 'No name'}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 shrink-0">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto divide-y">

        {/* Account info */}
        <div className="p-4 space-y-2.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Account info</p>
          <div className="flex items-center gap-2.5 text-sm">
            <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Phone</span>
            <span className="ml-auto font-medium">{user.phoneNumber || '—'}</span>
          </div>
          <div className="flex items-center gap-2.5 text-sm">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Joined</span>
            <span className="ml-auto font-medium">
              {user.createdAt ? format(parseISO(user.createdAt), 'PPP') : '—'}
            </span>
          </div>
          <div className="flex items-center gap-2.5 text-sm">
            <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Last login</span>
            <span className="ml-auto font-medium">
              {user.lastLogin ? formatDistanceToNow(parseISO(user.lastLogin), { addSuffix: true }) : 'Never'}
            </span>
          </div>
          <div className="flex items-center gap-2.5 text-sm">
            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">UID</span>
            <span className="ml-auto font-mono text-xs text-muted-foreground truncate max-w-[140px]">{user.uid}</span>
          </div>
        </div>

        {/* Club */}
        <div className="p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Club</p>
          {orgClubs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No clubs configured for this organization.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Select value={clubValue} onValueChange={setClubValue} disabled={isSavingClub}>
                  <SelectTrigger className="flex-1 h-8 text-sm">
                    <SelectValue placeholder="No club" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CLUB}>No club</SelectItem>
                    {orgClubs.map(club => (
                      <SelectItem key={club} value={club}>{club}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSaveClub}
                  disabled={!clubChanged || isSavingClub}
                  className="h-8 shrink-0"
                >
                  {isSavingClub ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Organization — super admin only */}
        {isSuperAdmin && (
          <div className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Organization</p>
            <UserOrgCell
              userId={user.uid}
              assignedOrgIds={user.assignedOrganizationIds || []}
              allOrgs={allOrgs}
              onUpdated={onUpdated}
            />
          </div>
        )}

        {/* Roles */}
        <div className="p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Roles</p>
          <UserRoleCell
            user={user}
            isCallingUserSuperAdmin={isSuperAdmin}
            onRolesUpdated={onUpdated}
          />
        </div>

      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function AdminUsersV2Page() {
  const { currentUser, userProfile, isAuthLoading, effectivePermissions, activeOrganizationId } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [users, setUsers] = useState<UserProfileType[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Track selected user by UID so drawer stays open across refreshes
  const [selectedUserUid, setSelectedUserUid] = useState<string | null>(null);

  // Filters
  const [nameFilter, setNameFilter] = useState('');
  const [phoneFilter, setPhoneFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [orgFilter, setOrgFilter] = useState<string>('all');
  const [clubFilter, setClubFilter] = useState<string>('all');
  const [clubFilterOpen, setClubFilterOpen] = useState(false);

  const isSuperAdmin = userProfile?.roles.includes('admin') ?? false;

  const handleUpdated = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  useEffect(() => {
    if (isAuthLoading) { setLoadingUsers(true); return; }
    if (!currentUser) { router.push('/login?redirect=/admin/users-v2'); return; }

    const fetchData = async () => {
      setLoadingUsers(true);
      setFetchError(null);
      setUsers([]);
      setSelectedUserUid(null);

      try {
        if (isSuperAdmin) {
          const [fetchedUsers, fetchedOrgs] = await Promise.all([
            getAllUsersFromDB(),
            getAllOrganizationsFromDB(),
          ]);
          setUsers(fetchedUsers);
          setOrganizations(fetchedOrgs);
        } else if (effectivePermissions[PERMISSIONS.USERS_VIEW_LIST_ASSIGNED_ORG]) {
          if (activeOrganizationId) {
            const [fetchedUsers, fetchedOrgs] = await Promise.all([
              getUsersForOrgAdminViewFromDB(activeOrganizationId),
              getAllOrganizationsFromDB(), // fetch all so we get clubs array for active org
            ]);
            setUsers(fetchedUsers);
            setOrganizations(fetchedOrgs);
          }
        } else {
          setFetchError('You do not have permission to view any user list.');
        }
      } catch (err: any) {
        setFetchError(err.message || 'An error occurred while fetching users.');
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchData();
  }, [currentUser, isAuthLoading, effectivePermissions, activeOrganizationId, router, isSuperAdmin, refreshKey]);

  // selectedUser is always derived from users array — drawer auto-updates after refresh
  const selectedUser = useMemo(
    () => users.find(u => u.uid === selectedUserUid) || null,
    [users, selectedUserUid]
  );

  // All clubs from org documents (not from user data) — used for filter dropdown
  const allOrgClubs = useMemo(() => {
    const clubs = new Set<string>();
    organizations.forEach(org => {
      ((org as any).clubs || []).forEach((c: string) => clubs.add(c));
    });
    return [...clubs].sort();
  }, [organizations]);

  // Clubs available for the filter dropdown — scoped to orgFilter if set (super admin) or activeOrg (org admin)
  const clubsForFilter = useMemo(() => {
    if (isSuperAdmin) {
      if (orgFilter !== 'all') {
        const org = organizations.find(o => o.id === orgFilter);
        return ((org as any)?.clubs || []).sort();
      }
      return allOrgClubs;
    }
    // Org admin — scope to their active org only
    const org = organizations.find(o => o.id === activeOrganizationId);
    return ((org as any)?.clubs || []).sort();
  }, [organizations, orgFilter, isSuperAdmin, allOrgClubs, activeOrganizationId]);

  // Clubs for the drawer — based on the selected user's assigned org, scoped to active org for org admins
  const drawerClubs = useMemo(() => {
    if (!selectedUser) return [];
    if (!isSuperAdmin) {
      // Org admin — only show clubs from their active org
      const org = organizations.find(o => o.id === activeOrganizationId);
      return ((org as any)?.clubs || []).sort();
    }
    const userOrgId = (selectedUser.assignedOrganizationIds || [])[0];
    if (!userOrgId) return allOrgClubs;
    const org = organizations.find(o => o.id === userOrgId);
    return ((org as any)?.clubs || []).sort();
  }, [selectedUser, organizations, activeOrganizationId, isSuperAdmin, allOrgClubs]);

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      if (user.roles.includes('admin')) return false; // never show super admins
      const q = nameFilter.toLowerCase();
      const nameMatch = !q ||
        user.displayName?.toLowerCase().includes(q) ||
        user.email?.toLowerCase().includes(q);
      const pq = phoneFilter.toLowerCase();
      const phoneMatch = !pq || (user.phoneNumber || '').toLowerCase().includes(pq);
      const roleMatch = roleFilter === 'all' || user.roles.includes(roleFilter as UserRole);
      const orgMatch = !isSuperAdmin || orgFilter === 'all' ||
        (user.assignedOrganizationIds || []).includes(orgFilter);
      const clubMatch = clubFilter === 'all' || user.clubName === clubFilter;
      return nameMatch && phoneMatch && roleMatch && orgMatch && clubMatch;
    });
  }, [users, nameFilter, phoneFilter, roleFilter, orgFilter, clubFilter, isSuperAdmin]);


  const renderContent = () => {
    if (isAuthLoading || loadingUsers) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-20rem)]">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg text-muted-foreground">Loading users...</p>
        </div>
      );
    }

    if (fetchError) {
      return (
        <Alert variant="destructive" className="mt-8">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{fetchError}</AlertDescription>
        </Alert>
      );
    }

    if (effectivePermissions[PERMISSIONS.USERS_VIEW_LIST_ASSIGNED_ORG] && !activeOrganizationId && !isSuperAdmin) {
      return (
        <Alert variant="default" className="mt-8 border-primary/50">
          <Info className="h-5 w-5 text-primary" />
          <AlertTitle>Select an Organization</AlertTitle>
          <AlertDescription>Please select an organization from the navigation bar to view its users.</AlertDescription>
        </Alert>
      );
    }

    return (
      <div className="flex gap-4 items-start">
        {/* Table side */}
        <div className={cn('flex flex-col gap-4 transition-all duration-200', selectedUser ? 'flex-1 min-w-0' : 'w-full')}>

          {/* Filters */}
          <Card>
            <CardHeader className="pb-3 pt-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="h-4 w-4" /> Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn('grid gap-4', isSuperAdmin ? 'grid-cols-1 md:grid-cols-5' : 'grid-cols-1 md:grid-cols-4')}>

                {/* 1. Organization — super admin only */}
                {isSuperAdmin && (
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                      <Building className="h-3 w-3" /> Organization
                    </Label>
                    <Select value={orgFilter} onValueChange={v => { setOrgFilter(v); setClubFilter('all'); }}>
                      <SelectTrigger><SelectValue placeholder="All organizations" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All organizations</SelectItem>
                        {organizations.map(org => (
                          <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* 2. Club — searchable combobox */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5">Club</Label>
                  <Popover open={clubFilterOpen} onOpenChange={setClubFilterOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={clubFilterOpen}
                        className="w-full justify-between h-10 font-normal"
                      >
                        <span className="truncate">
                          {clubFilter === 'all' ? 'All clubs' : clubFilter}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[200px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search clubs..." />
                        <CommandList>
                          <CommandEmpty>No club found.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem value="all" onSelect={() => { setClubFilter('all'); setClubFilterOpen(false); }}>
                              <Check className={cn('mr-2 h-4 w-4', clubFilter === 'all' ? 'opacity-100' : 'opacity-0')} />
                              All clubs
                            </CommandItem>
                            {clubsForFilter.map((club: string) => (
                              <CommandItem key={club} value={club} onSelect={() => { setClubFilter(club); setClubFilterOpen(false); }}>
                                <Check className={cn('mr-2 h-4 w-4', clubFilter === club ? 'opacity-100' : 'opacity-0')} />
                                {club}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* 3. Name / email */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5">Name / email</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search..."
                      value={nameFilter}
                      onChange={e => setNameFilter(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                {/* 4. Phone */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5">Phone</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search phone..."
                      value={phoneFilter}
                      onChange={e => setPhoneFilter(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                {/* 5. Role — excludes admin */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5">Role</Label>
                  <Select value={roleFilter} onValueChange={v => setRoleFilter(v as UserRole | 'all')}>
                    <SelectTrigger><SelectValue placeholder="All roles" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All roles</SelectItem>
                      {USER_ROLES.filter(r => r !== 'admin').map(role => (
                        <SelectItem key={role} value={role} className="capitalize">{role}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardHeader className="pb-3 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-headline text-primary">User management</CardTitle>
                  <CardDescription className="mt-0.5">
                    {isSuperAdmin
                      ? `${filteredUsers.length} of ${users.length} users`
                      : 'Click Edit on any row to manage roles and club.'}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredUsers.length === 0 ? (
                <p className="text-muted-foreground p-6">No users match the current filters.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[35%]">User</TableHead>
                        <TableHead className="w-[15%]">Club</TableHead>
                        <TableHead className="w-[28%]">Roles</TableHead>
                        <TableHead className="w-[14%]">Last login</TableHead>
                        <TableHead className="w-[8%]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map(user => {
                        const isSelected = selectedUser?.uid === user.uid;
                        return (
                          <TableRow
                            key={user.uid}
                            className={cn(isSelected && 'bg-primary/5 border-l-2 border-l-primary')}
                          >
                            <TableCell>
                              <div className="flex items-center gap-2.5">
                                <Avatar className="h-8 w-8 shrink-0">
                                  <AvatarFallback className={cn('text-xs font-medium', AvatarColor(user.uid))}>
                                    {getInitials(user.displayName, user.email)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="font-medium text-sm truncate">{user.displayName || 'No name'}</p>
                                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                                  {user.phoneNumber && (
                                    <p className="text-xs text-muted-foreground truncate">{user.phoneNumber}</p>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {user.clubName
                                ? <Badge variant="secondary" className="text-xs">{user.clubName}</Badge>
                                : <span className="text-muted-foreground text-xs">—</span>}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {(user.roles || ['unassigned']).filter(r => r !== 'admin').map(role => (
                                  <Badge key={role} variant="secondary" className="capitalize text-xs">
                                    {role}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {user.lastLogin
                                ? formatDistanceToNow(parseISO(user.lastLogin), { addSuffix: true })
                                : 'Never'}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant={isSelected ? 'default' : 'outline'}
                                size="sm"
                                className="h-7 text-xs px-2.5"
                                onClick={() => setSelectedUserUid(isSelected ? null : user.uid)}
                              >
                                {isSelected ? '← Close' : 'Edit →'}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Drawer */}
        {selectedUser && (
          <div className="w-80 shrink-0 sticky top-4">
            <Card className="overflow-hidden">
              <UserDrawer
                user={selectedUser}
                allOrgs={organizations}
                orgClubs={drawerClubs}
                isSuperAdmin={isSuperAdmin}
                onUpdated={handleUpdated}
                onClose={() => setSelectedUserUid(null)}
              />
            </Card>
          </div>
        )}
      </div>
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
              You do not have permission to view the user management page.
            </AlertDescription>
          </Alert>
        </div>
      }
    >
      <div className="space-y-0">
        {renderContent()}
      </div>
    </AuthProviderClientComponent>
  );
}
