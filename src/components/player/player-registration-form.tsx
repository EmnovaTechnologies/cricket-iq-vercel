
'use client';

import type { Organization, Team } from '@/types';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GENDERS } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';
import { registerPlayerAction } from '@/lib/actions/player-registration-actions';
import { Loader2, AlertTriangle } from 'lucide-react';
import { DatePickerField } from '@/components/date-picker-field';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { useAuth } from '@/contexts/auth-context';


const playerRegistrationSchema = z.object({
  firstName: z.string().min(1, 'First name is required.'),
  lastName: z.string().min(1, 'Last name is required.'),
  gender: z.enum(GENDERS, { required_error: 'Gender is required.' }),
  dateOfBirth: z.date({ required_error: 'Date of Birth is required.' }),
  cricClubsId: z.string().min(1, 'CricClubs ID is required.'),
  email: z.string().email('Please enter a valid email address.'),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
  primaryTeamId: z.string().optional(),
  clubName: z.string().optional(),
});

type PlayerRegistrationFormValues = z.infer<typeof playerRegistrationSchema>;

interface PlayerRegistrationFormProps {
    organization: Organization;
    teams: Team[];
}

export function PlayerRegistrationForm({ organization, teams }: PlayerRegistrationFormProps) {
    const { toast } = useToast();
    const router = useRouter();
    const { signUpAsPlayer, currentUser, isAuthLoading } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);

    const form = useForm<PlayerRegistrationFormValues>({
        resolver: zodResolver(playerRegistrationSchema),
        defaultValues: {
            firstName: '', lastName: '', gender: undefined,
            cricClubsId: '', email: '', password: '', primaryTeamId: undefined,
            clubName: undefined,
        },
    });

    useEffect(() => {
        if (!isAuthLoading && currentUser) {
            toast({
                title: "Registration Complete!",
                description: "Welcome! Redirecting you to the dashboard...",
            });
            router.push('/');
        }
    }, [currentUser, isAuthLoading, router, toast]);

    async function onSubmit(data: PlayerRegistrationFormValues) {
        setIsLoading(true);
        setServerError(null);

        try {
            const validationResult = await registerPlayerAction(data, organization.id);
            
            if (validationResult.success && validationResult.registrationToken) {
                const displayName = `${data.firstName} ${data.lastName}`;
                await signUpAsPlayer(data.email, data.password, displayName, validationResult.registrationToken);
            } else {
                setServerError(validationResult.error || "An unknown validation error occurred.");
                setIsLoading(false);
            }
        } catch(e: any) {
            console.error("Error during full registration process:", e);
            setServerError(e.message || "An unexpected error occurred during form submission.");
            setIsLoading(false);
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <FormField control={form.control} name="firstName" render={({ field }) => (
                        <FormItem>
                            <FormLabel>First Name</FormLabel>
                            <FormControl><Input placeholder="John" {...field} disabled={isLoading} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}/>
                     <FormField control={form.control} name="lastName" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Last Name</FormLabel>
                            <FormControl><Input placeholder="Doe" {...field} disabled={isLoading} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}/>
                </div>
                 <FormField control={form.control} name="cricClubsId" render={({ field }) => (
                    <FormItem>
                        <FormLabel>CricClubs ID</FormLabel>
                        <FormControl><Input placeholder="Enter your CricClubs ID" {...field} disabled={isLoading} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )}/>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="dateOfBirth" render={({ field }) => (
                        <DatePickerField
                          field={field}
                          label="Date of Birth"
                          required
                          fromYear={1950}
                          toYear={new Date().getFullYear()}
                          disabled={isLoading}
                        />
                    )}/>
                    <FormField control={form.control} name="gender" render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Gender</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={isLoading}>
                                <FormControl><SelectTrigger className="mt-auto"><SelectValue placeholder="Select gender" /></SelectTrigger></FormControl>
                                <SelectContent>{GENDERS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                            </Select>
                            <FormDescription>Select your gender.</FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}/>
                </div>
                 
                <FormField
                    control={form.control}
                    name="clubName"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Club (Optional)</FormLabel>
                        <Select
                            onValueChange={field.onChange}
                            value={field.value}
                            disabled={isLoading || !organization.clubs || organization.clubs.length === 0}
                        >
                            <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder={organization.clubs && organization.clubs.length > 0 ? "Select your club" : "No clubs available for this organization"} />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                            {organization.clubs?.map((club) => (
                                <SelectItem key={club} value={club}>
                                {club}
                                </SelectItem>
                            ))}
                            </SelectContent>
                        </Select>
                        <FormDescription>Select the club you are primarily associated with.</FormDescription>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                 
                 <FormField control={form.control} name="primaryTeamId" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Primary Team (Optional)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={isLoading || teams.length === 0}>
                            <FormControl><SelectTrigger><SelectValue placeholder={teams.length > 0 ? "Select a team" : "No teams available"} /></SelectTrigger></FormControl>
                            <SelectContent>
                                {teams.map(team => <SelectItem key={team.id} value={team.id}>{team.name} ({team.ageCategory})</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <FormDescription>Select a team to be associated with upon registration.</FormDescription>
                        <FormMessage />
                    </FormItem>
                )}/>

                <hr/>
                <h3 className="text-lg font-medium">Create Your Login</h3>
                <p className="text-sm text-muted-foreground -mt-4">
                    Create a password to log in and manage your profile later.
                </p>

                <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl><Input type="email" placeholder="you@example.com" {...field} disabled={isLoading} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )}/>
                <FormField control={form.control} name="password" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl><Input type="password" placeholder="••••••••" {...field} disabled={isLoading} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )}/>

                {serverError && (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4"/>
                        <AlertTitle>Registration Failed</AlertTitle>
                        <AlertDescription>{serverError}</AlertDescription>
                    </Alert>
                )}

                <Button type="submit" disabled={isLoading} className="w-full">
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                    {isLoading ? 'Processing...' : 'Complete Registration'}
                </Button>
            </form>
        </Form>
    );
}
