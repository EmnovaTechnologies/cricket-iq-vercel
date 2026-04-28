'use server';

import { adminDb } from '../firebase-admin';
import { suggestCampTeam } from '@/ai/flows/suggest-camp-team';
import type { CampSelectionCriteria, CampSuggestedTeam } from '@/ai/flows/suggest-camp-team';
import type { CampPlayer, CampAssessment, CampFitnessResult, SelectionCamp } from '@/types';

const toISO = (val: any) => val?.toDate ? val.toDate().toISOString() : val;

interface RunCampAIParams {
  campId: string;
  criteria: Omit<CampSelectionCriteria, 'playerData' | 'campName'>;
}

interface RunCampAIResult {
  success: boolean;
  team?: CampSuggestedTeam;
  message?: string;
  error?: string;
}

export async function runCampAISelectionAction({
  campId,
  criteria,
}: RunCampAIParams): Promise<RunCampAIResult> {
  try {
    // 1. Load camp
    const campDoc = await adminDb.collection('selectionCamps').doc(campId).get();
    if (!campDoc.exists) return { success: false, error: 'Camp not found.' };
    const camp = { id: campDoc.id, ...campDoc.data() } as SelectionCamp;

    // 2. Load camp players
    const playersSnap = await adminDb.collection('campPlayers')
      .where('campId', '==', campId)
      .where('status', '!=', 'withdrawn')
      .get();
    const campPlayers: CampPlayer[] = playersSnap.docs.map(d => ({
      id: d.id, ...d.data(),
      invitedAt: toISO(d.data().invitedAt) || '',
    } as CampPlayer));

    if (campPlayers.length === 0) {
      return { success: true, team: [], message: 'No active players in this camp.' };
    }

    // 3. Load all assessments for this camp
    const assessSnap = await adminDb.collection('campAssessments')
      .where('campId', '==', campId)
      .get();
    const assessments: CampAssessment[] = assessSnap.docs.map(d => ({
      id: d.id, ...d.data(),
      assessedAt: toISO(d.data().assessedAt) || '',
    } as CampAssessment));

    // 4. Load fitness results
    const fitnessSnap = await adminDb.collection('campFitnessResults')
      .where('campId', '==', campId)
      .get();
    const fitnessResults: CampFitnessResult[] = fitnessSnap.docs.map(d => ({
      id: d.id, ...d.data(),
      recordedAt: toISO(d.data().recordedAt) || '',
    } as CampFitnessResult));

    // 5. Build assessment map: bibNumber → assessments[]
    const assessByBib = new Map<number, CampAssessment[]>();
    assessments.forEach(a => {
      const arr = assessByBib.get(a.bibNumber) || [];
      arr.push(a);
      assessByBib.set(a.bibNumber, arr);
    });

    // 6. Build fitness map: playerId → result
    const fitByPlayer = new Map<string, CampFitnessResult>();
    fitnessResults.forEach(f => fitByPlayer.set(f.playerId, f));

    // 7. Load series performance if weight > 0
    const seriesAvgByPlayer = new Map<string, number>();
    if (criteria.weightSeriesPerformance > 0 && camp.seriesId) {
      try {
        const gamesSnap = await adminDb.collection('games')
          .where('seriesId', '==', camp.seriesId)
          .get();
        const gameIds = gamesSnap.docs.map(d => d.id);
        if (gameIds.length > 0) {
          for (const cp of campPlayers) {
            const ratingsSnap = await adminDb.collection('ratings')
              .where('playerId', '==', cp.playerId)
              .where('gameId', 'in', gameIds.slice(0, 30))
              .get();
            if (!ratingsSnap.empty) {
              const scores = ratingsSnap.docs.map(d => parseFloat(d.data().primarySkillScore || '0')).filter(s => s > 0);
              if (scores.length > 0) {
                seriesAvgByPlayer.set(cp.playerId, scores.reduce((a, b) => a + b, 0) / scores.length);
              }
            }
          }
        }
      } catch (e) {
        console.warn('[CampAI] Could not load series performance:', e);
      }
    }

    // 8. Build player data string
    const playerDataLines = campPlayers.map(cp => {
      const bibs = assessByBib.get(cp.bibNumber) || [];
      const coachCount = bibs.length;

      // Average assessment scores
      const avg = (key: keyof CampAssessment) => {
        const vals = bibs.map(a => a[key] as number).filter(v => typeof v === 'number');
        return vals.length ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)) : 0;
      };

      const avgBatting = avg('batting');
      const avgBowling = avg('bowling');
      const avgFielding = avg('fielding');
      const avgFitnessRating = avg('fitness');
      const avgAttitude = avg('attitude');
      const avgOverall = avg('overall');
      const avgAssessment = coachCount > 0
        ? parseFloat(((avgBatting + avgBowling + avgFielding + avgFitnessRating + avgAttitude + avgOverall) / 6).toFixed(1))
        : 0;

      // Coach suggested skill — majority vote, fallback to latest
      const skillVotes = bibs.filter(a => a.coachSuggestedSkill).map(a => a.coachSuggestedSkill!);
      const coachSkill = skillVotes.length > 0
        ? skillVotes.sort((a, b) => skillVotes.filter(s => s === b).length - skillVotes.filter(s => s === a).length)[0]
        : 'same';

      // Fitness
      const fitnessResult = fitByPlayer.get(cp.playerId);
      const fitnessScore = fitnessResult ? fitnessResult.score.toString() : 'N/A';
      const fitnessPass = fitnessResult ? (fitnessResult.passed ? 'Pass' : 'Fail') : 'N/A';

      // Series performance
      const seriesAvg = seriesAvgByPlayer.has(cp.playerId)
        ? seriesAvgByPlayer.get(cp.playerId)!.toFixed(1)
        : 'N/A';

      return `Bib#${cp.bibNumber} | Name: ${cp.playerName} | PlayerSkill: ${cp.playerPrimarySkill} | CoachSkill: ${coachSkill} | AvgAssessment: ${avgAssessment} | Batting: ${avgBatting} | Bowling: ${avgBowling} | Fielding: ${avgFielding} | Fitness: ${avgFitnessRating} | Attitude: ${avgAttitude} | Coaches: ${coachCount} | FitnessScore: ${fitnessScore} | FitnessPass: ${fitnessPass} | SeriesAvg: ${seriesAvg}`;
    });

    if (playerDataLines.length === 0) {
      return { success: true, team: [], message: 'No player data available for AI selection.' };
    }

    // 9. Run AI
    const fullCriteria: CampSelectionCriteria = {
      ...criteria,
      campName: camp.name,
      playerData: playerDataLines.join('\n'),
    };

    const team = await suggestCampTeam(fullCriteria);
    return { success: true, team, message: 'Camp AI selection generated successfully.' };

  } catch (e: any) {
    console.error('[runCampAISelectionAction] Error:', e);
    return { success: false, error: e.message || 'Unexpected error during camp AI selection.' };
  }
}
