
'use client';

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
  collection,
  getDocs,
  updateDoc,
  query,
  where,
  arrayUnion,
  arrayRemove,
  orderBy,
  writeBatch,
  deleteField,
  limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserProfile, UserRole, Organization, Player } from '@/types';
import { getOrganizationByIdFromDB, getPlayerByIdFromDB, getAllUsersFromDB } from '@/lib/db';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { calculateEffectivePermissions } from '@/lib/actions/permission-actions';

export async function runRoleUpdateDiagnostic(targetUserId: string, newRoles: UserRole[]): Promise<{ success: boolean; message: string }> {
    let logMessage = '[SERVER DIAGNOSTIC] Action runRoleUpdateDiagnostic log:\n';

    try {
        logMessage += `1. Received request to update user ${targetUserId} with new roles: [${newRoles.join(', ')}]\n`;

        const targetUserProfile = await getUserProfile(targetUserId);

        if (!targetUserProfile) {
            logMessage += `2. FATAL ERROR: Could not fetch profile for user ${targetUserId}. Cannot proceed.\n`;
            console.error(logMessage);
            return { success: false, message: logMessage };
        }

        const currentUserRoles = targetUserProfile.roles || [];
        logMessage += `3. Fetched current roles from DB for ${targetUserId}: [${currentUserRoles.join(', ')}]\n`;
        
        const wasOrgAdmin = currentUserRoles.includes('Organization Admin'); // Corrected case
        const isNowOrgAdmin = newRoles.includes('Organization Admin');       // Corrected case
        const isRemovingOrgAdminRole = wasOrgAdmin && !isNowOrgAdmin;

        logMessage += `4. Comparison Logic:\n`;
        logMessage += `   - Was 'Organization Admin'? ${wasOrgAdmin}\n`;
        logMessage += `   - Is now 'Organization Admin'? ${isNowOrgAdmin}\n`;
        logMessage += `   - Is role being removed? (wasOrgAdmin && !isNowOrgAdmin) -> ${isRemovingOrgAdminRole}\n`;

        if (isRemovingOrgAdminRole) {
            logMessage += `5. Role removal detected. Proceeding to check if user is the last admin of any organization.\n`;
             const orgsQuery = query(
                collection(db, 'organizations'),
                where('organizationAdminUids', 'array-contains', targetUserId)
            );
            const orgsSnapshot = await getDocs(orgsQuery);
            const orgsAsAdmin = orgsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Organization));
            logMessage += `6. Found ${orgsAsAdmin.length} organization(s) where this user is an admin: [${orgsAsAdmin.map(o => o.name).join(', ')}]\n`;

             if (orgsAsAdmin.length > 0) {
                let isLastAdminOfAnyOrg = false;
                for (const org of orgsAsAdmin) {
                    logMessage += `   - Checking org "${org.name}"... Admins count: ${org.organizationAdminUids.length}.\n`;
                    if (org.organizationAdminUids.length === 1) {
                        isLastAdminOfAnyOrg = true;
                        logMessage += `   - CHECK FAILED: User is the last admin for organization "${org.name}". Operation would be blocked.\n`;
                    }
                }
                logMessage += `7. CHECK COMPLETE: isLastAdminOfAnyOrg=${isLastAdminOfAnyOrg}. Finished checking all organizations.\n`;
            } else {
                 logMessage += `7. CHECK NOTE: User is not an admin of any organizations, so removal is safe.\n`;
            }
        } else {
            logMessage += `5. Role removal was not detected. Skipping last admin check.\n`;
        }
        
        logMessage += `8. Diagnostic complete. No database changes were made.`;
        return { success: true, message: logMessage };

    } catch (e: any) {
        logMessage += `\nCRITICAL ERROR during diagnostic run: ${e.message}`;
        console.error(logMessage, e);
        return { success: false, message: logMessage };
    }
}


