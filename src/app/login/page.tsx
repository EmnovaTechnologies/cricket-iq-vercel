'use client';

import { useState, useEffect, Suspense } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { LogIn, Mail, Key, Loader2, Users, ChevronRight, Building, Send, AlertTriangle } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { GoogleIcon } from '@/components/custom-icons';
import { getAllPublicActiveOrganizations } from '@/lib/actions/public-org-action';


// ── Inner component that uses useSearchParams ──────────────────────────────
function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const {
    signInWithEmail,
    signInWithGoogle,
    isAuthLoading,
    userProfile,
    sendPasswordReset,
    resendVerificationEmail,
    currentUser,
  } = useAuth();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [emailFormSubmitting, setEmailFormSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [unverifiedPassword, setUnverifiedPassword] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  // Player signup dialog state
  const [showPlayerDialog, setShowPlayerDialog] = useState(false);
  const [orgs, setOrgs] = useState<{ id: string; name: string; branding?: any }[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(false);

  const handleOpenPlayerDialog = async () => {
    setShowPlayerDialog(true);
    setOrgsLoading(true);
    try {
      const activeOrgs = await getAllPublicActiveOrganizations();
      setOrgs(activeOrgs);
    } catch (e) {
      setOrgs([]);
    } finally {
      setOrgsLoading(false);
    }
  };

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
    setUnverifiedEmail(null);
    setUnverifiedPassword(null);
    if (!email || !password) { setError("Please enter both email and password."); return; }
    setEmailFormSubmitting(true);
    try {
      await signInWithEmail(email, password);
      // onAuthStateChanged blocks unverified users — check after sign-in
      const { getAuth } = await import('firebase/auth');
      const fbUser = getAuth().currentUser;
      if (fbUser && !fbUser.emailVerified) {
        const { signOut: fbSignOut } = await import('firebase/auth');
        await fbSignOut(getAuth());
        setUnverifiedEmail(email);
        setUnverifiedPassword(password);
        setEmailFormSubmitting(false);
      } else {
        setEmailFormSubmitting(false);
      }
    } catch (err: any) {
      let errorMessage = "Failed to login. Please check your credentials.";
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        errorMessage = "Invalid email or password.";
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = "Please enter a valid email address.";
      }
      setError(errorMessage);
      toast({ title: 'Login Failed', description: errorMessage, variant: 'destructive' });
      setEmailFormSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    if (!unverifiedEmail || !unverifiedPassword) {
      toast({ title: 'Cannot resend', description: 'Please try logging in again first.', variant: 'destructive' });
      return;
    }
    setResending(true);
    try {
      // Sign in temporarily to get auth user object
      await signInWithEmail(unverifiedEmail, unverifiedPassword);
      await resendVerificationEmail();
      toast({ title: 'Email Sent', description: 'Verification email resent. Check your inbox (and spam folder).' });
    } catch {
      toast({ title: 'Could not resend', description: 'Please try signing up again or contact support.', variant: 'destructive' });
    } finally {
      // Always sign back out
      const { getAuth, signOut: fbSignOut } = await import('firebase/auth');
      await fbSignOut(getAuth()).catch(() => {});
      setResending(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleSubmitting(true);
    try {
      await signInWithGoogle();
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

  const handlePasswordReset = async () => {
    if (!resetEmail) {
      toast({ title: 'Email Required', description: 'Please enter your email address.', variant: 'destructive' });
      return;
    }
    try {
      await sendPasswordReset(resetEmail);
    } catch (err: any) {
      // swallow error — always show same message for security
    } finally {
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
          <p className="text-muted-foreground">Initializing session...</p>
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
          {unverifiedEmail && (
            <Alert variant="default" className="border-amber-300 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800">Email Not Verified</AlertTitle>
              <AlertDescription className="text-amber-700 space-y-2">
                <p>Please verify your email address before logging in. Check your inbox for <strong>{unverifiedEmail}</strong>.</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResendVerification}
                  disabled={resending}
                  className="gap-2 border-amber-400 text-amber-800 hover:bg-amber-100 mt-1"
                >
                  {resending ? <><Loader2 className="h-3 w-3 animate-spin" /> Sending...</> : <><Send className="h-3 w-3" /> Resend Verification Email</>}
                </Button>
              </AlertDescription>
            </Alert>
          )}
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
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>

          <Button variant="outline" onClick={handleGoogleSignIn} className="w-full" disabled={isAuthLoading || googleSubmitting}>
            {googleSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GoogleIcon />}
            <span className="ml-2">{googleSubmitting ? "Signing in..." : "Sign in with Google"}</span>
          </Button>
        </CardContent>
        <CardFooter className="flex flex-col items-center gap-2 text-sm">
          <p>
            Don't have an account?{' '}
            <Button variant="link" asChild className="p-0 h-auto">
              <Link href="/signup">Sign Up</Link>
            </Button>
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

      {/* Organisation picker dialog for player registration */}
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

// ── Page export — wraps LoginForm in Suspense ──────────────────────────────
export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[calc(100vh-10rem)] py-12">
        <Card className="w-full max-w-md shadow-xl p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
          <p className="text-muted-foreground">Loading...</p>
        </Card>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
