'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, Loader2, Mail, Key, Phone as PhoneIcon, Building, User as UserIcon } from 'lucide-react';
import type { ConfirmationResult } from 'firebase/auth';
import { useRouter, useSearchParams } from 'next/navigation';
import { getOrganizationByIdFromDB } from '@/lib/db'; // Corrected import
import type { Organization } from '@/types';
import { GoogleIcon } from '@/components/custom-icons';

const SESSION_STORAGE_ORG_ID_KEY = 'pendingSignupOrgId';
const SESSION_STORAGE_DISPLAY_NAME_KEY = 'pendingSignupDisplayName';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailFormDisplayName, setEmailFormDisplayName] = useState('');
  const [phoneFormDisplayName, setPhoneFormDisplayName] = useState('');

  const {
    signUpWithEmail,
    signInWithGoogle,
    signInWithPhoneNumberFlow,
    confirmPhoneNumberCode,
    isAuthLoading,
    currentUser,
  } = useAuth();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);

  const [emailFormSubmitting, setEmailFormSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [phoneFormSubmitting, setPhoneFormSubmitting] = useState(false);

  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [isCodeSent, setIsCodeSent] = useState(false);

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
      getOrganizationByIdFromDB(orgIdFromQuery) // Corrected function call
        .then(org => {
          if (org && org.status === 'active') {
            setTargetOrgDetails(org);
            if (typeof window !== 'undefined') {
              sessionStorage.setItem(SESSION_STORAGE_ORG_ID_KEY, orgIdFromQuery);
            }
          } else {
            toast({ title: 'Invalid Organization Link', description: 'The organization specified in the link is not valid or inactive.', variant: 'destructive' });
            setTargetOrgId(null);
            if (typeof window !== 'undefined') {
              sessionStorage.removeItem(SESSION_STORAGE_ORG_ID_KEY);
            }
          }
        })
        .catch(err => {
          console.error("Error fetching organization details:", err);
          toast({ title: 'Error', description: 'Could not fetch organization details for signup.', variant: 'destructive' });
          setTargetOrgId(null);
           if (typeof window !== 'undefined') {
              sessionStorage.removeItem(SESSION_STORAGE_ORG_ID_KEY);
            }
        })
        .finally(() => setIsLoadingOrgDetails(false));
    } else {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(SESSION_STORAGE_ORG_ID_KEY);
      }
    }
  }, [searchParams, toast]);


  useEffect(() => {
    if (!isAuthLoading && currentUser) {
      const redirectParam = searchParams.get('redirect');
      const redirectPath = redirectParam || '/';
      router.push(redirectPath);
    }
  }, [isAuthLoading, currentUser, router, searchParams]);

  const prepareForAuth = (currentDisplayName: string) => {
    setError(null);
    if (typeof window !== 'undefined') {
      if (currentDisplayName) {
        sessionStorage.setItem(SESSION_STORAGE_DISPLAY_NAME_KEY, currentDisplayName);
      } else {
        sessionStorage.removeItem(SESSION_STORAGE_DISPLAY_NAME_KEY);
      }
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailFormDisplayName.trim()) {
        setError("Full Name is required for email signup.");
        toast({ title: 'Missing Information', description: 'Full Name is required.', variant: 'destructive' });
        return;
    }
    if (!email || !password) {
        setError("Please enter email and password.");
        toast({ title: 'Missing Information', description: 'Email and password are required.', variant: 'destructive' });
        return;
    }
    if (password.length < 6) {
        setError("Password should be at least 6 characters.");
        toast({ title: 'Weak Password', description: 'Password should be at least 6 characters.', variant: 'destructive' });
        return;
    }
    prepareForAuth(emailFormDisplayName);
    setEmailFormSubmitting(true);
    try {
      await signUpWithEmail(email, password, emailFormDisplayName);
    } catch (err: any) {
      let errorMessage = "Failed to sign up. Please try again.";
      if (err.code === 'auth/email-already-in-use') {
        errorMessage = "This email is already registered. If you deleted this user's data from the database, you must also delete their login from the Firebase Authentication console before re-registering.";
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = "Please enter a valid email address.";
      } else if (err.code === 'auth/weak-password') {
        errorMessage = "Password is too weak. Please choose a stronger password.";
      }
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
      toast({ title: 'Google Sign-up Failed', description: "An unexpected error occurred during Google Sign-Up.", variant: 'destructive' });
      setGoogleSubmitting(false);
    }
  };

  const handlePhoneSignUpSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneFormDisplayName.trim()) {
        setError("Full Name is required for phone signup.");
        toast({ title: 'Missing Information', description: 'Full Name is required.', variant: 'destructive' });
        return;
    }
    prepareForAuth(phoneFormDisplayName);
    setPhoneFormSubmitting(true);
    try {
      const formattedPhoneNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber.replace(/\D/g, '')}`;
      if (formattedPhoneNumber.length < 10) {
        setError("Please enter a valid phone number with country code (e.g., +1XXXXXXXXXX).");
        setPhoneFormSubmitting(false);
        return;
      }
      const result = await signInWithPhoneNumberFlow(formattedPhoneNumber, 'recaptcha-container-signup');
      setConfirmationResult(result);
      setIsCodeSent(true);
      toast({ title: 'Verification Code Sent', description: 'Please check your phone for the code.' });
    } catch (err: any) {
      let errorMessage = "Failed to send verification code. Please try again.";
      if (err.code === 'auth/invalid-phone-number') {
        errorMessage = "Invalid phone number format. Please include your country code (e.g., +1XXXXXXXXXX).";
      } else if (err.code === 'auth/too-many-requests') {
        errorMessage = "Too many requests. Please try again later.";
      } else if (err.message?.includes('reCAPTCHA')) {
        errorMessage = "reCAPTCHA verification failed. Please ensure it's set up correctly and try again.";
      }
      setError(errorMessage);
      toast({ title: 'Phone Sign-up Failed', description: errorMessage, variant: 'destructive' });
    } finally {
      setPhoneFormSubmitting(false);
    }
  };

  const handlePhoneSignUpVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmationResult || !verificationCode) {
      setError("Confirmation result or code is missing.");
      return;
    }
    setPhoneFormSubmitting(true);
    try {
      await confirmPhoneNumberCode(confirmationResult, verificationCode);
    } catch (err: any) {
       let errorMessage = "Failed to verify code. Please try again.";
      if (err.code === 'auth/invalid-verification-code') {
        errorMessage = "Invalid verification code.";
      } else if (err.code === 'auth/code-expired') {
        errorMessage = "Verification code has expired. Please request a new one.";
      }
      setError(errorMessage);
      toast({ title: 'Phone Sign-up Failed', description: errorMessage, variant: 'destructive' });
    } finally {
      setPhoneFormSubmitting(false);
    }
  };

  const isAnyAuthActionLoading = emailFormSubmitting || googleSubmitting || phoneFormSubmitting || isAuthLoading || isLoadingOrgDetails;

  if (isAuthLoading || currentUser) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-10rem)] py-12">
        <Card className="w-full max-w-md shadow-xl p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
          <p className="text-muted-foreground">
            Initializing session...
          </p>
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
             <CardDescription className="text-destructive">
                Could not load details for the specified organization. Proceeding with general signup.
            </CardDescription>
          )}
           {!targetOrgId && (
             <CardDescription>Join Cricket IQ to start managing and rating players.</CardDescription>
           )}
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email-displayName-signup">Full Name</Label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email-displayName-signup"
                  type="text"
                  value={emailFormDisplayName}
                  onChange={(e) => setEmailFormDisplayName(e.target.value)}
                  placeholder="e.g. John Doe"
                  required
                  disabled={isAnyAuthActionLoading}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-signup">Email</Label>
               <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email-signup"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  disabled={isAnyAuthActionLoading}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password-signup">Password</Label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password-signup"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={isAnyAuthActionLoading}
                  className="pl-10"
                />
              </div>
              <p className="text-xs text-muted-foreground">Password should be at least 6 characters.</p>
            </div>
            {error && !isCodeSent && !emailFormSubmitting && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={isAnyAuthActionLoading}>
              {emailFormSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              {emailFormSubmitting ? 'Creating Account...' : 'Create Account with Email'}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or sign up with</span>
            </div>
          </div>

          <Button variant="outline" onClick={handleGoogleSignUp} className="w-full" disabled={isAnyAuthActionLoading}>
             {googleSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GoogleIcon />}
             <span className="ml-2">{googleSubmitting ? "Redirecting..." : "Sign up with Google"}</span>
          </Button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or sign up with phone</span>
            </div>
          </div>

          {!isCodeSent ? (
            <form onSubmit={handlePhoneSignUpSendCode} className="space-y-4 pt-2">
               <div className="space-y-1.5">
                <Label htmlFor="phone-displayName-signup">Full Name</Label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone-displayName-signup"
                    type="text"
                    value={phoneFormDisplayName}
                    onChange={(e) => setPhoneFormDisplayName(e.target.value)}
                    placeholder="e.g. Jane Doe"
                    required
                    disabled={isAnyAuthActionLoading}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone-signup">Phone Number</Label>
                <div className="relative">
                  <PhoneIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone-signup"
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+1 650 555 1234"
                    required
                    disabled={isAnyAuthActionLoading}
                    className="pl-10"
                  />
                </div>
                <CardDescription className="text-xs">Enter your phone number with country code.</CardDescription>
              </div>
              {error && !isCodeSent && !emailFormSubmitting && !googleSubmitting && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" variant="outline" className="w-full" disabled={isAnyAuthActionLoading}>
                {phoneFormSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {phoneFormSubmitting ? 'Sending Code...' : 'Sign up with Phone'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handlePhoneSignUpVerifyCode} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="code-signup">Verification Code</Label>
                <Input
                  id="code-signup"
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="Enter 6-digit code"
                  required
                  disabled={isAnyAuthActionLoading}
                />
              </div>
              {error && isCodeSent && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button type="submit" variant="outline" className="flex-grow" disabled={isAnyAuthActionLoading}>
                  {phoneFormSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {phoneFormSubmitting ? 'Verifying...' : 'Verify Code & Sign Up'}
                </Button>
                 <Button variant="link" onClick={() => { setIsCodeSent(false); setError(null); setPhoneNumber(''); setVerificationCode(''); setConfirmationResult(null); }} disabled={isAnyAuthActionLoading}>
                    Change Number
                 </Button>
              </div>
            </form>
          )}
          {phoneNumber && !isCodeSent && <div id="recaptcha-container-signup"></div>}

        </CardContent>
        <CardFooter className="flex flex-col items-center gap-2 text-sm">
          <p>
            Already have an account?{' '}
            <Button variant="link" asChild className="p-0 h-auto">
              <Link href="/login">Log In</Link>
            </Button>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