export async function updateUserRolesAction(
  targetUserId: string,
  newRoles: UserRole[],
  currentUserId: string,
  organizationIdContext: string | null
): Promise<{ success: boolean; message: string }> {
  if (!currentUserId) {
    return { success: false, message: 'Current user not authenticated.' };
  }
  if (!targetUserId) {
    return { success: false, message: 'Target user not specified.' };
  }
  if (!newRoles || newRoles.length === 0) {
    newRoles = ['unassigned'];
  }

  try {
    const [currentUserProfile, targetUserProfile] = await Promise.all([
      getUserProfile(currentUserId),
      getUserProfile(targetUserId),
    ]);

    if (!currentUserProfile) {
      return { success: false, message: 'Could not load your user profile.' };
    }
    if (!targetUserProfile) {
      return { success: false, message: 'Could not load the target user profile.' };
    }

    const currentUserPermissions = await calculateEffectivePermissions(currentUserProfile);
    const isSuperAdmin = currentUserPermissions[PERMISSIONS.USERS_MANAGE_ROLES_ANY];

    if (!isSuperAdmin && !currentUserPermissions[PERMISSIONS.USERS_MANAGE_ROLES_ASSIGNED_ORG]) {
      return { success: false, message: 'You do not have permission to manage user roles.' };
    }

    // A non-super-admin cannot edit a super-admin's roles
    if (targetUserProfile.roles.includes('admin') && !isSuperAdmin) {
      return { success: false, message: 'You cannot change the roles of a super admin.' };
    }

    // A non-super-admin cannot grant the 'admin' role
    if (newRoles.includes('admin') && !isSuperAdmin) {
      return { success: false, message: "You do not have permission to grant the 'admin' role." };
    }

    // The logic to check if a role is being removed
    const wasOrgAdmin = targetUserProfile.roles.includes('Organization Admin');
    const isNowOrgAdmin = newRoles.includes('Organization Admin');
    const isRemovingOrgAdminRole = wasOrgAdmin && !isNowOrgAdmin;

    // A collection to store organizations where the user was an admin
    let orgsWhereUserWasAdmin: Organization[] = [];
    if (isRemovingOrgAdminRole) {
      const orgsQuery = query(
        collection(db, 'organizations'),
        where('organizationAdminUids', 'array-contains', targetUserId)
      );
      const orgsSnapshot = await getDocs(orgsQuery);
      orgsWhereUserWasAdmin = orgsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Organization));

      // Check if the user is the last admin for any of these organizations
      for (const org of orgsWhereUserWasAdmin) {
        if (org.organizationAdminUids.length === 1) {
          return {
            success: false,
            message: `Cannot remove role: User is the last 'Organization Admin' for "${org.name}". Please assign another admin to that organization first.`
          };
        }
      }
    }
    
    // If all checks pass, proceed with updates
    const targetUserDocRef = doc(db, 'users', targetUserId);
    const batch = writeBatch(db);

    batch.update(targetUserDocRef, { roles: newRoles });
    
    // If the Organization Admin role was removed, also remove them from the UIDs list on each org document
    if (isRemovingOrgAdminRole) {
      for (const org of orgsWhereUserWasAdmin) {
        const orgRef = doc(db, 'organizations', org.id);
        batch.update(orgRef, { organizationAdminUids: arrayRemove(targetUserId) });
      }
    }

    await batch.commit();

    return { success: true, message: `User roles for ${targetUserProfile.displayName || targetUserProfile.email} updated successfully.` };

  } catch (error) {
    console.error("Error updating user roles:", error);
    const message = error instanceof Error ? error.message : "An unexpected error occurred.";
    return { success: false, message: `Failed to update roles: ${message}` };
  }
}



// --- Other User Actions ---

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (!uid) return null;
  try {
    const userDocRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists()) {
      const data = userSnap.data();
      const createdAtTimestamp = data.createdAt as Timestamp | undefined;
      const lastLoginTimestamp = data.lastLogin as Timestamp | undefined;

      const assignedOrganizationIds = data.assignedOrganizationIds || [];
      const activeOrganizationId = data.activeOrganizationId || null;
      
      let playerId: string | null = null;
      if (data.roles?.includes('player')) {
        const playerQuery = query(collection(db, 'players'), where('userId', '==', uid), limit(1));
        const playerSnapshot = await getDocs(playerQuery);
        if (!playerSnapshot.empty) {
          playerId = playerSnapshot.docs[0].id;
        }
      }

      return {
        uid: data.uid,
        email: data.email,
        displayName: data.displayName || null,
        roles: data.roles || ['unassigned'],
        activeOrganizationId: activeOrganizationId,
        assignedOrganizationIds: assignedOrganizationIds,
        assignedSeriesIds: data.assignedSeriesIds || [],
        assignedTeamIds: data.assignedTeamIds || [],
        assignedGameIds: data.assignedGameIds || [],
        createdAt: createdAtTimestamp?.toDate?.().toISOString() || null,
        lastLogin: lastLoginTimestamp?.toDate?.().toISOString() || null,
        phoneNumber: data.phoneNumber || null,
        playerId: playerId,
      };
    }
    return null;
  } catch (error) {
    console.error(`[getUserProfile] Error fetching user profile for UID ${uid}:`, error);
    return null;
  }
}

