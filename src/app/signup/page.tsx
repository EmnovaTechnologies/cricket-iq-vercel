'use client';

import { useState, useEffect, Suspense } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, Loader2, Mail, Key, Building, User as UserIcon, CheckCircle, Send, Users, ChevronRight } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getPublicOrganizationDetails } from '@/lib/actions/public-org-action';
import { getAllPublicActiveOrganizations } from '@/lib/actions/public-org-action';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { GoogleIcon } from '@/components/custom-icons';

const SESSION_STORAGE_ORG_ID_KEY = 'pendingSignupOrgId';
const SESSION_STORAGE_DISPLAY_NAME_KEY = 'pendingSignupDisplayName';

function SignupForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [verificationSent, setVerificationSent] = useState(false);
  const [resending, setResending] = useState(false);
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

  const { signUpWithEmail, signInWithGoogle, resendVerificationEmail, isAuthLoading, currentUser, userProfile } = useAuth();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [emailFormSubmitting, setEmailFormSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();

  const [targetOrgId, setTargetOrgId] = useState<string | null>(null);
  const [targetOrgDetails, setTargetOrgDetails] = useState<{ id: string; name: string; status: string } | null>(null);
  const [isLoadingOrgDetails, setIsLoadingOrgDetails] = useState(false);

  useEffect(() => {
    const orgIdFromQuery = searchParams.get('orgId');
    if (orgIdFromQuery) {
      setTargetOrgId(orgIdFromQuery);
      setIsLoadingOrgDetails(true);
      getPublicOrganizationDetails(orgIdFromQuery)
        .then(org => {
          if (org && org.status === 'active') {
            setTargetOrgDetails(org);
            if (typeof window !== 'undefined') sessionStorage.setItem(SESSION_STORAGE_ORG_ID_KEY, orgIdFromQuery);
          } else {
            toast({ title: 'Invalid Organization Link', description: 'The organization specified is not valid or inactive.', variant: 'destructive' });
            setTargetOrgId(null);
            if (typeof window !== 'undefined') sessionStorage.removeItem(SESSION_STORAGE_ORG_ID_KEY);
          }
        })
        .catch(() => {
          toast({ title: 'Error', description: 'Could not fetch organization details.', variant: 'destructive' });
          setTargetOrgId(null);
          if (typeof window !== 'undefined') sessionStorage.removeItem(SESSION_STORAGE_ORG_ID_KEY);
        })
        .finally(() => setIsLoadingOrgDetails(false));
    } else {
      if (typeof window !== 'undefined') sessionStorage.removeItem(SESSION_STORAGE_ORG_ID_KEY);
    }
  }, [searchParams, toast]);

  // Redirect only if fully authenticated (profile loaded = verified)
  useEffect(() => {
    if (!isAuthLoading && userProfile) {
      const redirectParam = searchParams.get('redirect');
      router.push(redirectParam || '/');
    }
  }, [isAuthLoading, userProfile, router, searchParams]);

  const prepareForAuth = (name: string) => {
    setError(null);
    if (typeof window !== 'undefined') {
      if (name) sessionStorage.setItem(SESSION_STORAGE_DISPLAY_NAME_KEY, name);
      else sessionStorage.removeItem(SESSION_STORAGE_DISPLAY_NAME_KEY);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) { setError("Full Name is required."); return; }
    if (!email || !password) { setError("Please enter email and password."); return; }
    if (password.length < 6) { setError("Password should be at least 6 characters."); return; }
    prepareForAuth(displayName);
    setEmailFormSubmitting(true);
    try {
      await signUpWithEmail(email, password, displayName);
      // Account created, verification email sent, user signed out
      setVerificationSent(true);
    } catch (err: any) {
      let errorMessage = "Failed to sign up. Please try again.";
      if (err.code === 'auth/email-already-in-use') errorMessage = "This email is already registered. Try logging in instead.";
      else if (err.code === 'auth/invalid-email') errorMessage = "Please enter a valid email address.";
      else if (err.code === 'auth/weak-password') errorMessage = "Password is too weak. Use at least 6 characters.";
      setError(errorMessage);
      toast({ title: 'Signup Failed', description: errorMessage, variant: 'destructive' });
    } finally {
      setEmailFormSubmitting(false);
    }
  };

  const handleGoogleSignUp = async () => {
    prepareForAuth('');
    setGoogleSubmitting(true);
    try {
      await signInWithGoogle();
      // Google users bypass verification — onAuthStateChanged handles redirect
    } catch {
      toast({ title: 'Google Sign-up Failed', description: "An unexpected error occurred.", variant: 'destructive' });
      setGoogleSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    setResending(true);
    try {
      await resendVerificationEmail();
      toast({ title: 'Email Sent', description: 'Verification email resent. Please check your inbox.' });
    } catch {
      toast({ title: 'Error', description: 'Could not resend verification email. Please try again.', variant: 'destructive' });
    } finally {
      setResending(false);
    }
  };

  const isAnyAuthActionLoading = emailFormSubmitting || googleSubmitting || isAuthLoading || isLoadingOrgDetails;

  // ── Loading / already logged in ────────────────────────────────────────────
  if (isAuthLoading || userProfile) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-10rem)] py-12">
        <Card className="w-full max-w-md shadow-xl p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
          <p className="text-muted-foreground">Initializing session...</p>
        </Card>
      </div>
    );
  }

  // ── Verification sent screen ───────────────────────────────────────────────
  if (verificationSent) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-10rem)] py-12">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-3">
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                <Mail className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <CardTitle className="text-2xl font-headline text-primary">Check Your Email</CardTitle>
            <CardDescription className="mt-1">
              We've sent a verification link to <strong>{email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pt-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <span>Click the link in the email to verify your account.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <span>Once verified, return here and log in.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <span>Check your spam folder if you don't see the email.</span>
              </div>
            </div>

            <Button asChild className="w-full bg-primary hover:bg-primary/90">
              <Link href="/login">
                <CheckCircle className="mr-2 h-4 w-4" /> Go to Login
              </Link>
            </Button>

            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Didn't receive the email?</p>
              <Button
                variant="outline"
                onClick={handleResendVerification}
                disabled={resending}
                className="gap-2"
              >
                {resending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
                  : <><Send className="h-4 w-4" /> Resend Verification Email</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Signup form ────────────────────────────────────────────────────────────
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-10rem)] py-12">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-headline text-primary">Create Your Account</CardTitle>
          {isLoadingOrgDetails && targetOrgId && (
            <CardDescription className="flex items-center justify-center gap-1">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading organization details...
            </CardDescription>
          )}
          {targetOrgDetails && (
            <CardDescription className="flex items-center justify-center gap-1 text-accent font-semibold">
              <Building className="h-4 w-4" /> Signing up for {targetOrgDetails.name}
            </CardDescription>
          )}
          {!isLoadingOrgDetails && !targetOrgDetails && targetOrgId && (
            <CardDescription className="text-destructive">Could not load the specified organization. Proceeding with general signup.</CardDescription>
          )}
          {!targetOrgId && <CardDescription>Join Cricket IQ to start managing and rating players.</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="displayName-signup">Full Name</Label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="displayName-signup" type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. John Doe" required disabled={isAnyAuthActionLoading} className="pl-10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-signup">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="email-signup" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required disabled={isAnyAuthActionLoading} className="pl-10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password-signup">Password</Label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="password-signup" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required disabled={isAnyAuthActionLoading} className="pl-10" />
              </div>
              <p className="text-xs text-muted-foreground">Password should be at least 6 characters.</p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={isAnyAuthActionLoading}>
              {emailFormSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating Account...</> : <><UserPlus className="mr-2 h-4 w-4" /> Create Account with Email</>}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or sign up with</span>
            </div>
          </div>

          <Button variant="outline" onClick={handleGoogleSignUp} className="w-full" disabled={isAnyAuthActionLoading}>
            {googleSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Redirecting...</> : <><GoogleIcon /><span className="ml-2">Sign up with Google</span></>}
          </Button>
        </CardContent>
        <CardFooter className="flex flex-col items-center gap-2 text-sm">
          <p>Already have an account?{' '}
            <Button variant="link" asChild className="p-0 h-auto"><Link href="/login">Log In</Link></Button>
          </p>
          <div className="relative w-full">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-dashed" /></div>
            <div className="relative flex justify-center">
              <span className="bg-card px-2 text-xs text-muted-foreground">or</span>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full gap-2 border-primary/40 text-primary hover:bg-primary/5"
            onClick={handleOpenPlayerDialog}
          >
            <Users className="h-4 w-4" />
            Register as a Player
          </Button>
        </CardFooter>
      </Card>

      {/* Player org picker dialog */}
      <Dialog open={showPlayerDialog} onOpenChange={setShowPlayerDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> Register as a Player
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
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[calc(100vh-10rem)] py-12">
        <Card className="w-full max-w-md shadow-xl p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
          <p className="text-muted-foreground">Loading...</p>
        </Card>
      </div>
    }>
      <SignupForm />
    </Suspense>
  );
}
