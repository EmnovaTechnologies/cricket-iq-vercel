
'use client';

import type { User as FirebaseUser, ConfirmationResult } from 'firebase/auth';
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import {
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile as updateFirebaseProfile,
  GoogleAuthProvider,
  signInWithPopup,
  RecaptchaVerifier,
  signInWithPhoneNumber as firebaseSignInWithPhoneNumber,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { createUserProfile, getUserProfile } from '@/lib/actions/user-actions';
import type { UserProfile, Organization, PermissionKey, UserRole, Player, PredefinedThemeName, ThemeColorPalette } from '@/types';
import { getOrganizationsByIdsAction } from '@/lib/actions/organization-actions';
import { getAllOrganizationsFromDB, getOrganizationByIdFromDB } from '@/lib/db';
import { calculateEffectivePermissions } from '@/lib/actions/permission-actions';
import { useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, collection, query, where, limit, getDocs, Timestamp, setDoc, writeBatch, deleteField, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { THEME_PREVIEW_COLORS, PALETTE_TO_CSS_VAR_MAP } from '@/lib/constants';
import { PERMISSIONS } from '../lib/permissions-master-list';

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  isAuthLoading: boolean;
  isLoggingOut: boolean;
  activeOrganizationId: string | null;
  setActiveOrganizationId: (orgId: string | null) => Promise<void>;
  organizationsForSwitching: Organization[];
  activeOrganizationDetails: Organization | null;
  effectivePermissions: Record<PermissionKey, boolean>;
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  signUpAsPlayer: (email: string, password: string, displayName: string, registrationToken: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithPhoneNumberFlow: (phoneNumber: string, recaptchaContainerId: string) => Promise<ConfirmationResult>;
  confirmPhoneNumberCode: (confirmationResult: ConfirmationResult, code: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ACTIVE_ORG_ID_LS_KEY = 'cricket-iq-activeOrgId';
const SESSION_STORAGE_ORG_ID_KEY = 'pendingSignupOrgId';
const SESSION_STORAGE_DISPLAY_NAME_KEY = 'pendingSignupDisplayName';


export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [pendingRegistrationToken, setPendingRegistrationToken] = useState<string | null>(null);
  
  const [_activeOrganizationId, _setInternalActiveOrganizationId] = useState<string | null>(null);
  const [organizationsForSwitching, setOrganizationsForSwitching] = useState<Organization[]>([]);
  const [activeOrganizationDetails, setActiveOrganizationDetails] = useState<Organization | null>(null);
  const router = useRouter();

  const [effectivePermissions, setEffectivePermissions] = useState<Record<PermissionKey, boolean>>({});

  const logout = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error("[logout] Error signing out:", error);
      setIsLoggingOut(false);
    }
  }, [router]);
  
  const loadUserProfileAndData = useCallback(async (user: FirebaseUser) => {
    try {
        const userDocRef = doc(db, 'users', user.uid);
        let userSnap = await getDoc(userDocRef);
        let profile: UserProfile | null = null;

        if (userSnap.exists()) {
            const data = userSnap.data();
            const createdAtTimestamp = data.createdAt as Timestamp | undefined;
            const lastLoginTimestamp = data.lastLogin as Timestamp | undefined;
            const assignedOrganizationIds = data.assignedOrganizationIds || [];
            let activeOrganizationId = data.activeOrganizationId || null;
            let playerId: string | null = null;
            if (data.roles?.includes('player')) {
                const playerQuery = query(collection(db, 'players'), where('userId', '==', user.uid), limit(1));
                const playerSnapshot = await getDocs(playerQuery);
                if (!playerSnapshot.empty) {
                    playerId = playerSnapshot.docs[0].id;
                }
            }
            profile = {
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
            
        } else {
            const targetOrgIdFromStorage = typeof window !== 'undefined' ? sessionStorage.getItem(SESSION_STORAGE_ORG_ID_KEY) : null;
            const targetDisplayNameFromStorage = typeof window !== 'undefined' ? sessionStorage.getItem(SESSION_STORAGE_DISPLAY_NAME_KEY) : null;
            
            profile = await createUserProfile(
              user.uid,
              user.email,
              targetDisplayNameFromStorage || user.displayName,
              user.phoneNumber,
              targetOrgIdFromStorage,
              pendingRegistrationToken
            );

            if (typeof window !== 'undefined') {
                sessionStorage.removeItem(SESSION_STORAGE_ORG_ID_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_DISPLAY_NAME_KEY);
            }
            setPendingRegistrationToken(null);
        }
        
        if (user.uid) {
            const userDocRefForLogin = doc(db, 'users', user.uid);
            await updateDoc(userDocRefForLogin, { lastLogin: serverTimestamp() }).catch(e => console.error("Failed to update last login time:", e));
        }

        if (profile) {
            setUserProfile(profile);
            const perms = await calculateEffectivePermissions(profile);
            setEffectivePermissions(perms);
            let orgs: Organization[];
            if (profile.roles.includes('admin')) {
                orgs = await getAllOrganizationsFromDB();
            } else if (!profile.assignedOrganizationIds || profile.assignedOrganizationIds.length === 0) {
                orgs = [];
            } else {
                orgs = await getOrganizationsByIdsAction(profile.assignedOrganizationIds);
            }
            setOrganizationsForSwitching(orgs);
            const lsOrgId = typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_ORG_ID_LS_KEY) : null;
            const isLsOrgIdValid = lsOrgId && orgs.some(o => o.id === lsOrgId);
            let newActiveOrgId = isLsOrgIdValid ? lsOrgId : (orgs.length > 0 ? orgs[0].id : null);
            _setInternalActiveOrganizationId(newActiveOrgId);
            if (typeof window !== 'undefined') {
                if (newActiveOrgId) localStorage.setItem(ACTIVE_ORG_ID_LS_KEY, newActiveOrgId);
                else localStorage.removeItem(ACTIVE_ORG_ID_LS_KEY);
            }
            if (newActiveOrgId) {
                const orgDetails = orgs.find(o => o.id === newActiveOrgId) || await getOrganizationByIdFromDB(newActiveOrgId);
                setActiveOrganizationDetails(orgDetails || null);
            } else {
                setActiveOrganizationDetails(null);
            }
        }

    } catch (error) {
        console.error("[AuthContext] CRITICAL ERROR in loadUserProfileAndData:", error);
        await logout();
    } finally {
        setIsAuthLoading(false);
    }
  }, [pendingRegistrationToken, logout]);
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setIsLoggingOut(false);
      setCurrentUser(user);
      if (user) {
        if (user.uid !== userProfile?.uid) {
          await loadUserProfileAndData(user);
        } else {
          setIsAuthLoading(false); 
        }
      } else {
        setUserProfile(null);
        setEffectivePermissions({});
        _setInternalActiveOrganizationId(null);
        setActiveOrganizationDetails(null);
        setOrganizationsForSwitching([]);
        if (typeof window !== 'undefined') {
          localStorage.removeItem(ACTIVE_ORG_ID_LS_KEY);
        }
        setIsAuthLoading(false);
      }
    });
  
    return () => unsubscribe();
  }, [loadUserProfileAndData, userProfile?.uid]);


  useEffect(() => {
    if (typeof window === 'undefined' || !document.documentElement) return;
    const rootStyle = document.documentElement.style;

    const themeNameToApply: PredefinedThemeName = activeOrganizationDetails?.branding?.themeName || 'Default';
    const activePalette = THEME_PREVIEW_COLORS[themeNameToApply];
    const defaultPalette = THEME_PREVIEW_COLORS['Default'];

    // Iterate over all possible theme variables
    for (const key in PALETTE_TO_CSS_VAR_MAP) {
        const cssVarKey = key as keyof ThemeColorPalette;
        const cssVarName = PALETTE_TO_CSS_VAR_MAP[cssVarKey];
        
        // Get value from active theme, or fallback to Default theme, or undefined
        const hslValue = activePalette[cssVarKey] || defaultPalette[cssVarKey];

        if (cssVarName && hslValue) {
            rootStyle.setProperty(cssVarName, hslValue);
        } else if (cssVarName) {
            // If no value is found even in the default palette, remove the inline style
            // to let the CSS file's :root take precedence.
            rootStyle.removeProperty(cssVarName);
        }
    }
  }, [activeOrganizationDetails]);


  const setActiveOrganizationId = async (orgId: string | null) => {
    _setInternalActiveOrganizationId(orgId);
    if (typeof window !== 'undefined') {
      if (orgId) localStorage.setItem(ACTIVE_ORG_ID_LS_KEY, orgId);
      else localStorage.removeItem(ACTIVE_ORG_ID_LS_KEY);
    }
    if (currentUser) {
      const userDocRef = doc(db, 'users', currentUser.uid);
      try {
        await updateDoc(userDocRef, { activeOrganizationId: orgId });
        setUserProfile(prevProfile => prevProfile ? { ...prevProfile, activeOrganizationId: orgId } : null);
        if (orgId) {
            const orgDetailsFromState = organizationsForSwitching.find(o => o.id === orgId);
            if (orgDetailsFromState) {
                setActiveOrganizationDetails(orgDetailsFromState);
            } else {
                const orgDetails = await getOrganizationByIdFromDB(orgId);
                setActiveOrganizationDetails(orgDetails || null);
            }
        } else {
            setActiveOrganizationDetails(null);
        }
      } catch (error) {
        console.error("[AuthContext setActiveOrganizationId] Error updating activeOrganizationId in Firestore:", error);
      }
    }
  };

  const signUpAsPlayer = async (email: string, password: string, displayName: string, registrationToken: string) => {
    setPendingRegistrationToken(registrationToken);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName && userCredential.user) {
        await updateFirebaseProfile(userCredential.user, { displayName });
      }
    } catch (error) {
      setPendingRegistrationToken(null);
      console.error('[AuthContext] signUpAsPlayer error:', error);
      throw error;
    }
  };

  const signUpWithEmail = async (email: string, password: string, displayName?: string | null) => {
    setPendingRegistrationToken(null);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName && userCredential.user) {
        await updateFirebaseProfile(userCredential.user, { displayName });
      }
    } catch (error) {
      console.error('[AuthContext] signUpWithEmail error:', error);
      throw error;
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try { await signInWithEmailAndPassword(auth, email, password); }
    catch (error) { 
        console.error('[AuthContext] signInWithEmail error:', error);
        throw error; 
    }
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      // onAuthStateChanged will handle the rest
    } catch (error) {
      console.error('[AuthContext] signInWithGoogle error:', error);
      throw error;
    }
  };

  const signInWithPhoneNumberFlow = async (phoneNumber: string, recaptchaContainerId: string): Promise<ConfirmationResult> => {
    if (typeof window !== 'undefined' && !(window as any).recaptchaVerifierInstance) {
        (window as any).recaptchaVerifierInstance = new RecaptchaVerifier(auth, recaptchaContainerId, {
            'size': 'invisible', 'callback': () => {},
            'expired-callback': () => {
                if (typeof window !== 'undefined' && (window as any).recaptchaVerifierInstance) {
                    (window as any).recaptchaVerifierInstance.render().then((widgetId: any) => {
                        if (typeof window !== 'undefined' && (window as any).grecaptcha && widgetId !== undefined) {
                           (window as any).grecaptcha.reset(widgetId);
                        }
                    });
                }
            }
        });
    }
    const appVerifier = typeof window !== 'undefined' ? (window as any).recaptchaVerifierInstance : null;
    if (!appVerifier) { throw new Error("Recaptcha verifier not initialized."); }
    try { return await firebaseSignInWithPhoneNumber(auth, phoneNumber, appVerifier); }
    catch (error) {
      if (typeof window !== 'undefined' && (window as any).recaptchaVerifierInstance && (window as any).grecaptcha) {
        (window as any).recaptchaVerifierInstance.render().then((widgetId: any) => {
            if ((window as any).grecaptcha && widgetId !== undefined) (window as any).grecaptcha.reset(widgetId);
        });
      }
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(SESSION_STORAGE_ORG_ID_KEY);
        sessionStorage.removeItem(SESSION_STORAGE_DISPLAY_NAME_KEY);
      }
       console.error('[AuthContext] signInWithPhoneNumberFlow error:', error);
      throw error;
    }
  };

  const confirmPhoneNumberCode = async (confirmationResult: ConfirmationResult, code: string) => {
    try { await confirmationResult.confirm(code); }
    catch (error) {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(SESSION_STORAGE_ORG_ID_KEY);
        sessionStorage.removeItem(SESSION_STORAGE_DISPLAY_NAME_KEY);
      }
      console.error('[AuthContext] confirmPhoneNumberCode error:', error);
      throw error;
    }
  };

  const sendPasswordReset = async (email: string) => {
    return sendPasswordResetEmail(auth, email);
  };

  const value = {
    currentUser, userProfile,
    isAuthLoading, isLoggingOut, 
    activeOrganizationId: _activeOrganizationId,
    setActiveOrganizationId, organizationsForSwitching, activeOrganizationDetails,
    effectivePermissions,
    signUpWithEmail, signInWithEmail, signInWithGoogle,
    signInWithPhoneNumberFlow, confirmPhoneNumberCode, logout,
    sendPasswordReset,
    signUpAsPlayer,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
