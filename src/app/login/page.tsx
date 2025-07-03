'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { LogIn, Mail, Phone, Key, Loader2, ExternalLink, ShieldAlert, AlertTriangle } from 'lucide-react';
import type { ConfirmationResult } from 'firebase/auth';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { GoogleIcon } from '@/components/custom-icons';


export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const { 
    signInWithEmail, 
    signInWithGoogle, 
    signInWithPhoneNumberFlow, 
    confirmPhoneNumberCode, 
    isAuthLoading,
    userProfile,
    sendPasswordReset
  } = useAuth();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [emailFormSubmitting, setEmailFormSubmitting] = useState(false);
  const [phoneFormSubmitting, setPhoneFormSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);


  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [isCodeSent, setIsCodeSent] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!isAuthLoading && userProfile) {
      const redirectParam = searchParams.get('redirect');
      const redirectPath = redirectParam || '/';
      router.push(redirectPath);
    }
  }, [isAuthLoading, userProfile, router, searchParams]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }
    setEmailFormSubmitting(true);
    try {
      await signInWithEmail(email, password);
    } catch (err: any) {
      let errorMessage = "Failed to login. Please check your credentials.";
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        errorMessage = "Invalid email or password.";
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = "Please enter a valid email address.";
      }
      setError(errorMessage);
      toast({ title: 'Login Failed', description: errorMessage, variant: 'destructive' });
    }
    setEmailFormSubmitting(false);
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleSubmitting(true);
    try {
      await signInWithGoogle();
      // onAuthStateChanged will handle navigation
    } catch (err: any) {
      let errorMessage = `An unexpected error occurred during Google Sign-In. Please try again.`;
      if (err.code === 'auth/popup-closed-by-user') {
          errorMessage = "The sign-in popup was closed before completing. Please try again.";
      }
      setError(errorMessage);
    } finally {
        setGoogleSubmitting(false);
    }
  };

  const handleSendVerificationCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); 
    setPhoneFormSubmitting(true); 
    try {
      const formattedPhoneNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber.replace(/\D/g, '')}`;
      if (formattedPhoneNumber.length < 10) { 
        setError("Please enter a valid phone number with country code (e.g., +1XXXXXXXXXX).");
        setPhoneFormSubmitting(false);
        return;
      }

      const result = await signInWithPhoneNumberFlow(formattedPhoneNumber, 'recaptcha-container-login');
      setConfirmationResult(result);
      setIsCodeSent(true);
      toast({ title: 'Verification Code Sent', description: 'Please check your phone for the code.' });
    } catch (err: any)
       {
      let errorMessage = "Failed to send verification code. Please try again.";
      if (err.code === 'auth/invalid-phone-number') {
        errorMessage = "Invalid phone number format. Please include your country code (e.g., +1XXXXXXXXXX).";
      } else if (err.code === 'auth/too-many-requests') {
        errorMessage = "Too many requests. Please try again later.";
      } else if (err.message?.includes('reCAPTCHA')) {
        errorMessage = "reCAPTCHA verification failed. Please ensure it's set up correctly and try again.";
      }
      setError(errorMessage); 
      toast({ title: 'Phone Sign-in Failed', description: errorMessage, variant: 'destructive' });
    }
    setPhoneFormSubmitting(false);
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmationResult || !verificationCode) {
      setError("Confirmation result or code is missing.");
      return;
    }
    setError(null);
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
      toast({ title: 'Phone Sign-in Failed', description: errorMessage, variant: 'destructive' });
    }
    setPhoneFormSubmitting(false);
  };

  const handlePasswordReset = async () => {
    if (!resetEmail) {
      toast({ title: 'Email Required', description: 'Please enter your email address.', variant: 'destructive' });
      return;
    }
    try {
      await sendPasswordReset(resetEmail);
      toast({
        title: 'Password Reset Email Sent',
        description: 'If an account exists for this email, a reset link has been sent.',
      });
      setIsResetDialogOpen(false);
      setResetEmail('');
    } catch (err: any) {
      toast({
        title: 'Password Reset Email Sent',
        description: 'If an account exists for this email, a reset link has been sent.',
      });
      setIsResetDialogOpen(false);
      setResetEmail('');
    }
  };

  if (isAuthLoading || userProfile) {
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
          <CardTitle className="text-2xl font-headline text-primary">Welcome Back!</CardTitle>
          <CardDescription>Sign in to access your Cricket IQ dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && <Alert variant="destructive"><AlertTitle>Login Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  disabled={emailFormSubmitting || isAuthLoading}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
               <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={emailFormSubmitting || isAuthLoading}
                  className="pl-10"
                />
              </div>
              <div className="text-right">
                <Button type="button" variant="link" className="p-0 h-auto text-sm font-normal text-muted-foreground" onClick={() => setIsResetDialogOpen(true)}>
                    Forgot Password?
                </Button>
              </div>
            </div>
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={emailFormSubmitting || isAuthLoading}>
              {emailFormSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
              {emailFormSubmitting ? 'Logging in...' : 'Login with Email'}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>

          <Button variant="outline" onClick={handleGoogleSignIn} className="w-full" disabled={isAuthLoading || googleSubmitting}>
             {googleSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GoogleIcon />}
             <span className="ml-2">{googleSubmitting ? "Signing in..." : "Sign in with Google"}</span>
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>

          {!isCodeSent ? (
            <form onSubmit={handleSendVerificationCode} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone Number</Label>
                 <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+1 650 555 1234"
                    required
                    disabled={phoneFormSubmitting || isAuthLoading}
                    className="pl-10"
                  />
                </div>
                <CardDescription className="text-xs">Enter your phone number with country code.</CardDescription>
              </div>
              <Button type="submit" variant="outline" className="w-full" disabled={phoneFormSubmitting || isAuthLoading}>
                {phoneFormSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {phoneFormSubmitting ? 'Sending Code...' : 'Sign in with Phone'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="code">Verification Code</Label>
                <Input
                  id="code"
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="Enter 6-digit code"
                  required
                  disabled={phoneFormSubmitting || isAuthLoading}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" variant="outline" className="flex-grow" disabled={phoneFormSubmitting || isAuthLoading}>
                  {phoneFormSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {phoneFormSubmitting ? 'Verifying...' : 'Verify Code'}
                </Button>
                 <Button variant="link" onClick={() => { setIsCodeSent(false); setError(null); setPhoneNumber(''); setVerificationCode(''); setConfirmationResult(null); }} disabled={phoneFormSubmitting || isAuthLoading}>
                    Change Number
                 </Button>
              </div>
            </form>
          )}
          {phoneNumber && !isCodeSent && <div id="recaptcha-container-login"></div>}

        </CardContent>
        <CardFooter className="flex flex-col items-center gap-2 text-sm">
          <p>
            Don't have an account?{' '}
            <Button variant="link" asChild className="p-0 h-auto">
              <Link href="/signup">Sign Up</Link>
            </Button>
          </p>
        </CardFooter>
      </Card>
       <AlertDialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Password</AlertDialogTitle>
            <AlertDialogDescription>
              Enter the email address for your account. If an account exists, a reset link will be sent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2 py-4">
            <Label htmlFor="reset-email" className="sr-only">Email</Label>
            <Input
              id="reset-email"
              type="email"
              placeholder="you@example.com"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePasswordReset()}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePasswordReset}>Send Reset Link</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
