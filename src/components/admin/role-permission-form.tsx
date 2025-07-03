// src/components/admin/role-permission-form.tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormDescription } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import type { UserRole, PermissionKey } from '@/types';
import { PERMISSIONS, PERMISSION_CATEGORIES, PERMISSION_DESCRIPTIONS, PermissionCategory } from '@/lib/permissions-master-list';
import { db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getRolePermissionsFromDB } from '@/lib/db';
import { useState, useEffect, useMemo } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useRouter } from 'next/navigation';

// Function to create the Zod schema for permissions.
// It's defined outside the component so it can be memoized effectively if needed,
// or called by useMemo without capturing component scope.
const generatePermissionsSchema = () => {
  const shape: Record<PermissionKey, z.ZodBoolean> = {} as Record<PermissionKey, z.ZodBoolean>;
  // Iterate over the actual permission string values from the PERMISSIONS object
  (Object.values(PERMISSIONS) as PermissionKey[]).forEach(permKey => {
    shape[permKey] = z.boolean().default(false);
  });
  return z.object(shape);
};

type RolePermissionFormValues = z.infer<ReturnType<typeof generatePermissionsSchema>>;

interface RolePermissionFormProps {
  roleName: UserRole;
}

export function RolePermissionForm({ roleName }: RolePermissionFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(true);

  // Memoize the schema to ensure it's stable across re-renders.
  // generatePermissionsSchema has no dependencies on component state/props.
  const permissionsSchema = useMemo(() => generatePermissionsSchema(), []);

  // Memoize the initial 'all false' state.
  // This depends only on PERMISSIONS (a constant import), so it's stable.
  const allPermissionsFalse = useMemo(() => {
    const initial: Partial<RolePermissionFormValues> = {};
    (Object.values(PERMISSIONS) as PermissionKey[]).forEach(permKey => {
      initial[permKey] = false;
    });
    return initial as RolePermissionFormValues;
  }, []);

  const form = useForm<RolePermissionFormValues>({
    resolver: zodResolver(permissionsSchema),
    defaultValues: allPermissionsFalse, // Initialize with all false
  });

  useEffect(() => {
    async function fetchPermissions() {
      if (roleName) {
        setIsLoadingPermissions(true);
        try {
          const fetchedPermissions = await getRolePermissionsFromDB(roleName);
          // Start with a base of all known permissions set to false
          const currentDefaults = { ...allPermissionsFalse };

          if (fetchedPermissions) {
            // Overlay fetched permissions onto the defaults
            // Iterate over known permission keys to ensure only valid ones are applied
            (Object.values(PERMISSIONS) as PermissionKey[]).forEach(permKey => {
              if (Object.prototype.hasOwnProperty.call(fetchedPermissions, permKey)) {
                currentDefaults[permKey] = !!fetchedPermissions[permKey]; // Ensure boolean
              }
            });
          }
          form.reset(currentDefaults); // Reset form with merged values
        } catch (error) {
            console.error(`Error fetching permissions for role ${roleName}:`, error);
            toast({
                title: 'Error Loading Permissions',
                description: `Could not load permissions for ${roleName}. Please try again.`,
                variant: 'destructive',
            });
            form.reset(allPermissionsFalse); // Reset to all false on error
        } finally {
            setIsLoadingPermissions(false);
        }
      } else {
        // If no roleName, ensure form is reset and not loading
        form.reset(allPermissionsFalse);
        setIsLoadingPermissions(false);
      }
    }
    fetchPermissions();
  }, [roleName, form, allPermissionsFalse, toast]); // form and allPermissionsFalse are stable due to memoization

  async function onSubmit(data: RolePermissionFormValues) {
    setIsSubmitting(true);
    try {
      if (!roleName) {
        throw new Error("Role name is required.");
      }
      const configRef = doc(db, 'role_permissions_config', roleName);
      await setDoc(configRef, {
        roleName: roleName,
        permissions: data,
        lastUpdatedAt: serverTimestamp(),
      });
      toast({
        title: `Permissions Saved for '${roleName}'`,
        description: "The permission configuration has been successfully updated.",
      });
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
       toast({
        title: 'Error Saving Permissions',
        description: message,
        variant: 'destructive',
      });
      console.error(`Error saving permissions for role ${roleName}:`, error);
    } finally {
      setIsSubmitting(false);
    }
  }

  // PERMISSION_CATEGORIES is a constant import, so permissionKeysByCategory is stable if memoized.
  const permissionKeysByCategory = useMemo(() =>
    Object.entries(PERMISSION_CATEGORIES) as [PermissionCategory, typeof PERMISSION_CATEGORIES[PermissionCategory]][]
  , []);

  if (isLoadingPermissions) {
    return (
        <div className="flex items-center justify-center py-10">
            <Loader2 className="mr-2 h-6 w-6 animate-spin" />
            <p className="text-muted-foreground">Loading permissions...</p>
        </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Accordion type="multiple" className="w-full" defaultValue={permissionKeysByCategory.map(([key]) => key)}>
          {permissionKeysByCategory.map(([categoryKey, categoryData]) => (
            <AccordionItem value={categoryKey} key={categoryKey}>
              <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                {categoryData.label} ({categoryData.permissions.length})
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3 pt-2">
                  {(categoryData.permissions as PermissionKey[]).map((permissionKey) => (
                    <FormField
                      key={permissionKey}
                      control={form.control}
                      name={permissionKey} // This should be the actual permission string
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0 p-2 rounded-md hover:bg-muted/50 border border-transparent hover:border-border transition-colors">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={isSubmitting}
                            />
                          </FormControl>
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm font-normal leading-none cursor-pointer">
                              {PERMISSION_DESCRIPTIONS[permissionKey] || permissionKey}
                            </FormLabel>
                            <FormDescription className="text-xs">
                              ({permissionKey})
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <Button type="submit" disabled={isSubmitting || isLoadingPermissions} className="w-full sm:w-auto">
          {(isSubmitting) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSubmitting ? 'Saving...' : <><Save className="mr-2 h-4 w-4" /> Save Permissions</>}
        </Button>
      </form>
    </Form>
  );
}
