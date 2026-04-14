
'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Leaf, Users, UserSquare2, Gamepad2, Target, Menu, Layers, MapPinned, LogIn, LogOut, UserPlus, UserCog, ShieldCheck, Building, ChevronsUpDown, Check, Hourglass, ListFilter, ImageIcon, User, Download, ChevronRight, BarChart3, Table, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import type { Organization, PermissionKey } from '@/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2 } from 'lucide-react';
import { getAllPublicActiveOrganizations } from '@/lib/actions/public-org-action';
import { PERMISSIONS } from '@/lib/permissions-master-list';


const Navbar = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showPlayerDialog, setShowPlayerDialog] = useState(false);
  const [orgs, setOrgs] = useState<{ id: string; name: string; branding?: any }[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(false);

  const handleOpenPlayerDialog = async () => {
    setShowPlayerDialog(true);
    setOrgsLoading(true);
    try {
      const activeOrgs = await getAllPublicActiveOrganizations();
      setOrgs(activeOrgs);
    } catch { setOrgs([]); }
    finally { setOrgsLoading(false); }
  };

  const {
    currentUser,
    userProfile,
    logout,
    isAuthLoading,
    activeOrganizationId,
    setActiveOrganizationId,
    organizationsForSwitching,
    activeOrganizationDetails,
    effectivePermissions, 
  } = useAuth();
  
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);


  const siteDisplayName = isClient && activeOrganizationId && activeOrganizationDetails?.name
    ? activeOrganizationDetails.name
    : 'Cricket IQ';

  const siteDisplayLogo = isClient && activeOrganizationId && activeOrganizationDetails?.branding?.logoUrl
    ? activeOrganizationDetails.branding.logoUrl
    : null;

  const dropdownTriggerName = isClient
    ? (isAuthLoading ? "Loading Org..." : (activeOrganizationDetails?.name || "Select Organization"))
    : "Cricket IQ";

  const dropdownTriggerLogo = isClient
    ? (activeOrganizationDetails?.branding?.logoUrl)
    : null;


  const mainNavLinks = [
    { href: '/', label: 'Dashboard', icon: <Leaf className="h-5 w-5" />, permission: PERMISSIONS.PAGE_VIEW_DASHBOARD },
    { href: '/series', label: 'Series', icon: <Layers className="h-5 w-5" />, permission: PERMISSIONS.PAGE_VIEW_SERIES_LIST },
    { href: '/games', label: 'Games', icon: <Gamepad2 className="h-5 w-5" />, permission: PERMISSIONS.PAGE_VIEW_GAMES_LIST },
    { href: '/teams', label: 'Teams', icon: <Users className="h-5 w-5" />, permission: PERMISSIONS.PAGE_VIEW_TEAMS_LIST },
    { href: '/players', label: 'Players', icon: <Users className="h-5 w-5" />, permission: PERMISSIONS.PAGE_VIEW_PLAYERS_LIST },
    { href: '/venues', label: 'Venues', icon: <MapPinned className="h-5 w-5" />, permission: PERMISSIONS.PAGE_VIEW_VENUES_LIST },
    { href: '/team-composition', label: 'Team AI', icon: <Target className="h-5 w-5" />, permission: PERMISSIONS.PAGE_VIEW_TEAM_COMPOSITION },
    { href: '/export', label: 'Export', icon: <Download className="h-5 w-5" />, permission: PERMISSIONS.PAGE_VIEW_EXPORT },
    { href: '/scorecards', label: 'Scorecards', icon: <Table className="h-5 w-5" />, permission: PERMISSIONS.PAGE_VIEW_SCORECARDS },
    { href: '/scorecard-selection', label: 'SC Select', icon: <ClipboardCheck className="h-5 w-5" />, permission: PERMISSIONS.PAGE_VIEW_SCORECARDS },
  ];

  const loggedInUserLinks = [
     { href: '/admin/users', label: 'User Management', icon: <ShieldCheck className="h-5 w-5" />, roles: ['admin', 'Organization Admin'] },
     { href: '/admin/scoring-config', label: 'Scoring Formula', icon: <BarChart3 className="h-5 w-5" />, roles: ['admin', 'Organization Admin'] },
  ];

  const superAdminLinks = [
      { href: '/admin/organizations', label: 'Organizations', icon: <Building className="h-5 w-5" />, roles: ['admin'] },
      { href: '/admin/role-management', label: 'Role Permissions', icon: <ListFilter className="h-5 w-5" />, roles: ['admin'] },
      { href: '/admin/icon-library', label: 'Icon Library', icon: <ImageIcon className="h-5 w-5" />, roles: ['admin'] },
  ];


  const handleLogout = async () => {
    try {
      await logout();
      setIsMobileMenuOpen(false);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const getInitials = (name?: string | null, email?: string | null) => {
    if (name) return name.split(' ').map(n => n[0]).join('').toUpperCase();
    if (email) return email.substring(0,2).toUpperCase();
    return 'U';
  }

  const hasAnyRole = (userRoles: string[] | undefined, targetRoles: string[]) => {
      if (!userRoles) return false;
      return userRoles.some(role => targetRoles.includes(role));
  }
  
  const isEffectivelyUnassigned = userProfile && userProfile.roles.length === 1 && userProfile.roles[0] === 'unassigned';

  let mobileLinks: Array<{ href: string; label: string; icon: JSX.Element; roles?: string[]; permission?: PermissionKey }> = [];
  if (currentUser && !isAuthLoading) {
    const visibleMainNavLinks = mainNavLinks.filter(link => {
      return userProfile?.roles?.includes('admin') || (link.permission && effectivePermissions[link.permission]);
    });

    if (!isEffectivelyUnassigned) {
        mobileLinks = [
            ...visibleMainNavLinks,
            ...loggedInUserLinks.filter(link => hasAnyRole(userProfile?.roles, link.roles || [])),
            ...superAdminLinks.filter(link => hasAnyRole(userProfile?.roles, link.roles || [])),
        ];
    } else { 
        mobileLinks = visibleMainNavLinks.filter(link => link.href === '/');
    }
  }

  const isAdmin = userProfile?.roles?.includes('admin');

  const showOrgSelector = 
    currentUser && 
    !isAuthLoading && 
    (
      isAdmin || 
      (!isEffectivelyUnassigned && organizationsForSwitching && organizationsForSwitching.length > 1)
    );


  return (
    <>
    <header className="bg-card shadow-md sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <Link href="/" className="flex items-center gap-2 text-primary hover:opacity-80 transition-opacity">
          {siteDisplayLogo ? (
            <Image src={siteDisplayLogo} alt={`${siteDisplayName} Logo`} width={32} height={32} className="h-8 w-8 object-contain rounded" data-ai-hint="organization logo"/>
          ) : (
            <Leaf className="h-8 w-8" />
          )}
          <h1 className="text-2xl font-headline font-bold">{siteDisplayName}</h1>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          {currentUser && !isAuthLoading && !isEffectivelyUnassigned && mainNavLinks.map((link) => {
            const canViewLink = userProfile?.roles?.includes('admin') || (link.permission && effectivePermissions[link.permission]);
            if (canViewLink) {
              return (
                <Button key={link.href} variant="ghost" asChild className="text-foreground hover:bg-primary/10 hover:text-primary text-sm px-3">
                  <Link href={link.href} className="flex items-center gap-2">
                    {link.icon}
                    {link.label}
                  </Link>
                </Button>
              );
            }
            return null;
          })}
          {currentUser && !isAuthLoading && isEffectivelyUnassigned && mainNavLinks.filter(link => link.href === '/').map((link) => {
             const canViewLink = userProfile?.roles?.includes('admin') || (link.permission && effectivePermissions[link.permission]);
             if (canViewLink) {
               return (
                 <Button key={link.href} variant="ghost" asChild className="text-foreground text-sm px-3">
                  <Link href={link.href} className="flex items-center gap-2">
                    {link.icon}
                    {link.label}
                  </Link>
                </Button>
               );
             }
             return null;
          })}

           {currentUser && userProfile && !isEffectivelyUnassigned && (hasAnyRole(userProfile.roles, ['admin', 'Organization Admin'])) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="text-foreground hover:bg-accent hover:text-accent-foreground text-sm px-3">
                  <UserCog className="h-5 w-5 mr-1" /> Admin Tools
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Management</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {loggedInUserLinks.filter(link => hasAnyRole(userProfile?.roles, link.roles)).map((link) => (
                  <DropdownMenuItem key={link.href} asChild>
                    <Link href={link.href} className="flex items-center gap-2">
                      {link.icon} {link.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
                 {superAdminLinks.filter(link => hasAnyRole(userProfile?.roles, link.roles)).map((link) => (
                  <DropdownMenuItem key={link.href} asChild>
                    <Link href={link.href} className="flex items-center gap-2">
                      {link.icon} {link.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
                {userProfile && hasAnyRole(userProfile.roles, ['Organization Admin']) && !hasAnyRole(userProfile.roles, ['admin']) && activeOrganizationId && (
                    <DropdownMenuItem asChild>
                        <Link href={`/admin/organizations/${activeOrganizationId}/details`} className="flex items-center gap-2">
                            <Building className="h-5 w-5" /> My Organization
                        </Link>
                    </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
           )}

          {showOrgSelector && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="text-sm px-3 ml-2">
                  {dropdownTriggerLogo && isClient ? (
                     <Image src={dropdownTriggerLogo} alt="" width={16} height={16} className="h-4 w-4 mr-1.5 object-contain rounded-sm" data-ai-hint="organization logo small"/>
                  ) : (
                     <Building className="h-4 w-4 mr-1.5" />
                  )}
                  <span className="truncate max-w-[120px]">{dropdownTriggerName}</span>
                  <ChevronsUpDown className="h-3 w-3 ml-1 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>Switch Organization</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {organizationsForSwitching && organizationsForSwitching.length > 0 ? (
                  <DropdownMenuRadioGroup value={activeOrganizationId || ""} onValueChange={setActiveOrganizationId}>
                    {organizationsForSwitching.map((org: Organization) => (
                      <DropdownMenuRadioItem key={org.id} value={org.id} className="cursor-pointer">
                         {org.branding?.logoUrl ? (
                           <Image src={org.branding.logoUrl} alt="" width={16} height={16} className="h-4 w-4 mr-2 object-contain rounded-sm" data-ai-hint="organization logo small"/>
                         ) : (
                           <Building className="h-4 w-4 mr-2 opacity-60" />
                         )}
                        {org.name}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                ) : (
                  <DropdownMenuItem disabled>No organizations available.</DropdownMenuItem>
                )}
                 {activeOrganizationId && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setActiveOrganizationId(null)} className="text-muted-foreground cursor-pointer">
                      Clear Selection
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {isAuthLoading ? ( 
             <Button variant="ghost" className="text-sm px-3 opacity-50">Loading...</Button>
          ) : currentUser && userProfile ? (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-8 flex items-center justify-start gap-2 ml-2">
                        <Avatar className="h-8 w-8">
                            <AvatarImage src={currentUser.photoURL || undefined} alt={userProfile.displayName || userProfile.email || 'User'} />
                            <AvatarFallback>{getInitials(userProfile.displayName, userProfile.email)}</AvatarFallback>
                        </Avatar>
                        <span className="hidden sm:inline-block truncate max-w-[100px]">
                          {userProfile.displayName || userProfile.email || userProfile.phoneNumber}
                        </span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                        <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{userProfile.displayName}</p>
                        <p className="text-xs leading-none text-muted-foreground">
                            {userProfile.email || userProfile.phoneNumber}
                        </p>
                        </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Roles</DropdownMenuLabel>
                        {(userProfile.roles || []).map(role => (
                            <DropdownMenuItem key={role} disabled className="capitalize text-xs">
                                {role}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild disabled={!userProfile.playerId}>
                      <Link href={userProfile.playerId ? `/players/${userProfile.playerId}` : '#'}>
                          <User className="mr-2 h-4 w-4" />Profile
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={handleLogout} className="text-destructive">
                        <LogOut className="mr-2 h-4 w-4" />
                        Logout
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button variant="ghost" asChild className="text-foreground hover:bg-primary/10 hover:text-primary text-sm px-3">
                <Link href="/login" className="flex items-center gap-1">
                  <LogIn className="h-5 w-5" /> Login
                </Link>
              </Button>
              <Button variant="outline" onClick={handleOpenPlayerDialog} className="text-sm px-3 gap-1 border-primary/40 text-primary hover:bg-primary/5">
                <UserSquare2 className="h-5 w-5" /> Register as Player
              </Button>
              <Button variant="default" asChild className="bg-primary hover:bg-primary/90 text-sm px-3">
                <Link href="/signup" className="flex items-center gap-1">
                  <UserPlus className="h-5 w-5" /> Sign Up
                </Link>
              </Button>
            </>
          )}
        </nav>

        {/* Mobile Navigation */}
        <div className="md:hidden">
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild><Button variant="ghost" size="icon">
              <Menu className="h-6 w-6 text-primary" />
            </Button></SheetTrigger>
            <SheetContent side="right" className="w-[280px] bg-card p-4">
              <div className="flex flex-col gap-2 mt-8">
                {currentUser && mobileLinks.map((link) => (
                  <Button key={link.href} variant="ghost" asChild className={cn("justify-start text-foreground hover:bg-primary/10 hover:text-primary text-base py-3")}>
                    <Link href={link.href} onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3">
                      {React.cloneElement(link.icon, { className: "h-5 w-5" })}
                      {link.label}
                    </Link>
                  </Button>
                ))}
                {currentUser && userProfile && hasAnyRole(userProfile.roles, ['Organization Admin']) && !hasAnyRole(userProfile.roles, ['admin']) && activeOrganizationId && (
                  <Button variant="ghost" asChild className={cn("justify-start text-foreground hover:bg-primary/10 hover:text-primary text-base py-3")}>
                    <Link href={`/admin/organizations/${activeOrganizationId}/details`} onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3">
                      <Building className="h-5 w-5" /> My Organization
                    </Link>
                  </Button>
                )}
                <hr className="my-2 border-border" />
                {isAuthLoading ? (
                    <Button variant="ghost" disabled className="justify-start text-base py-3 opacity-50">Loading...</Button>
                ) : currentUser ? (
                  <>
                    <div className="flex items-center gap-2 p-2 border-b border-border mb-2">
                        <Avatar className="h-9 w-9">
                            <AvatarImage src={currentUser.photoURL || undefined} alt={userProfile?.displayName || userProfile?.email || 'User'} />
                            <AvatarFallback>{getInitials(userProfile?.displayName, userProfile?.email)}</AvatarFallback>
                        </Avatar>
                        <div>
                            <span className="text-sm text-foreground truncate block" title={userProfile?.displayName || userProfile?.email || ''}>
                               {userProfile?.displayName || userProfile?.email || userProfile?.phoneNumber}
                            </span>
                            {userProfile?.roles && userProfile.roles.length > 0 && (
                                <Badge variant={isEffectivelyUnassigned ? "destructive" : "secondary"} className="text-xs capitalize mt-0.5">
                                     {userProfile.roles.join(', ')}
                                </Badge>
                            )}
                        </div>
                    </div>
                     {showOrgSelector && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-base py-3 mb-2 h-auto">
                               {dropdownTriggerLogo && isClient ? (
                                <Image src={dropdownTriggerLogo} alt="" width={20} height={20} className="h-5 w-5 mr-3 object-contain rounded-sm" data-ai-hint="organization logo small"/>
                              ) : (
                                <Building className="h-5 w-5 mr-3" />
                              )}
                              <span className="truncate flex-1 text-left">{dropdownTriggerName}</span>
                              <ChevronsUpDown className="h-4 w-4 ml-auto opacity-70" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent side="bottom" align="start" className="w-[260px]">
                            <DropdownMenuLabel>Switch Organization</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {organizationsForSwitching && organizationsForSwitching.length > 0 ? (
                              <DropdownMenuRadioGroup value={activeOrganizationId || ""} onValueChange={(orgId) => { setActiveOrganizationId(orgId); setIsMobileMenuOpen(false); }}>
                                {organizationsForSwitching.map((org: Organization) => (
                                  <DropdownMenuRadioItem key={org.id} value={org.id} className="cursor-pointer text-sm">
                                    {org.branding?.logoUrl ? (
                                        <Image src={org.branding.logoUrl} alt="" width={16} height={16} className="h-4 w-4 mr-2 object-contain rounded-sm" data-ai-hint="organization logo small"/>
                                    ) : (
                                        <Building className="h-4 w-4 mr-2 opacity-60" />
                                    )}
                                    {org.name}
                                  </DropdownMenuRadioItem>
                                ))}
                              </DropdownMenuRadioGroup>
                            ) : (
                              <DropdownMenuItem disabled>No organizations available.</DropdownMenuItem>
                            )}
                            {activeOrganizationId && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => { setActiveOrganizationId(null); setIsMobileMenuOpen(false); }} className="text-muted-foreground cursor-pointer text-sm">
                                  Clear Selection
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    <Button variant="ghost" onClick={handleLogout} className="justify-start text-destructive hover:bg-destructive/10 hover:text-destructive text-base py-3">
                      <LogOut className="h-5 w-5 mr-3" /> Logout
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" asChild className="justify-start text-foreground hover:bg-primary/10 hover:text-primary text-base py-3">
                      <Link href="/login" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3">
                        <LogIn className="h-5 w-5" /> Login
                      </Link>
                    </Button>
                    <Button variant="outline" onClick={() => { setIsMobileMenuOpen(false); handleOpenPlayerDialog(); }} className="justify-start text-base py-3 gap-3 border-primary/40 text-primary hover:bg-primary/5">
                      <UserSquare2 className="h-5 w-5" /> Register as Player
                    </Button>
                    <Button variant="default" asChild className="justify-start bg-primary hover:bg-primary/90 text-base py-3">
                      <Link href="/signup" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3">
                        <UserPlus className="h-5 w-5" /> Sign Up
                      </Link>
                    </Button>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>

    {/* Player signup org picker dialog */}
    <Dialog open={showPlayerDialog} onOpenChange={setShowPlayerDialog}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserSquare2 className="h-5 w-5 text-primary" /> Register as a Player
          </DialogTitle>
          <DialogDescription>
            Select your organization to begin the player registration process.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2 max-h-72 overflow-y-auto">
          {orgsLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : orgs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No active organizations found.</p>
          ) : (
            orgs.map(org => (
              <Link
                key={org.id}
                href={`/register-player/${org.id}`}
                onClick={() => setShowPlayerDialog(false)}
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted hover:border-primary/50 transition-colors group"
              >
                <div className="h-9 w-9 rounded-md border bg-muted flex items-center justify-center shrink-0">
                  {org.branding?.logoUrl ? (
                    <img src={org.branding.logoUrl} alt={org.name} className="h-8 w-8 object-contain rounded" />
                  ) : (
                    <Building className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <span className="flex-1 text-sm font-medium">{org.name}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </Link>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
};

export default Navbar;
