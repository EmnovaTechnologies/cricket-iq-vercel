'use client';

import { useState, useEffect, Suspense } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, Loader2, Mail, Key, Building, User as UserIcon } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getOrganizationByIdFromDB } from '@/lib/db';
import type { Organization } from '@/types';
import { GoogleIcon } from '@/components/custom-icons';

const SESSION_STORAGE_ORG_ID_KEY = 'pendingSignupOrgId';
const SESSION_STORAGE_DISPLAY_NAME_KEY = 'pendingSignupDisplayName';

function SignupForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  const { signUpWithEmail, signInWithGoogle, isAuthLoading, currentUser } = useAuth();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [emailFormSubmitting, setEmailFormSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();

  const [targetOrgId, setTargetOrgId] = useState<string | null>(null);
  const [targetOrgDetails, setTargetOrgDetails] = useState<Organization | null>(null);
  const [isLoadingOrgDetails, setIsLoadingOrgDetails] = useState(false);

  useEffect(() => {
    const orgIdFromQuery = searchParams.get('orgId');
    if (orgIdFromQuery) {
      setTargetOrgId(orgIdFromQuery);
      setIsLoadingOrgDetails(true);
      getOrganizationByIdFromDB(orgIdFromQuery)
        .then(org => {
          if (org && org.status === 'active') {
            setTargetOrgDetails(org);
            if (typeof window !== 'undefined') sessionStorage.setItem(SESSION_STORAGE_ORG_ID_KEY, orgIdFromQuery);
          } else {
            toast({ title: 'Invalid Organization Link', description: 'The organization specified in the link is not valid or inactive.', variant: 'destructive' });
            setTargetOrgId(null);
            if (typeof window !== 'undefined') sessionStorage.removeItem(SESSION_STORAGE_ORG_ID_KEY);
          }
        })
        .catch(err => {
          console.error("Error fetching organization details:", err);
          toast({ title: 'Error', description: 'Could not fetch organization details for signup.', variant: 'destructive' });
          setTargetOrgId(null);
          if (typeof window !== 'undefined') sessionStorage.removeItem(SESSION_STORAGE_ORG_ID_KEY);
        })
        .finally(() => setIsLoadingOrgDetails(false));
    } else {
      if (typeof window !== 'undefined') sessionStorage.removeItem(SESSION_STORAGE_ORG_ID_KEY);
    }
  }, [searchParams, toast]);

  useEffect(() => {
    if (!isAuthLoading && currentUser) {
      const redirectParam = searchParams.get('redirect');
      router.push(redirectParam || '/');
    }
  }, [isAuthLoading, currentUser, router, searchParams]);

  const prepareForAuth = (name: string) => {
    setError(null);
    if (typeof window !== 'undefined') {
      if (name) sessionStorage.setItem(SESSION_STORAGE_DISPLAY_NAME_KEY, name);
      else sessionStorage.removeItem(SESSION_STORAGE_DISPLAY_NAME_KEY);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) { setError("Full Name is required."); toast({ title: 'Missing Information', description: 'Full Name is required.', variant: 'destructive' }); return; }
    if (!email || !password) { setError("Please enter email and password."); return; }
    if (password.length < 6) { setError("Password should be at least 6 characters."); return; }
    prepareForAuth(displayName);
    setEmailFormSubmitting(true);
    try {
      await signUpWithEmail(email, password, displayName);
    } catch (err: any) {
      let errorMessage = "Failed to sign up. Please try again.";
      if (err.code === 'auth/email-already-in-use') errorMessage = "This email is already registered.";
      else if (err.code === 'auth/invalid-email') errorMessage = "Please enter a valid email address.";
      else if (err.code === 'auth/weak-password') errorMessage = "Password is too weak.";
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
    } catch (error) {
      console.error("[SignupPage] Google Sign-Up Error:", error);
      toast({ title: 'Google Sign-up Failed', description: "An unexpected error occurred.", variant: 'destructive' });
      setGoogleSubmitting(false);
    }
  };

  const isAnyAuthActionLoading = emailFormSubmitting || googleSubmitting || isAuthLoading || isLoadingOrgDetails;

  if (isAuthLoading || currentUser) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-10rem)] py-12">
        <Card className="w-full max-w-md shadow-xl p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
          <p className="text-muted-foreground">Initializing session...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-10rem)] py-12">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-headline text-primary">Create Your Account</CardTitle>
          {isLoadingOrgDetails && targetOrgId && (
            <CardDescription className="flex items-center justify-center gap-1 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading organization details...
            </CardDescription>
          )}
          {targetOrgDetails && (
            <CardDescription className="flex items-center justify-center gap-1 text-accent font-semibold">
              <Building className="h-4 w-4" /> Signing up for {targetOrgDetails.name}
            </CardDescription>
          )}
          {!isLoadingOrgDetails && !targetOrgDetails && targetOrgId && (
            <CardDescription className="text-destructive">Could not load details for the specified organization. Proceeding with general signup.</CardDescription>
          )}
          {!targetOrgId && <CardDescription>Join Cricket IQ to start managing and rating players.</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="displayName-signup">Full Name</Label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="displayName-signup" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. John Doe" required disabled={isAnyAuthActionLoading} className="pl-10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-signup">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="email-signup" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required disabled={isAnyAuthActionLoading} className="pl-10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password-signup">Password</Label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="password-signup" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required disabled={isAnyAuthActionLoading} className="pl-10" />
              </div>
              <p className="text-xs text-muted-foreground">Password should be at least 6 characters.</p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={isAnyAuthActionLoading}>
              {emailFormSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              {emailFormSubmitting ? 'Creating Account...' : 'Create Account with Email'}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or sign up with</span>
            </div>
          </div>

          <Button variant="outline" onClick={handleGoogleSignUp} className="w-full" disabled={isAnyAuthActionLoading}>
            {googleSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GoogleIcon />}
            <span className="ml-2">{googleSubmitting ? "Redirecting..." : "Sign up with Google"}</span>
          </Button>
        </CardContent>
        <CardFooter className="flex flex-col items-center gap-2 text-sm">
          <p>Already have an account?{' '}
            <Button variant="link" asChild className="p-0 h-auto"><Link href="/login">Log In</Link></Button>
          </p>
        </CardFooter>
      </Card>
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
