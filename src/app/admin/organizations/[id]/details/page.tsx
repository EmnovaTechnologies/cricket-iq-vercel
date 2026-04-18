
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { getOrganizationByIdFromDB, getUserProfileFromDB } from '@/lib/db';
import type { Organization, UserProfile } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, ShieldAlert, ArrowLeft, Building, Palette, Image as ImageIcon, Users, Edit, Info, Link2, Copy, Check, CreditCard, UserPlus, ShieldPlus } from 'lucide-react';
import { THEME_PREVIEW_COLORS, ThemeColorPalette, PredefinedThemeName } from '@/lib/constants';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { PERMISSIONS } from '@/lib/permissions-master-list';

const ThemePreviewCard: React.FC<{ colors: ThemeColorPalette | null; themeName?: string }> = ({ colors, themeName }) => {
  if (!colors || !themeName) return <p className="text-sm text-muted-foreground">No theme selected or preview unavailable.</p>;
  return (
    <div className="mt-2 p-3 border rounded-lg space-y-2 bg-card shadow-sm">
      <p className="text-sm font-semibold text-foreground flex items-center gap-1">
        <Palette className="h-4 w-4 text-primary" />
        Theme: <span className="text-primary">{themeName}</span>
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        {(Object.keys(colors) as Array<keyof ThemeColorPalette>).map((colorKey) => {
          const hslValue = colors[colorKey as keyof ThemeColorPalette];
          if (!hslValue) return null; // Skip if a color is not defined for the theme
          return (
            <div key={colorKey} className="flex flex-col items-center text-center" title={`${colorKey.charAt(0).toUpperCase() + colorKey.slice(1)}: hsl(${hslValue})`}>
              <div
                style={{ backgroundColor: `hsl(${hslValue})` }}
                className="h-8 w-8 rounded-md border border-border shadow-inner"
              />
              <span className="text-xs text-muted-foreground mt-1 capitalize">{colorKey.replace(/([A-Z])/g, ' $1').trim()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const OrgLinkDisplay: React.FC<{ labelText: string; url: string }> = ({ labelText, url }) => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      toast({ title: "Copied to clipboard!", description: url });
      setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
      console.error('Failed to copy: ', err);
      toast({ title: "Error", description: "Failed to copy link.", variant: "destructive" });
    });
  };

  return (
    <div className="space-y-1">
      <Label htmlFor={`link-${labelText.toLowerCase().replace(/\s+/g, '-')}`} className="text-sm font-medium text-muted-foreground">{labelText}</Label>
      <div className="flex items-center gap-2">
        <Input id={`link-${labelText.toLowerCase().replace(/\s+/g, '-')}`} value={url} readOnly className="text-xs h-8" />
        <Button type="button" variant="outline" size="icon" onClick={copyToClipboard} className="h-8 w-8 shrink-0">
          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          <span className="sr-only">Copy link</span>
        </Button>
      </div>
    </div>
  );
};


export default function OrganizationDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orgId = params.id;
  const { userProfile, isAuthLoading, isPermissionsLoading, effectivePermissions } = useAuth();

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [organizationAdmins, setOrganizationAdmins] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBaseUrl(window.location.origin);
    }
  }, []);

  useEffect(() => {
    if (isAuthLoading) {
        return; // Wait for auth to complete
    }
    if (orgId) {
      const fetchOrganizationDetails = async () => {
        setLoading(true);
        setError(null);
        try {
          const orgData = await getOrganizationByIdFromDB(orgId as string);
          if (orgData) {
            setOrganization(orgData);
            if (orgData.organizationAdminUids && orgData.organizationAdminUids.length > 0) {
              const adminProfiles = await Promise.all(
                orgData.organizationAdminUids.map(uid => getUserProfileFromDB(uid))
              );
              setOrganizationAdmins(adminProfiles.filter(Boolean) as UserProfile[]);
            } else {
              setOrganizationAdmins([]);
            }
          } else {
            setError('Organization not found.');
          }
        } catch (err: any) {
          console.error("Failed to fetch organization details:", err);
          setError(err.message || 'Failed to load organization details.');
        } finally {
          setLoading(false);
        }
      };
      fetchOrganizationDetails();
    }
  }, [orgId, isAuthLoading]);

  const themePalette = organization?.branding?.themeName
    ? THEME_PREVIEW_COLORS[organization.branding.themeName as PredefinedThemeName] || null
    : THEME_PREVIEW_COLORS['Default'];

  const loginUrl = organization && baseUrl ? `${baseUrl}/login?orgId=${organization.id}` : '';
  const signupUrl = organization && baseUrl ? `${baseUrl}/signup?orgId=${organization.id}` : '';
  const playerRegistrationUrl = organization && baseUrl ? `${baseUrl}/register-player/${organization.id}` : '';


  if (loading || isAuthLoading || isPermissionsLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading organization details...</p>
      </div>
    );
  }

  // Access Control Check
  const isSuperAdmin = userProfile?.roles.includes('admin');
  const isAssignedToThisOrg = userProfile?.assignedOrganizationIds?.includes(orgId);
  
  if (!isSuperAdmin && !isAssignedToThisOrg) {
    return (
      <div className="max-w-2xl mx-auto">
        <Alert variant="destructive" className="mt-8">
          <ShieldAlert className="h-5 w-5" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You do not have permission to view this organization's details.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push('/admin/organizations')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Organizations
          </Button>
          {organization && (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/admin/organizations/${orgId}/billing`}>
                <CreditCard className="mr-2 h-4 w-4" /> Billing
              </Link>
            </Button>
            {(isSuperAdmin || effectivePermissions[PERMISSIONS.PAGE_VIEW_ADMIN_ORGANIZATION_EDIT]) && (
              <Button variant="default" size="sm" asChild>
                <Link href={`/admin/organizations/${orgId}/edit`}>
                  <Edit className="mr-2 h-4 w-4" /> Edit Organization
                </Link>
              </Button>
            )}
          </div>
          )}
      </div>

      {error && !organization && (
        <Alert variant="destructive">
          <ShieldAlert className="h-5 w-5" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!organization && !loading && !error && (
          <Alert variant="default">
              <Info className="h-5 w-5" />
              <AlertTitle>Organization Not Found</AlertTitle>
              <AlertDescription>The requested organization could not be found or you do not have permission to view it.</AlertDescription>
          </Alert>
      )}

      {organization && (
        <Card className="shadow-lg">
          <CardHeader className="bg-muted/30">
            <div className="flex flex-col sm:flex-row justify-between items-start">
              <div className="flex items-center gap-3">
                  {organization.branding?.logoUrl ? (
                      <Image 
                          src={organization.branding.logoUrl} 
                          alt={`${organization.name} Logo`}
                          width={64} 
                          height={64} 
                          className="h-16 w-16 object-contain rounded-md border bg-background p-1 shadow"
                          data-ai-hint="organization logo large"
                      />
                  ) : (
                      <Building className="h-12 w-12 text-primary" />
                  )}
                  <div>
                      <CardTitle className="text-3xl font-headline text-primary">{organization.name}</CardTitle>
                      <CardDescription className="text-base">Detailed information and settings for this organization.</CardDescription>
                  </div>
              </div>
              <Badge variant={organization.status === 'active' ? 'default' : 'secondary'} className="capitalize text-sm mt-2 sm:mt-0">
                {organization.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            
            {organization.branding?.bannerUrl && (
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <ImageIcon className="h-5 w-5 text-primary" /> Banner
                </h3>
                <div className="relative w-full h-48 md:h-64 rounded-md overflow-hidden border shadow-inner">
                  <Image 
                      src={organization.branding.bannerUrl} 
                      alt={`${organization.name} Banner`} 
                      fill
                      style={{objectFit: 'cover'}}
                      data-ai-hint="organization banner"
                  />
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Palette className="h-5 w-5 text-primary" /> Branding & Theme
              </h3>
              <ThemePreviewCard colors={themePalette} themeName={organization.branding?.themeName || 'Default'} />
                {!organization.branding?.themeName && (
                  <p className="text-xs text-muted-foreground">No specific theme selected; using system default.</p>
              )}
            </div>

              <div className="space-y-2">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <ShieldPlus className="h-5 w-5 text-primary" /> Affiliated Clubs
              </h3>
              {organization.clubs && organization.clubs.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {organization.clubs.map(club => (
                    <Badge key={club} variant="secondary" className="text-base">
                      {club}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No clubs have been defined for this organization yet. You can add them by editing the organization.</p>
              )}
            </div>


            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" /> Organization Administrators
              </h3>
              {organizationAdmins.length > 0 ? (
                <ul className="list-disc list-inside pl-2 space-y-1 text-sm">
                  {organizationAdmins.map(admin => (
                    <li key={admin.uid} className="text-foreground">
                      {admin.displayName || admin.email} ({admin.roles.join(', ')})
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No administrators assigned to this organization.</p>
              )}
            </div>

            {organization.status === 'active' && baseUrl && (
              <div className="space-y-4 pt-4 border-t">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Link2 className="h-5 w-5 text-primary" /> Organization Access Links
                </h3>
                <OrgLinkDisplay labelText="User Signup Link" url={signupUrl} />
                <OrgLinkDisplay labelText="User Login Link" url={loginUrl} />
                <OrgLinkDisplay labelText="Player Registration Link" url={playerRegistrationUrl} />
                <p className="text-xs text-muted-foreground">
                  Share these links with users. The 'Player Registration' link is public and does not require login.
                </p>
              </div>
            )}
            
            <div className="text-xs text-muted-foreground pt-4 border-t">
              <p>Organization ID: {organization.id}</p>
              {organization.createdAt && <p>Created At: {new Date(organization.createdAt).toLocaleString()}</p>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