export async function createUserProfile(
  uid: string,
  email: string | null,
  displayName?: string | null,
  phoneNumber?: string | null,
  targetOrgId?: string | null,
  registrationToken?: string | null
): Promise<UserProfile> {
  console.log('[createUserProfile] Starting profile creation for UID:', uid);
  const userDocRef = doc(db, 'users', uid);
  const batch = writeBatch(db);

  let userRoles: UserRole[] = [];
  let assignedOrganizationIds: string[] = [];
  let activeOrganizationId: string | null = null;
  let playerId: string | null = null;

  // Handle special admin user assignment first to ensure it takes precedence
  if (email === 'mpilkhane@gmail.com') {
    console.log('[createUserProfile] Special case: Assigning admin role to mpilkhane@gmail.com');
    userRoles = ['admin'];
    // No orgs assigned to super admin by default
  } else if (registrationToken) {
    console.log('[createUserProfile] Found registration token:', registrationToken);
    const playerQuery = query(
      collection(db, 'players'),
      where('registrationToken', '==', registrationToken),
      where('registrationTokenExpires', '>', new Date())
    );
    const playerSnapshot = await getDocs(playerQuery);
    if (!playerSnapshot.empty) {
      const playerDoc = playerSnapshot.docs[0];
      const player = { id: playerDoc.id, ...playerDoc.data() } as Player;
      console.log('[createUserProfile] Matched registration token to player:', player.id);
      
      userRoles = ['player'];
      playerId = player.id;
      if (player.organizationId) {
        assignedOrganizationIds = [player.organizationId];
        activeOrganizationId = player.organizationId;
      }
      
      batch.update(playerDoc.ref, { 
        userId: uid,
        registrationToken: deleteField(),
        registrationTokenExpires: deleteField(),
      });
    } else {
      console.log('[createUserProfile] Registration token was invalid or expired.');
      userRoles = ['unassigned'];
    }
  } else if (targetOrgId) {
    console.log('[createUserProfile] No token, but found targetOrgId from session storage:', targetOrgId);
    userRoles = ['unassigned'];
    const organization = await getOrganizationByIdFromDB(targetOrgId);
    if (organization && organization.status === 'active') {
      assignedOrganizationIds = [targetOrgId];
      activeOrganizationId = targetOrgId;
      console.log('[createUserProfile] Assigned user to organization:', targetOrgId);
    }
  } else {
    // Default case for any other user
    userRoles = ['unassigned'];
  }

  // Final cleanup of roles array
  if (userRoles.length === 0) {
    userRoles.push('unassigned');
  } else if (userRoles.length > 1) {
    userRoles = userRoles.filter(role => role !== 'unassigned');
  }
  
  console.log('[createUserProfile] Final roles for new user:', userRoles);

  const userProfileDataForFirestore = {
    uid,
    email,
    displayName: displayName || null,
    roles: userRoles,
    activeOrganizationId: activeOrganizationId,
    assignedOrganizationIds: assignedOrganizationIds,
    assignedSeriesIds: [],
    assignedTeamIds: [],
    assignedGameIds: [],
    createdAt: serverTimestamp(),
    lastLogin: serverTimestamp(),
    phoneNumber: phoneNumber || null,
  };

  batch.set(userDocRef, userProfileDataForFirestore);
  console.log('[createUserProfile] Committing user profile to Firestore...');
  await batch.commit();
  console.log('[createUserProfile] Firestore commit successful.');

  const result: UserProfile = {
    uid,
    email,
    displayName: displayName || null,
    roles: userRoles,
    activeOrganizationId: activeOrganizationId,
    assignedOrganizationIds: assignedOrganizationIds,
    assignedSeriesIds: [],
    assignedTeamIds: [],
    assignedGameIds: [],
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString(),
    phoneNumber: phoneNumber || null,
    playerId: playerId,
  };
  return result;
}


