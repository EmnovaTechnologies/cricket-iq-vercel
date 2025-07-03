
// src/lib/actions/permission-actions.ts
'use client'; // Changed from 'use server' to run on client

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { UserRole, PermissionKey, UserProfile } from '../../types';
import { PERMISSIONS, PERMISSION_CATEGORIES, PERMISSION_DESCRIPTIONS, PermissionCategory } from '../permissions-master-list';
import { getRolePermissionsFromDB } from '../db'; // Import from db.ts

// --- Role Permission Config Actions ---
// saveRolePermissionsAction removed as logic is now client-side in the form component

/**
 * Calculates the effective permissions for a given user profile by merging
 * permissions from all their assigned roles.
 * @param userProfile The user profile object containing their roles.
 * @returns A record of all permission keys and their effective boolean value.
 */
export async function calculateEffectivePermissions(userProfile: UserProfile): Promise<Record<PermissionKey, boolean>> {
  const isAdminUser = Array.isArray(userProfile.roles) && userProfile.roles.includes('admin');
  
  let calculated: Record<PermissionKey, boolean> = {} as Record<PermissionKey, boolean>;
  const allPermissionKeys = Object.values(PERMISSIONS) as PermissionKey[];

  // Initialize all known permissions to false
  allPermissionKeys.forEach(permKey => {
    calculated[permKey] = false;
  });

  if (isAdminUser) {
    // If user is an admin, grant all permissions
    allPermissionKeys.forEach(permKey => {
      calculated[permKey] = true;
    });
  } else {
    // If not an admin, fetch and merge permissions for each role
    if (Array.isArray(userProfile.roles) && userProfile.roles.length > 0) {
      const permissionPromises = userProfile.roles.map(role => getRolePermissionsFromDB(role as UserRole));
      const rolePermissionsArray = await Promise.all(permissionPromises);

      rolePermissionsArray.forEach((rolePerms, index) => {
        const roleName = userProfile.roles[index];

        // --- Failsafe default permissions for core roles ---
        if (!rolePerms || Object.keys(rolePerms).length === 0) {
            console.log(`No custom permissions found for role '${roleName}'. Applying hardcoded defaults.`);
            if (roleName === 'Organization Admin') {
                rolePerms = {
                    [PERMISSIONS.PAGE_VIEW_DASHBOARD]: true, [PERMISSIONS.PAGE_VIEW_SERIES_LIST]: true,
                    [PERMISSIONS.PAGE_VIEW_SERIES_DETAILS]: true, [PERMISSIONS.PAGE_VIEW_GAMES_LIST]: true,
                    [PERMISSIONS.PAGE_VIEW_GAME_DETAILS]: true, [PERMISSIONS.PAGE_VIEW_GAME_RATE_ENHANCED]: true,
                    [PERMISSIONS.PAGE_VIEW_TEAMS_LIST]: true, [PERMISSIONS.PAGE_VIEW_TEAM_DETAILS]: true,
                    [PERMISSIONS.PAGE_VIEW_PLAYERS_LIST]: true, [PERMISSIONS.PAGE_VIEW_PLAYER_DETAILS]: true,
                    [PERMISSIONS.PAGE_VIEW_VENUES_LIST]: true, [PERMISSIONS.PAGE_VIEW_TEAM_COMPOSITION]: true,
                    [PERMISSIONS.PAGE_VIEW_ADMIN_USERS_LIST]: true, [PERMISSIONS.PAGE_VIEW_ADMIN_ORGANIZATION_DETAILS]: true,
                    [PERMISSIONS.PAGE_VIEW_ADMIN_ORGANIZATION_BILLING]: true, [PERMISSIONS.AI_USE_TEAM_COMPOSITION]: true,
                    [PERMISSIONS.USERS_VIEW_LIST_ASSIGNED_ORG]: true, [PERMISSIONS.USERS_MANAGE_ROLES_ASSIGNED_ORG]: true,
                    [PERMISSIONS.VENUES_DELETE_ANY]: true,
                    [PERMISSIONS.SERIES_ADD]: true, // Added permission
                };
            } else if (roleName === 'Series Admin') {
                rolePerms = {
                    [PERMISSIONS.PAGE_VIEW_DASHBOARD]: true, [PERMISSIONS.PAGE_VIEW_SERIES_LIST]: true,
                    [PERMISSIONS.PAGE_VIEW_SERIES_DETAILS]: true, [PERMISSIONS.PAGE_VIEW_GAMES_LIST]: true,
                    [PERMISSIONS.PAGE_VIEW_GAME_DETAILS]: true, [PERMISSIONS.PAGE_VIEW_GAME_RATE_ENHANCED]: true,
                    [PERMISSIONS.PAGE_VIEW_TEAMS_LIST]: true, [PERMISSIONS.PAGE_VIEW_TEAM_DETAILS]: true,
                    [PERMISSIONS.PAGE_VIEW_TEAM_ADD]: true, [PERMISSIONS.PAGE_VIEW_PLAYERS_LIST]: true,
                    [PERMISSIONS.PAGE_VIEW_PLAYER_DETAILS]: true, [PERMISSIONS.PAGE_VIEW_VENUES_LIST]: true,
                    [PERMISSIONS.PAGE_VIEW_VENUE_ADD]: true, [PERMISSIONS.PAGE_VIEW_TEAM_COMPOSITION]: true,
                    [PERMISSIONS.AI_USE_TEAM_COMPOSITION]: true, [PERMISSIONS.SERIES_MANAGE_TEAMS_ASSIGNED]: true,
                    [PERMISSIONS.SERIES_MANAGE_VENUES_ASSIGNED]: true, [PERMISSIONS.GAMES_ADD_TO_ANY_SERIES]: true,
                    [PERMISSIONS.SERIES_ARCHIVE_ASSIGNED]: true, [PERMISSIONS.SERIES_UNARCHIVE_ASSIGNED]: true,
                };
            } else if (roleName === 'Team Manager') {
                rolePerms = {
                    [PERMISSIONS.PAGE_VIEW_DASHBOARD]: true, [PERMISSIONS.PAGE_VIEW_TEAMS_LIST]: true,
                    [PERMISSIONS.PAGE_VIEW_TEAM_DETAILS]: true, [PERMISSIONS.TEAMS_MANAGE_ROSTER_ASSIGNED]: true,
                    [PERMISSIONS.PAGE_VIEW_PLAYERS_LIST]: true, [PERMISSIONS.PAGE_VIEW_PLAYER_DETAILS]: true,
                };
            } else if (roleName === 'selector') {
                rolePerms = {
                    [PERMISSIONS.PAGE_VIEW_DASHBOARD]: true, [PERMISSIONS.PAGE_VIEW_GAMES_LIST]: true,
                    [PERMISSIONS.PAGE_VIEW_GAME_RATE_ENHANCED]: true, [PERMISSIONS.PAGE_VIEW_PLAYER_DETAILS]: true,
                    [PERMISSIONS.GAMES_RATE_ASSIGNED]: true, [PERMISSIONS.GAMES_CERTIFY_OWN_RATINGS_ASSIGNED]: true,
                };
            } else if (roleName === 'player') {
                rolePerms = { [PERMISSIONS.PLAYER_VIEW_OWN_PROFILE]: true, [PERMISSIONS.PAGE_VIEW_DASHBOARD]: true };
            }
        }
        
        if (rolePerms) {
          for (const key in rolePerms) {
            const permKey = key as PermissionKey;
            if (calculated.hasOwnProperty(permKey)) {
              calculated[permKey] = calculated[permKey] || rolePerms[permKey];
            }
          }
        }
      });
    }
  }

  return calculated;
}
