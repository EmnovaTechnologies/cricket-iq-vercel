
'use client';

import { db } from '../firebase';
import { collection, query, where, getDocs, limit, doc, writeBatch, serverTimestamp, arrayUnion, updateDoc, deleteField } from 'firebase/firestore';
import { format } from 'date-fns';
import type { Player, RegistrationResult } from '@/types';
import { getPlayerByCricClubsIdFromDB, getTeamByIdFromDB, isPlayerAgeEligibleForTeamCategory, addPlayerToDB } from '../db';
import { randomBytes } from 'crypto';

interface RegistrationData {
    firstName: string;
    lastName: string;
    gender: 'Male' | 'Female';
    dateOfBirth: Date;
    cricClubsId: string;
    email: string;
    password: string;
    primaryTeamId?: string;
    clubName?: string;
}

export async function registerPlayerAction(data: RegistrationData, orgId: string): Promise<RegistrationResult> {
    
    try {
        const existingPlayer = await getPlayerByCricClubsIdFromDB(data.cricClubsId);

        if (existingPlayer) {
            // --- CLAIM PROFILE LOGIC ---
            if (existingPlayer.userId) {
                return { success: false, error: 'This player profile has already been claimed. Please login or contact an administrator if you believe this is an error.' };
            }

            const formattedFormDOB = format(data.dateOfBirth, 'yyyy-MM-dd');
            const namesMatch = existingPlayer.firstName?.trim().toLowerCase() === data.firstName.trim().toLowerCase() &&
                               existingPlayer.lastName?.trim().toLowerCase() === data.lastName.trim().toLowerCase();

            if (namesMatch && existingPlayer.dateOfBirth === formattedFormDOB && existingPlayer.gender === data.gender) {
                // Details match, proceed with claiming
                const registrationToken = randomBytes(16).toString('hex');
                const tokenExpiration = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
                
                const playerDocRef = doc(db, 'players', existingPlayer.id);
                await updateDoc(playerDocRef, {
                    registrationToken: registrationToken,
                    registrationTokenExpires: tokenExpiration,
                });
                
                return { success: true, registrationToken, message: 'Profile found. Proceeding with account creation.' };

            } else {
                // Details do not match, prevent claim
                return { success: false, error: "A player with this CricClubs ID exists, but the personal details (Name, DOB, Gender) do not match. Please correct your information or contact an administrator." };
            }
        } else {
            // --- NEW PLAYER REGISTRATION LOGIC ---
            const registrationToken = randomBytes(16).toString('hex');
            const tokenExpiration = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

            const fullName = `${data.firstName.trim()} ${data.lastName.trim()}`;
            const nameTokens = fullName.toLowerCase().split(' ').filter(Boolean);
            const searchableNameTokens = [...nameTokens, fullName.toLowerCase()];
            
            const newPlayerData: Omit<Player, 'id' | 'gamesPlayed'> & { organizationId: string; registrationToken: string; registrationTokenExpires: Date } = {
                name: fullName,
                firstName: data.firstName.trim(),
                lastName: data.lastName.trim(),
                searchableNameTokens: searchableNameTokens,
                cricClubsId: data.cricClubsId.trim(),
                dateOfBirth: format(data.dateOfBirth, 'yyyy-MM-dd'),
                gender: data.gender,
                organizationId: orgId,
                primaryTeamId: data.primaryTeamId && data.primaryTeamId !== '' ? data.primaryTeamId : undefined,
                clubName: data.clubName && data.clubName !== '' ? data.clubName : undefined,
                registrationToken: registrationToken,
                registrationTokenExpires: tokenExpiration,
            };

            const createdPlayer = await addPlayerToDB(newPlayerData);

            if (createdPlayer.primaryTeamId) {
                const team = await getTeamByIdFromDB(createdPlayer.primaryTeamId);
                if (team && isPlayerAgeEligibleForTeamCategory(createdPlayer, team.ageCategory, new Date().getFullYear())) {
                    const teamRef = doc(db, 'teams', createdPlayer.primaryTeamId);
                    await updateDoc(teamRef, {
                        playerIds: arrayUnion(createdPlayer.id)
                    });
                }
            }
            
            return { success: true, registrationToken, message: 'New player profile created and token generated.' };
        }

    } catch (e: any) {
        console.error("Error in registerPlayerAction:", e);
        return { success: false, error: `An unexpected server error occurred: ${e.message}` };
    }
}