export async function updateUserLastLogin(uid: string): Promise<void> {
  if (!uid) return;
  try {
    const userDocRef = doc(db, 'users', uid);
    await setDoc(userDocRef, { lastLogin: serverTimestamp() }, { merge: true });
  } catch (error) {
    console.error('Error updating last login:', error);
  }
}

export async function getAllPotentialAdmins(): Promise<UserProfile[]> {
  try {
    const allUsers = await getAllUsersFromDB();
    const potentialAdmins = allUsers.filter(user =>
      user.roles.includes('admin') || user.roles.includes('Series Admin')
    );
    return potentialAdmins; // Already sorted by getAllUsersFromDB
  } catch (error) {
    console.error("Error fetching all potential admins:", error);
    return [];
  }
}

export async function getPotentialSeriesAdminsForOrg(organizationId: string): Promise<UserProfile[]> {
  try {
    const allUsers = await getAllUsersFromDB();
    return allUsers.filter(user =>
      // Super admins always included
      user.roles.includes('admin') ||
      // Series Admins scoped to the organization
      (user.roles.includes('Series Admin') && (user.assignedOrganizationIds || []).includes(organizationId))
    );
  } catch (error) {
    console.error("Error fetching potential series admins for org:", error);
    return [];
  }
}

export async function getAllPotentialGameSelectors(): Promise<UserProfile[]> {
  try {
    const allUsers = await getAllUsersFromDB();
    const potentialSelectors = allUsers.filter(user =>
      user.roles.includes('admin') || user.roles.includes('Series Admin') || user.roles.includes('selector')
    );
    return potentialSelectors; // Already sorted by getAllUsersFromDB
  } catch (error) {
    console.error("Error fetching all potential game selectors:", error);
    return [];
  }
}

export async function getAllPotentialTeamManagers(): Promise<UserProfile[]> {
    try {
        const allUsers = await getAllUsersFromDB();
        const potentialManagers = allUsers.filter(user =>
            user.roles.includes('admin') || user.roles.includes('Series Admin') || user.roles.includes('Team Manager')
        );
        return potentialManagers; // Already sorted
    } catch (error) {
        console.error("Error fetching potential team managers:", error);
        return [];
    }
}

export async function getUsersByRole(role: UserRole): Promise<UserProfile[]> {
  try {
    const allUsers = await getAllUsersFromDB();
    const usersWithRole = allUsers.filter(user => user.roles.includes(role));
    return usersWithRole.sort((a,b) => (a.displayName || a.email || '').localeCompare(b.displayName || b.email || ''));
  } catch (error) {
    console.error(`Error in getUsersByRole for role '${role}':`, error);
    throw error;
  }
}


export async function getUserByEmailFromDB(email: string): Promise<UserProfile | null> {
    if (!email) return null;
    const usersQuery = query(collection(db, 'users'), where('email', '==', email), limit(1));
    const userSnapshot = await getDocs(usersQuery);
    if (!userSnapshot.empty) {
        const docSnap = userSnapshot.docs[0];
        const data = docSnap.data();
        const createdAtTimestamp = data.createdAt as Timestamp | undefined;
        const lastLoginTimestamp = data.lastLogin as Timestamp | undefined;

        return {
            uid: data.uid,
            email: data.email,
            displayName: data.displayName || null,
            roles: data.roles || ['unassigned'],
            activeOrganizationId: data.activeOrganizationId || null,
            assignedOrganizationIds: data.assignedOrganizationIds || [],
            assignedSeriesIds: data.assignedSeriesIds || [],
            assignedTeamIds: data.assignedTeamIds || [],
            assignedGameIds: data.assignedGameIds || [],
            createdAt: createdAtTimestamp?.toDate?.().toISOString() || null,
            lastLogin: lastLoginTimestamp?.toDate?.().toISOString() || null,
            phoneNumber: data.phoneNumber || null,
        };
    }
    return null;
}
