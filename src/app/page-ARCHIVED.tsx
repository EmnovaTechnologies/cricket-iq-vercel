'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Users, Gamepad2, Target, BarChart3, PlusCircle, Layers, Shield, MapPinned, Loader2, LogOut, Hourglass, Edit, Link2 } from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/contexts/auth-context';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import React, { useState, useEffect } from 'react';

export default function DashboardPage() {
  const router = useRouter();
  const {
    activeOrganizationDetails,
    isAuthLoading,
    userProfile,
    currentUser,
    logout,
    effectivePermissions,
    isLoggingOut,
  } = useAuth();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!currentUser && !isAuthLoading) {
      router.push('/login');
    }
  }, [currentUser, isAuthLoading, router]);

  const isAdmin = userProfile?.roles.includes('admin');

  const allQuickLinks = [
    { href: '/players/add', label: 'Add New Player', icon: <PlusCircle className="h-5 w-5" />, description: "Register a new player's profile.", permission: PERMISSIONS.PAGE_VIEW_PLAYER_ADD },
    { href: '/teams/add', label: 'Add New Team', icon: <PlusCircle className="h-5 w-5" />, description: "Define a new cricket team.", permission: PERMISSIONS.PAGE_VIEW_TEAM_ADD },
    { href: '/series/add', label: 'Add New Series', icon: <PlusCircle className="h-5 w-5" /> , description: 'Create a new cricket series.', permission: PERMISSIONS.PAGE_VIEW_SERIES_ADD },
    { href: '/venues/add', label: 'Add New Venue', icon: <PlusCircle className="h-5 w-5" /> , description: 'Register a new game venue.', permission: PERMISSIONS.PAGE_VIEW_VENUE_ADD },
    { href: '/games', label: 'Manage Games', icon: <Gamepad2 className="h-5 w-5" />, description: 'View game details and manage ratings.', permission: PERMISSIONS.PAGE_VIEW_GAMES_LIST },
    { href: '/team-composition', label: 'AI Team Suggestion', icon: <Target className="h-5 w-5" />, description: 'Get AI-powered team composition.', permission: PERMISSIONS.PAGE_VIEW_TEAM_COMPOSITION },
  ];

  const allInfoCards = [
    { title: 'Manage Players', description: 'View, add, and edit player profiles and track their progress.', icon: <Users className="h-8 w-8 text-primary" />, href: '/players', permission: PERMISSIONS.PAGE_VIEW_PLAYERS_LIST },
    { title: 'Manage Teams', description: 'Define teams and assign them to series or tournaments.', icon: <Shield className="h-8 w-8 text-primary" />, href: '/teams', permission: PERMISSIONS.PAGE_VIEW_TEAMS_LIST },
    { title: 'Organize Series', description: 'Define and manage cricket series, and add participating teams and venues.', icon: <Layers className="h-8 w-8 text-primary" />, href: '/series', permission: PERMISSIONS.PAGE_VIEW_SERIES_LIST },
    { title: 'Manage Venues', description: 'Add and maintain a list of cricket venues.', icon: <MapPinned className="h-8 w-8 text-primary" />, href: '/venues', permission: PERMISSIONS.PAGE_VIEW_VENUES_LIST },
    { title: 'Track Games', description: 'Record game details and manage player ratings for each match.', icon: <Gamepad2 className="h-8 w-8 text-primary" />, href: '/games', permission: PERMISSIONS.PAGE_VIEW_GAMES_LIST },
    { title: 'Sharing & Invites', description: 'Get links for user signup and public player registration for your organizations.', icon: <Link2 className="h-8 w-8 text-primary" />, href: '/admin/organizations', permission: PERMISSIONS.PAGE_VIEW_ADMIN_ORGANIZATIONS_LIST },
  ];

  const visibleQuickLinks = React.useMemo(() => {
    if (!currentUser || isAuthLoading) return [];
    return allQuickLinks.filter(link =>
      isAdmin || (link.permission && effectivePermissions && effectivePermissions[link.permission])
    );
  }, [currentUser, isAdmin, isAuthLoading, effectivePermissions]);

  const visibleInfoCards = React.useMemo(() => {
    if (!currentUser || isAuthLoading) return [];
    return allInfoCards.filter(card =>
      isAdmin || (card.permission && effectivePermissions && effectivePermissions[card.permission])
    );
  }, [currentUser, isAdmin, isAuthLoading, effectivePermissions]);

  if (isLoggingOut) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Logging out & redirecting...</p>
      </div>
    );
  }

  if (isAuthLoading || !mounted) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading dashboard...</p>
      </div>
    );
  }

  if (!currentUser && !isAuthLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Redirecting to login...</p>
      </div>
    );
  }

  if (currentUser && userProfile && userProfile.roles.length === 1 && userProfile.roles[0] === 'unassigned') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-12rem)] text-center">
        <Hourglass className="h-16 w-16 text-primary mb-4" />
        <h1 className="text-2xl font-semibold text-primary mb-2">Account Pending Role Assignment</h1>
        <p className="text-muted-foreground mb-6 max-w-md">
          Welcome, {userProfile.displayName || userProfile.email}! Your account has been created, but an administrator needs to assign you a role before you can access the application features. Please contact your organization administrator.
        </p>
        <Button variant="outline" onClick={logout}>
          <LogOut className="mr-2 h-4 w-4" /> Logout
        </Button>
      </div>
    );
  }

  const bannerUrl = activeOrganizationDetails?.branding?.bannerUrl || "https://placehold.co/1200x400.png";
  const bannerAlt = activeOrganizationDetails?.name ? `${activeOrganizationDetails.name} Banner` : "Welcome Banner";
  const bannerHint = activeOrganizationDetails?.branding?.bannerUrl ? "organization banner" : "cricket celebration";

  const displayOrganizationName = isAuthLoading && !activeOrganizationDetails
    ? "Your Organization"
    : activeOrganizationDetails?.name || 'Cricket IQ';

  const displayBannerUrl = isAuthLoading && !activeOrganizationDetails?.branding?.bannerUrl
    ? "https://placehold.co/1200x400.png"
    : bannerUrl;

  const displayBannerAlt = isAuthLoading && !activeOrganizationDetails?.name
    ? "Loading Banner..."
    : bannerAlt;

  return (
    <div className="space-y-8">
      <Card className="overflow-hidden shadow-lg">
        <div className="relative h-56 md:h-72 w-full">
          <Image
            src={displayBannerUrl}
            alt={displayBannerAlt}
            fill
            style={{objectFit: 'cover'}}
            data-ai-hint={bannerHint}
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex flex-col justify-end p-6 md:p-8">
            <h1 className="text-4xl md:text-5xl font-headline font-bold text-white">
              Welcome to {displayOrganizationName}
            </h1>
            <p className="text-lg text-gray-200 mt-2">Your ultimate platform for player performance analysis and team selection.</p>
          </div>
        </div>
      </Card>

      {visibleQuickLinks.length > 0 && (
        <section>
          <h2 className="text-2xl font-headline font-semibold mb-4 text-foreground">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
            {visibleQuickLinks.map((link) => (
              <Card key={link.href} className="hover:shadow-xl transition-shadow duration-300 flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-primary text-lg">
                    {link.icon}
                    {link.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-grow">
                  <p className="text-muted-foreground mb-4 text-sm">{link.description}</p>
                </CardContent>
                <CardFooter>
                  <Button asChild className="w-full bg-primary hover:bg-primary/90 text-sm"><Link href={link.href}>Go to {link.label.split(' ')[0]}</Link></Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </section>
      )}

      {visibleInfoCards.length > 0 && (
        <section>
          <h2 className="text-2xl font-headline font-semibold mb-4 text-foreground">Core Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleInfoCards.map((card) => (
              <Card key={card.title} className="hover:shadow-xl transition-shadow duration-300 flex flex-col">
                <CardHeader className="flex flex-row items-start gap-4">
                  {card.icon}
                  <div>
                    <CardTitle className="text-lg">{card.title}</CardTitle>
                    <CardDescription className="text-sm">{card.description}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="mt-auto">
                   <Button variant="outline" asChild className="w-full border-primary text-primary hover:bg-primary/10 text-sm"><Link href={card.href}>Explore {card.title.split(' ').slice(-1)[0]}</Link></Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
      {(visibleQuickLinks.length === 0 && visibleInfoCards.length === 0 && currentUser && !isAuthLoading) && (
        <Alert variant="default" className="border-primary/50">
          <Hourglass className="h-5 w-5 text-primary" />
          <AlertTitle>Dashboard Content Limited</AlertTitle>
          <AlertDescription>
            You do not have permissions to view most dashboard items. Please contact an administrator if you believe this is an error.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
