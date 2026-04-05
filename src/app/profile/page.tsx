'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Phone, User, Mail, ShieldCheck, CheckCircle, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import type { ConfirmationResult } from 'firebase/auth';

export default function ProfilePage() {
  const { currentUser, userProfile, isAuthLoading, signInWithPhoneNumberFlow, confirmPhoneNumberCode } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Phone linking state
  const [newPhone, setNewPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [isLinkingPhone, setIsLinkingPhone] = useState(false);
  const [showPhoneSection, setShowPhoneSection] = useState(false);

  useEffect(() => {
    if (!isAuthLoading && !currentUser) {
      router.push('/login');
    }
    if (userProfile) {
      setDisplayName(userProfile.displayName || '');
      setPhoneNumber(userProfile.phoneNumber || currentUser?.phoneNumber || '');
    }
  }, [userProfile, currentUser, isAuthLoading, router]);

  if (isAuthLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!currentUser || !userProfile) return null;

  const getInitials = (name?: string | null, email?: string | null) => {
    if (name) return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    if (email) return email.substring(0, 2).toUpperCase();
    return 'U';
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userDocRef, {
        displayName: displayName.trim(),
      });
      toast({ title: 'Profile updated', description: 'Your display name has been saved.' });
    } catch (e) {
      toast({ title: 'Error', description: 'Could not save profile. Please try again.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendOtp = async () => {
    if (!newPhone.trim()) return;
    setIsLinkingPhone(true);
    try {
      const digits = newPhone.replace(/\D/g, '');
      const formatted = digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
      const result = await signInWithPhoneNumberFlow(formatted, 'recaptcha-container-profile');
      setConfirmationResult(result);
      setIsCodeSent(true);
      toast({ title: 'Code sent!', description: `Verification code sent to +1 ${newPhone}` });
    } catch (err: any) {
      toast({ title: 'Failed to send code', description: err.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setIsLinkingPhone(false);
    }
  };

  const handleVerifyAndSavePhone = async () => {
    if (!confirmationResult || !otp.trim()) return;
    setIsLinkingPhone(true);
    try {
      // Verify OTP with Firebase Auth
      await confirmPhoneNumberCode(confirmationResult, otp);

      // Save phone number to Firestore profile
      const digits = newPhone.replace(/\D/g, '');
      const formatted = digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
      const userDocRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userDocRef, { phoneNumber: formatted });

      setPhoneNumber(formatted);
      setShowPhoneSection(false);
      setIsCodeSent(false);
      setNewPhone('');
      setOtp('');
      setConfirmationResult(null);
      toast({ title: 'Phone number saved!', description: 'Your phone number has been linked to your profile.' });
    } catch (err: any) {
      toast({ title: 'Verification failed', description: 'Invalid code. Please try again.', variant: 'destructive' });
    } finally {
      setIsLinkingPhone(false);
    }
  };

  const handleSavePhoneDirectly = async () => {
    if (!newPhone.trim()) return;
    setIsSaving(true);
    try {
      const digits = newPhone.replace(/\D/g, '');
      const formatted = digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
      const userDocRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userDocRef, { phoneNumber: formatted });
      setPhoneNumber(formatted);
      setShowPhoneSection(false);
      setNewPhone('');
      toast({ title: 'Phone number saved!', description: 'Your phone number has been linked to your profile.' });
    } catch (e) {
      toast({ title: 'Error', description: 'Could not save phone number.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-6">

      {/* Profile Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={currentUser.photoURL || undefined} alt={userProfile.displayName || 'User'} />
              <AvatarFallback className="text-xl">{getInitials(userProfile.displayName, userProfile.email)}</AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-2xl font-headline text-primary">
                {userProfile.displayName || 'Your Profile'}
              </CardTitle>
              <CardDescription>{userProfile.email || currentUser.phoneNumber}</CardDescription>
              <div className="flex gap-1 mt-1 flex-wrap">
                {(userProfile.roles || []).map(role => (
                  <Badge key={role} variant="secondary" className="text-xs capitalize">{role}</Badge>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Display Name */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5 text-primary" /> Display Name
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Full Name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Your full name"
              className="max-w-sm"
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleSaveProfile} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isSaving ? 'Saving...' : 'Save Name'}
          </Button>
        </CardFooter>
      </Card>

      {/* Phone Number */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" /> Phone Number
          </CardTitle>
          <CardDescription>
            Adding your phone number allows you to receive game rating links via SMS and log in using OTP.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {phoneNumber ? (
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
              <div>
                <p className="font-medium">{phoneNumber}</p>
                <p className="text-xs text-muted-foreground">Phone number linked to your profile</p>
              </div>
              <Button variant="outline" size="sm" className="ml-auto" onClick={() => { setShowPhoneSection(true); setNewPhone(''); }}>
                Change
              </Button>
            </div>
          ) : (
            <Alert variant="default" className="border-amber-300 bg-amber-50">
              <Info className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-700">No phone number linked</AlertTitle>
              <AlertDescription className="text-amber-600">
                Add your phone number so selectors can receive game rating links via SMS.
              </AlertDescription>
            </Alert>
          )}

          {(!phoneNumber || showPhoneSection) && (
            <div className="space-y-4 pt-2 border-t">
              <div className="space-y-1.5">
                <Label htmlFor="newPhone">US Phone Number</Label>
                <div className="flex gap-2 items-center max-w-sm">
                  <div className="flex items-center justify-center h-10 px-3 rounded-md border bg-muted text-sm font-medium text-muted-foreground shrink-0">
                    🇺🇸 +1
                  </div>
                  <Input
                    id="newPhone"
                    type="tel"
                    placeholder="310 555 1234"
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    disabled={isLinkingPhone || isCodeSent}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Enter your 10-digit US phone number</p>
              </div>

              {!isCodeSent ? (
                <div className="flex gap-2">
                  <Button onClick={handleSavePhoneDirectly} disabled={!newPhone.trim() || isSaving} variant="outline">
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save Without Verifying
                  </Button>
                  <Button onClick={handleSendOtp} disabled={!newPhone.trim() || isLinkingPhone}>
                    {isLinkingPhone ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Phone className="mr-2 h-4 w-4" />}
                    {isLinkingPhone ? 'Sending...' : 'Verify via OTP'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="otp">Verification Code</Label>
                    <Input
                      id="otp"
                      type="number"
                      placeholder="Enter 6-digit code"
                      value={otp}
                      onChange={e => setOtp(e.target.value)}
                      maxLength={6}
                      className="max-w-[200px] text-center tracking-widest text-lg"
                      disabled={isLinkingPhone}
                    />
                    <p className="text-xs text-muted-foreground">Code sent to +1 {newPhone}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleVerifyAndSavePhone} disabled={otp.length < 6 || isLinkingPhone}>
                      {isLinkingPhone ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                      {isLinkingPhone ? 'Verifying...' : 'Verify & Save'}
                    </Button>
                    <Button variant="ghost" onClick={() => { setIsCodeSent(false); setOtp(''); setConfirmationResult(null); }}>
                      Resend Code
                    </Button>
                  </div>
                </div>
              )}

              {showPhoneSection && (
                <Button variant="ghost" size="sm" onClick={() => { setShowPhoneSection(false); setIsCodeSent(false); setNewPhone(''); setOtp(''); }}>
                  Cancel
                </Button>
              )}
              <div id="recaptcha-container-profile" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Account Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Account Info
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {userProfile.email && (
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="font-medium">{userProfile.email}</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">User ID</p>
              <p className="font-mono text-xs text-muted-foreground">{currentUser.uid}</p>
            </div>
          </div>
          {userProfile.assignedOrganizationIds?.length > 0 && (
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Organizations</p>
                <p className="font-medium">{userProfile.assignedOrganizationIds.length} organization(s) assigned</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
