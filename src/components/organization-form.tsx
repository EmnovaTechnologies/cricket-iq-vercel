
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import type { Organization, OrganizationBranding, OrganizationStatus, UserProfile } from '@/types';
import { PREDEFINED_THEME_NAMES, ORGANIZATION_STATUSES, THEME_PREVIEW_COLORS, type ThemeColorPalette, type PredefinedThemeName } from '@/lib/constants';
import { useState, useMemo, useEffect, type ChangeEvent } from 'react';
import { Loader2, Search, Palette, UploadCloud, Link as LinkIcon, Trash2, PlusCircle, ShieldPlus, X } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
import { storage, db } from '@/lib/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Badge } from '@/components/ui/badge';
import { getUserProfileFromDB } from '@/lib/db';
import { doc, collection, writeBatch, arrayUnion, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';


const organizationFormSchema = z.object({
  name: z.string().min(3, { message: 'Organization name must be at least 3 characters.' }),
  status: z.enum(ORGANIZATION_STATUSES, { required_error: 'Status is required.' }),
  themeName: z.enum(PREDEFINED_THEME_NAMES).optional(),
  logoUrl: z.string().url({ message: "Please enter a valid URL for the logo." }).optional().or(z.literal('')),
  bannerUrl: z.string().url({ message: "Please enter a valid URL for the banner." }).optional().or(z.literal('')),
  organizationAdminUids: z.array(z.string()).optional(),
  clubs: z.array(z.string()).optional(),
  logoInputType: z.enum(['url', 'upload']).default('url'),
  bannerInputType: z.enum(['url', 'upload']).default('url'),
});

type OrganizationFormValues = z.infer<typeof organizationFormSchema>;

interface OrganizationFormProps {
  initialData?: Organization;
  allUsersForAdminSelection: UserProfile[];
  onSubmitSuccess?: (organization: Organization) => void;
}

const ThemePreviewInternal: React.FC<{ colors: ThemeColorPalette | null; themeName: string }> = ({ colors, themeName }) => {
  if (!colors) return null;
  return (
    <div className="mt-4 p-4 border rounded-lg space-y-3 bg-card shadow">
      <p className="text-base font-semibold text-foreground flex items-center gap-2">
        <Palette className="h-5 w-5 text-primary" />
        Theme Preview: <span className="text-primary">{themeName}</span>
      </p>
      <div className="flex flex-wrap gap-3 items-center">
        {(Object.keys(colors) as Array<keyof ThemeColorPalette>).map((colorKey) => (
          <div key={colorKey} className="flex flex-col items-center text-center">
            <div
              title={`${colorKey.charAt(0).toUpperCase() + colorKey.slice(1)}: hsl(${colors[colorKey]})`}
              style={{ backgroundColor: `hsl(${colors[colorKey]})` }}
              className="h-12 w-12 rounded-md border border-border shadow-inner"
            />
            <span className="text-xs text-muted-foreground mt-1.5 capitalize">{colorKey}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export function OrganizationForm({ initialData, allUsersForAdminSelection, onSubmitSuccess }: OrganizationFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  
  const [currentThemeForPreview, setCurrentThemeForPreview] = useState<PredefinedThemeName>(initialData?.branding?.themeName || 'Default');
  const [currentPaletteForPreview, setCurrentPaletteForPreview] = useState<ThemeColorPalette | null>(
    THEME_PREVIEW_COLORS[initialData?.branding?.themeName || 'Default'] || null
  );

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [logoUploadProgress, setLogoUploadProgress] = useState(0);
  const [bannerUploadProgress, setBannerUploadProgress] = useState(0);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [bannerUploadError, setBannerUploadError] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);

  const [clubInputValue, setClubInputValue] = useState('');

  const isEditMode = !!initialData?.id;

  const form = useForm<OrganizationFormValues>({
    resolver: zodResolver(organizationFormSchema),
    defaultValues: initialData ? {
      name: initialData.name.trim(),
      status: initialData.status,
      themeName: initialData.branding?.themeName || 'Default',
      logoUrl: initialData.branding?.logoUrl || '',
      bannerUrl: initialData.branding?.bannerUrl || '',
      organizationAdminUids: initialData.organizationAdminUids || [],
      clubs: initialData.clubs || [],
      logoInputType: initialData.branding?.logoUrl && !initialData.branding?.logoUrl.startsWith('gs://') && !initialData.branding?.logoUrl.includes('firebasestorage.googleapis.com') ? 'url' : 'upload',
      bannerInputType: initialData.branding?.bannerUrl && !initialData.branding?.bannerUrl.startsWith('gs://') && !initialData.branding?.bannerUrl.includes('firebasestorage.googleapis.com') ? 'url' : 'upload',
    } : {
      name: '',
      status: 'active',
      themeName: 'Default',
      logoUrl: '',
      bannerUrl: '',
      organizationAdminUids: [],
      clubs: [],
      logoInputType: 'url',
      bannerInputType: 'url',
    },
  });
  
  const watchedThemeName = form.watch('themeName');
  const watchedLogoInputType = form.watch('logoInputType');
  const watchedBannerInputType = form.watch('bannerInputType');
  const watchedClubs = form.watch('clubs');

  useEffect(() => {
    const themeToUse = watchedThemeName || 'Default';
    setCurrentThemeForPreview(themeToUse);
    setCurrentPaletteForPreview(THEME_PREVIEW_COLORS[themeToUse] || THEME_PREVIEW_COLORS['Default']);
  }, [watchedThemeName]);

  const eligibleAdmins = useMemo(() => {
    return allUsersForAdminSelection.filter(user =>
      user.roles.includes('admin') || user.roles.includes('Organization Admin')
    );
  }, [allUsersForAdminSelection]);

  // Super admins are always locked — shown as assigned but cannot be removed
  const lockedSuperAdmins = useMemo(() => {
    return eligibleAdmins.filter(user => user.roles.includes('admin'));
  }, [eligibleAdmins]);

  // Only non-super-admin users are selectable
  const selectableAdmins = useMemo(() => {
    return eligibleAdmins.filter(user => !user.roles.includes('admin'));
  }, [eligibleAdmins]);

  const filteredAdminUsers = useMemo(() => {
    if (!adminSearchQuery) return selectableAdmins;
    return selectableAdmins.filter(user =>
      (user.displayName?.toLowerCase() || '').includes(adminSearchQuery.toLowerCase()) ||
      (user.email?.toLowerCase() || '').includes(adminSearchQuery.toLowerCase())
    );
  }, [selectableAdmins, adminSearchQuery]);

  const handleAddClub = () => {
    const newClub = clubInputValue.trim();
    if (newClub && !watchedClubs?.includes(newClub)) {
      form.setValue('clubs', [...(watchedClubs || []), newClub].sort());
      setClubInputValue('');
    } else if (watchedClubs?.includes(newClub)) {
        toast({ title: "Club Exists", description: "This club name has already been added.", variant: "default" });
    }
  };

  const handleRemoveClub = (clubToRemove: string) => {
    form.setValue('clubs', watchedClubs?.filter(club => club !== clubToRemove) || []);
  };


  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>, type: 'logo' | 'banner') => {
    const file = event.target.files?.[0];
    if (file) {
      if (type === 'logo') {
        setLogoFile(file);
        setLogoUploadError(null);
        setLogoUploadProgress(0);
        form.setValue('logoUrl', ''); 
      } else {
        setBannerFile(file);
        setBannerUploadError(null);
        setBannerUploadProgress(0);
        form.setValue('bannerUrl', '');
      }
    }
  };

  const handleFileUpload = async (file: File, assetType: 'logo' | 'banner', orgId: string): Promise<string> => {
    const setProgress = assetType === 'logo' ? setLogoUploadProgress : setBannerUploadProgress;
    const setErrorState = assetType === 'logo' ? setLogoUploadError : setBannerUploadError;
    const setIsUploadingState = assetType === 'logo' ? setIsUploadingLogo : setIsUploadingBanner;
  
    setIsUploadingState(true);
    setErrorState(null);
    setProgress(0);
  
    const filePath = `organization_assets/${orgId}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
    const fileStorageRef = storageRef(storage, filePath);
  
    return new Promise((resolve, reject) => {
      const uploadTask = uploadBytesResumable(fileStorageRef, file);
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setProgress(progress);
        },
        (error) => {
          const firebaseStorageErrorMessages: Record<string, string> = {
            'storage/unauthorized': 'Permission denied. Check Firebase Storage rules.',
            'storage/canceled': 'Upload canceled by the user.',
            'storage/unknown': 'An unknown error occurred during upload.',
            'storage/object-not-found': 'File/object not found at the specified path.',
            'storage/bucket-not-found': 'Storage bucket not found. Check Firebase project setup.',
            'storage/project-not-found': 'Firebase project not found.',
            'storage/quota-exceeded': 'Storage quota exceeded.',
            'storage/unauthenticated': 'User is not authenticated. Please log in.',
            'storage/retry-limit-exceeded': 'Upload time limit exceeded. Please try again.',
          };
          const errorMessage = firebaseStorageErrorMessages[error.code] || error.message || `Failed to upload ${assetType}. Code: ${error.code || 'unknown'}`;
          
          setErrorState(errorMessage);
          setIsUploadingState(false);
          toast({ title: `${assetType === 'logo' ? 'Logo' : 'Banner'} Upload Failed`, description: errorMessage, variant: 'destructive' });
          console.error(`[${assetType}] Upload task error:`, error);
          reject(new Error(errorMessage));
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            setProgress(100);
            setIsUploadingState(false);
            resolve(downloadURL);
          } catch (getUrlError: any) {
            const errorMessageForGetUrl = getUrlError.message || `Failed to get download URL for ${assetType}.`;
            setErrorState(errorMessageForGetUrl);
            setIsUploadingState(false);
            toast({ title: `Error Getting ${assetType === 'logo' ? 'Logo' : 'Banner'} URL`, description: errorMessageForGetUrl, variant: 'destructive' });
            console.error(`[${assetType}] Error getting download URL:`, getUrlError);
            reject(new Error(errorMessageForGetUrl));
          }
        }
      );
    });
  };

  async function onSubmit(data: OrganizationFormValues) {
    setIsSubmitting(true);
    setLogoUploadError(null);
    setBannerUploadError(null);

    try {
      const orgId = isEditMode && initialData?.id ? initialData.id : doc(collection(db, 'organizations')).id;
      
      let finalLogoUrl = data.logoUrl;
      if (data.logoInputType === 'upload' && logoFile) {
        toast({ title: "Uploading Logo...", description: "Please wait." });
        finalLogoUrl = await handleFileUpload(logoFile, 'logo', orgId);
        form.setValue('logoUrl', finalLogoUrl);
      }
      
      let finalBannerUrl = data.bannerUrl;
      if (data.bannerInputType === 'upload' && bannerFile) {
        toast({ title: "Uploading Banner...", description: "Please wait." });
        finalBannerUrl = await handleFileUpload(bannerFile, 'banner', orgId);
        form.setValue('bannerUrl', finalBannerUrl);
      }

      const branding: OrganizationBranding = {
        themeName: data.themeName,
        logoUrl: finalLogoUrl || null,
        bannerUrl: finalBannerUrl || null,
      };

      const orgDataForFirestore = {
        name: data.name.trim(),
        status: data.status,
        branding,
        // Always preserve super admin UIDs — merge locked admins back in
        organizationAdminUids: [
          ...new Set([
            ...(data.organizationAdminUids || []),
            ...lockedSuperAdmins.map(u => u.uid),
          ])
        ],
        clubs: data.clubs || [],
      };

      if (isEditMode) {
        toast({ title: "Updating Organization...", description: "Submitting organization details." });
        const orgDocRef = doc(db, 'organizations', orgId);
        await updateDoc(orgDocRef, orgDataForFirestore);
        
        const oldAdminUids = initialData.organizationAdminUids || [];
        const newAdminUids = data.organizationAdminUids || [];
        const batch = writeBatch(db);
        const adminsToAdd = newAdminUids.filter(uid => !oldAdminUids.includes(uid));
        for (const uid of adminsToAdd) {
          const userProfile = await getUserProfileFromDB(uid);
          if (userProfile) {
            const userRef = doc(db, 'users', uid);
            let newRoles = userProfile.roles;
            if (!newRoles.includes('admin') && !newRoles.includes('Organization Admin')) {
              newRoles.push('Organization Admin');
              if (newRoles.includes('unassigned') && newRoles.length > 1) {
                newRoles = newRoles.filter(r => r !== 'unassigned');
              }
            }
            batch.update(userRef, { assignedOrganizationIds: arrayUnion(initialData.id), roles: newRoles });
          }
        }
        await batch.commit();

        toast({ title: `Organization Updated`, description: `${data.name} has been successfully updated.` });
        router.push(`/admin/organizations/${orgId}/details`);
      } else {
        toast({ title: "Creating Organization...", description: "Submitting organization details." });
        const newOrgRef = doc(db, 'organizations', orgId);
        await setDoc(newOrgRef, {
            ...orgDataForFirestore,
            createdAt: serverTimestamp(),
        });
        
        if (data.organizationAdminUids && data.organizationAdminUids.length > 0) {
          const batch = writeBatch(db);
          for (const uid of data.organizationAdminUids) {
            const userProfile = await getUserProfileFromDB(uid);
            if (userProfile) {
              const userRef = doc(db, 'users', uid);
              let newRoles = userProfile.roles;
              if (!newRoles.includes('admin') && !newRoles.includes('Organization Admin')) {
                newRoles.push('Organization Admin');
                if (newRoles.includes('unassigned') && newRoles.length > 1) {
                  newRoles = newRoles.filter(r => r !== 'unassigned');
                }
              }
              batch.update(userRef, { assignedOrganizationIds: arrayUnion(orgId), roles: newRoles });
            }
          }
          await batch.commit();
        }
        
        toast({ title: `Organization Created`, description: `${data.name} has been successfully created.` });
        router.push('/admin/organizations');
      }
      
      router.refresh();

    } catch (error: any) {
      if (!(error.message.includes("Upload Failed") || error.message.includes("Getting URL") || error.message.includes("Permission denied"))) {
         toast({ title: 'Operation Failed', description: error.message || 'An unexpected error occurred.', variant: 'destructive' });
      }
      console.error("Error in onSubmit of OrganizationForm:", error);
    } finally {
      setIsSubmitting(false);
    }
  }

  const disableSubmitButton = isSubmitting || isUploadingLogo || isUploadingBanner;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Organization Name</FormLabel>
              <FormControl><Input placeholder="e.g. SoCal Cricket Hub" {...field} disabled={disableSubmitButton} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select onValueChange={field.onChange} value={field.value} disabled={disableSubmitButton}>
                <FormControl><SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger></FormControl>
                <SelectContent>
                  {ORGANIZATION_STATUSES.map(status => (
                    <SelectItem key={status} value={status} className="capitalize">{status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="themeName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Theme</FormLabel>
              <Select 
                onValueChange={(value) => field.onChange(value as PredefinedThemeName)} 
                value={field.value || 'Default'} 
                disabled={disableSubmitButton}
              >
                <FormControl><SelectTrigger><SelectValue placeholder="Select a theme" /></SelectTrigger></FormControl>
                <SelectContent>
                  {PREDEFINED_THEME_NAMES.map(theme => (
                    <SelectItem key={theme} value={theme}>{theme}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>Select a base theme for the organization's appearance.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        
        {currentThemeForPreview && currentPaletteForPreview && (
          <ThemePreviewInternal colors={currentPaletteForPreview} themeName={currentThemeForPreview} />
        )}

        <FormField
          control={form.control}
          name="logoInputType"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <div className="flex justify-between items-center">
                <FormLabel>Organization Logo</FormLabel>
                {(form.getValues('logoUrl') || logoFile) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive h-auto p-1 text-xs"
                    onClick={() => {
                      form.setValue('logoUrl', '');
                      setLogoFile(null);
                    }}
                    disabled={disableSubmitButton}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Remove Logo
                  </Button>
                )}
              </div>
              <FormControl>
                <RadioGroup
                  onValueChange={(value) => {
                    field.onChange(value as 'url' | 'upload');
                    if (value === 'url') { setLogoFile(null); setLogoUploadProgress(0); setLogoUploadError(null); }
                    else form.setValue('logoUrl', initialData?.branding?.logoUrl || ''); 
                  }}
                  value={field.value}
                  className="flex space-x-4"
                  disabled={disableSubmitButton}
                >
                  <FormItem className="flex items-center space-x-2 space-y-0">
                    <FormControl><RadioGroupItem value="url" id="logo-url" /></FormControl>
                    <FormLabel htmlFor="logo-url" className="font-normal flex items-center gap-1"><LinkIcon className="h-4 w-4"/>Enter URL</FormLabel>
                  </FormItem>
                  <FormItem className="flex items-center space-x-2 space-y-0">
                    <FormControl><RadioGroupItem value="upload" id="logo-upload" /></FormControl>
                    <FormLabel htmlFor="logo-upload" className="font-normal flex items-center gap-1"><UploadCloud className="h-4 w-4"/>Upload Image</FormLabel>
                  </FormItem>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {watchedLogoInputType === 'url' ? (
          <FormField
            control={form.control}
            name="logoUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="sr-only">Logo URL</FormLabel>
                <FormControl><Input type="url" placeholder="https://example.com/logo.png" {...field} value={field.value || ''} disabled={disableSubmitButton} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : (
          <FormItem>
            <FormLabel className="sr-only">Upload Logo</FormLabel>
            <FormControl><Input type="file" accept="image/png, image/jpeg, image/svg+xml" onChange={(e) => handleFileSelect(e, 'logo')} disabled={disableSubmitButton || isUploadingLogo} className="file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" /></FormControl>
            {logoFile && <p className="text-xs text-muted-foreground mt-1">Selected: {logoFile.name} ({ (logoFile.size / 1024).toFixed(1) } KB)</p>}
            {isUploadingLogo && <Progress value={logoUploadProgress} className="w-full h-2 mt-1" />}
            {logoUploadError && <p className="text-xs text-destructive mt-1">{logoUploadError}</p>}
            {!isUploadingLogo && form.getValues('logoUrl') && <p className="text-xs text-green-600 mt-1">Current Logo URL: <a href={form.getValues('logoUrl')} target="_blank" rel="noopener noreferrer" className="underline truncate block max-w-xs">{form.getValues('logoUrl')}</a></p>}
            <FormDescription>Recommended: Square (e.g., 200x200px), PNG/JPG/SVG, max 1MB.</FormDescription>
            <FormMessage />
          </FormItem>
        )}

         <FormField
          control={form.control}
          name="bannerInputType"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <div className="flex justify-between items-center">
                <FormLabel>Organization Banner</FormLabel>
                 {(form.getValues('bannerUrl') || bannerFile) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive h-auto p-1 text-xs"
                    onClick={() => {
                      form.setValue('bannerUrl', '');
                      setBannerFile(null);
                    }}
                    disabled={disableSubmitButton}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Remove Banner
                  </Button>
                )}
              </div>
              <FormControl>
                <RadioGroup
                  onValueChange={(value) => {
                     field.onChange(value as 'url' | 'upload');
                     if (value === 'url') { setBannerFile(null); setBannerUploadProgress(0); setBannerUploadError(null); }
                     else form.setValue('bannerUrl', initialData?.branding?.bannerUrl || '');
                  }}
                  value={field.value}
                  className="flex space-x-4"
                  disabled={disableSubmitButton}
                >
                  <FormItem className="flex items-center space-x-2 space-y-0">
                    <FormControl><RadioGroupItem value="url" id="banner-url" /></FormControl>
                    <FormLabel htmlFor="banner-url" className="font-normal flex items-center gap-1"><LinkIcon className="h-4 w-4"/>Enter URL</FormLabel>
                  </FormItem>
                  <FormItem className="flex items-center space-x-2 space-y-0">
                    <FormControl><RadioGroupItem value="upload" id="banner-upload" /></FormControl>
                    <FormLabel htmlFor="banner-upload" className="font-normal flex items-center gap-1"><UploadCloud className="h-4 w-4"/>Upload Image</FormLabel>
                  </FormItem>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {watchedBannerInputType === 'url' ? (
          <FormField
            control={form.control}
            name="bannerUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="sr-only">Banner URL</FormLabel>
                <FormControl><Input type="url" placeholder="https://example.com/banner.png" {...field} value={field.value || ''} disabled={disableSubmitButton} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : (
           <FormItem>
            <FormLabel className="sr-only">Upload Banner</FormLabel>
            <FormControl><Input type="file" accept="image/png, image/jpeg" onChange={(e) => handleFileSelect(e, 'banner')} disabled={disableSubmitButton || isUploadingBanner} className="file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" /></FormControl>
            {bannerFile && <p className="text-xs text-muted-foreground mt-1">Selected: {bannerFile.name} ({ (bannerFile.size / 1024).toFixed(1) } KB)</p>}
            {isUploadingBanner && <Progress value={bannerUploadProgress} className="w-full h-2 mt-1" />}
            {bannerUploadError && <p className="text-xs text-destructive mt-1">{bannerUploadError}</p>}
            {!isUploadingBanner && form.getValues('bannerUrl') && <p className="text-xs text-green-600 mt-1">Current Banner URL: <a href={form.getValues('bannerUrl')} target="_blank" rel="noopener noreferrer" className="underline truncate block max-w-xs">{form.getValues('bannerUrl')}</a></p>}
            <FormDescription>Recommended: Wide (e.g., 1200x300px), PNG/JPG, max 2MB.</FormDescription>
            <FormMessage />
          </FormItem>
        )}

        <div className="space-y-4">
            <FormLabel className="text-base flex items-center gap-2"><ShieldPlus className="h-5 w-5"/> Manage Affiliated Clubs</FormLabel>
            <FormDescription>Define the list of clubs that belong to this organization. These can be assigned to teams.</FormDescription>
            <div className="flex gap-2">
                <Input
                    type="text"
                    placeholder="Enter new club name"
                    value={clubInputValue}
                    onChange={(e) => setClubInputValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddClub(); } }}
                    className="flex-grow"
                    disabled={disableSubmitButton}
                />
                <Button type="button" variant="outline" onClick={handleAddClub} disabled={disableSubmitButton || !clubInputValue.trim()}>
                    <PlusCircle className="mr-2 h-4 w-4"/> Add Club
                </Button>
            </div>
             {watchedClubs && watchedClubs.length > 0 && (
                <div className="space-y-2 pt-2">
                    <p className="text-sm font-medium">Current Clubs:</p>
                    <div className="flex flex-wrap gap-2">
                        {watchedClubs.map(club => (
                            <Badge key={club} variant="secondary" className="flex items-center gap-1 text-sm">
                                {club}
                                <button
                                    type="button"
                                    onClick={() => handleRemoveClub(club)}
                                    className="ml-1 rounded-full p-0.5 text-secondary-foreground/50 hover:bg-destructive/20 hover:text-destructive"
                                    aria-label={`Remove ${club}`}
                                    disabled={disableSubmitButton}
                                >
                                    <X className="h-3 w-3"/>
                                </button>
                            </Badge>
                        ))}
                    </div>
                </div>
            )}
        </div>


        <FormField
          control={form.control}
          name="organizationAdminUids"
          render={() => (
            <FormItem>
              <div className="mb-2">
                <FormLabel className="text-base">Assign Organization Administrators (Optional)</FormLabel>
                <FormDescription>Select users with 'Organization Admin' role to manage this organization. Super admins are always included and cannot be removed.</FormDescription>
              </div>

              {/* Locked super admins — always shown as assigned */}
              {lockedSuperAdmins.length > 0 && (
                <div className="rounded-md border bg-muted/30 p-2 mb-2 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground px-1 pb-1">Super Admins (always assigned — cannot be removed)</p>
                  {lockedSuperAdmins.map(user => (
                    <div key={user.uid} className="flex items-center gap-2 px-2 py-1 rounded opacity-70">
                      <Checkbox checked disabled />
                      <span className="text-sm flex-grow">{user.displayName || user.email}</span>
                      <Badge variant="default" className="text-xs">Super Admin</Badge>
                    </div>
                  ))}
                </div>
              )}

              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search users by name or email..."
                  value={adminSearchQuery}
                  onChange={(e) => setAdminSearchQuery(e.target.value)}
                  className="pl-8 h-9"
                  disabled={disableSubmitButton}
                />
              </div>
              {selectableAdmins.length === 0 ? (
                <p className="text-sm text-muted-foreground">No users with 'Organization Admin' role found.</p>
              ) : filteredAdminUsers.length === 0 && adminSearchQuery ? (
                 <p className="text-sm text-muted-foreground">No eligible administrators found matching your search.</p>
              ) : (
                <ScrollArea className="h-48 rounded-md border p-2">
                  <div className="space-y-1.5">
                    {filteredAdminUsers.map((user) => {
                      const alreadyInDifferentOrg =
                        isEditMode &&
                        (user.assignedOrganizationIds || []).length > 0 &&
                        !(user.assignedOrganizationIds || []).includes(initialData?.id || '');
                      return (
                      <FormField
                        key={user.uid}
                        control={form.control}
                        name="organizationAdminUids"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center space-x-3 space-y-0 py-1 hover:bg-muted/50 rounded px-2">
                            <FormControl>
                              <Checkbox
                                checked={field.value?.includes(user.uid)}
                                onCheckedChange={(checked) => {
                                  const currentUids = field.value || [];
                                  return checked
                                    ? field.onChange([...currentUids, user.uid])
                                    : field.onChange(currentUids.filter(uid => uid !== user.uid));
                                }}
                                disabled={disableSubmitButton}
                              />
                            </FormControl>
                            <FormLabel className="font-normal text-sm cursor-pointer flex-grow">
                              {user.displayName || user.email}
                              <span className="text-muted-foreground ml-1">({user.roles.filter(r => r !== 'admin').join(', ')})</span>
                              {alreadyInDifferentOrg && (
                                <span className="ml-2 text-xs text-amber-600 font-normal">⚠ already in another org</span>
                              )}
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full sm:w-auto bg-primary hover:bg-primary/90" disabled={disableSubmitButton}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditMode
            ? (isSubmitting ? 'Saving...' : 'Save Changes') 
            : (isSubmitting ? 'Creating...' : 'Create Organization')}
        </Button>
      </form>
    </Form>
  );
}
