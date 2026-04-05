'use server';

import {
  getSeriesByIdFromDB,
  getPlayersWithDetailsFromDB,
  getTeamsForSeriesFromDB,
  getGamesForSeriesFromDB,
  isPlayerAgeEligibleForSeriesFromDB,
  getFitnessTestsForSeriesFromDB,
  ratingValueToNumber,
} from '../db';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

import { suggestTeamComposition as aiSuggestTeamComposition } from '@/ai/flows/suggest-team-composition';
import type { TeamCompositionCriteria, SuggestedTeam } from '@/ai/flows/suggest-team-composition';
import type { PlayerAIData, PlayerWithRatings, Series, FitnessTestResult, FitnessTestHeader, RatingValue } from '../../types';

interface SuggestTeamParams {
  seriesId: string;
  minPrimarySkillScore?: number;
  minFieldingScore?: number;
  minGamesPlayed?: number;
  fitnessFilterOption?: 'none' | 'passedCertified' | 'minScoreCertified';
  minFitnessTestScore?: number;
  criteria: Omit<TeamCompositionCriteria, 'playerData'>;
}

interface SuggestTeamResult {
  success: boolean;
  team?: SuggestedTeam;
  error?: string;
  message?: string;
}

export async function suggestTeam({
  seriesId,
  minPrimarySkillScore,
  minFieldingScore,
  minGamesPlayed,
  fitnessFilterOption = 'none',
  minFitnessTestScore,
  criteria,
}: SuggestTeamParams): Promise<SuggestTeamResult> {
  try {
    const series = await getSeriesByIdFromDB(seriesId);
    if (!series) {
      return { success: false, error: "Selected series not found." };
    }

    if (series.status === 'archived') return { success: false, error: "Cannot suggest team for an archived series." };
    if (!series.organizationId) return { success: false, error: "Series is not associated with an organization."};

    const allPlayersWithFullDetails: PlayerWithRatings[] = await getPlayersWithDetailsFromDB(series.organizationId);
    const teamsInSeries = await getTeamsForSeriesFromDB(seriesId);
    const playerIdsInSeriesTeams = new Set<string>();
    teamsInSeries.forEach(team => team.playerIds.forEach(pid => playerIdsInSeriesTeams.add(pid)));

    let eligiblePlayers = allPlayersWithFullDetails.filter(p => {
      if (!playerIdsInSeriesTeams.has(p.id)) return false;
      if (!isPlayerAgeEligibleForSeriesFromDB(p, series)) return false;
      if (minPrimarySkillScore !== undefined && minPrimarySkillScore > 0 && (p.calculatedAverageScore === 0 || (typeof p.calculatedAverageScore === 'number' && p.calculatedAverageScore < minPrimarySkillScore))) return false;
      if (minFieldingScore !== undefined && minFieldingScore > 0) {
        const fieldingScoreNum = typeof p.averageFieldingScore === 'number' ? p.averageFieldingScore : -1;
        if (fieldingScoreNum < minFieldingScore) return false;
      }
      return true;
    });

    const gamesForSeries = await getGamesForSeriesFromDB(seriesId);
    const gameDataMap = new Map(gamesForSeries.map(g => [g.id, g]));

    eligiblePlayers = eligiblePlayers.filter(p => {
        if (minGamesPlayed !== undefined && minGamesPlayed > 0) {
            const gamesPlayerParticipatedInSeries = new Set(p.ratings.filter(r => gameDataMap.has(r.gameId) && gameDataMap.get(r.gameId)?.seriesId === seriesId).map(r => r.gameId)).size;
            if (gamesPlayerParticipatedInSeries < minGamesPlayed) return false;
        }
        return true;
    });

    if (fitnessFilterOption && fitnessFilterOption !== 'none' && eligiblePlayers.length > 0) {
      if (!series.fitnessTestType || !series.fitnessTestPassingScore) {
        const errorMsg = `The selected fitness filter ('${fitnessFilterOption}') cannot be applied because the series "${series.name}" does not have a fitness test type and/or passing score defined.`;
        return { success: false, error: errorMsg };
      }
      const certifiedHeaders = (await getFitnessTestsForSeriesFromDB(seriesId)).filter(h => h.isCertified && h.testType === series.fitnessTestType);
      if (certifiedHeaders.length > 0) {
        const certifiedHeaderIds = certifiedHeaders.map(h => h.id);
        const playerIdsForFitnessCheck = eligiblePlayers.map(p => p.id);
        const allRelevantFitnessResults: FitnessTestResult[] = [];
        for (let i = 0; i < playerIdsForFitnessCheck.length; i += 30) {
          const playerChunk = playerIdsForFitnessCheck.slice(i, i + 30);
          if (playerChunk.length > 0) {
            const resultsQuery = query(collection(db, 'fitnessTestResults'), where('playerId', 'in', playerChunk), where('fitnessTestHeaderId', 'in', certifiedHeaderIds));
            const resultsSnapshot = await getDocs(resultsQuery);
            resultsSnapshot.forEach(docSnap => allRelevantFitnessResults.push({ id: docSnap.id, ...docSnap.data() } as FitnessTestResult));
          }
        }
        const playerResultsMap = new Map<string, FitnessTestResult[]>();
        allRelevantFitnessResults.forEach(res => { const current = playerResultsMap.get(res.playerId) || []; current.push(res); playerResultsMap.set(res.playerId, current); });
        eligiblePlayers = eligiblePlayers.filter(player => {
          const playerFitnessResults = playerResultsMap.get(player.id) || [];
          if (playerFitnessResults.length === 0) return false;
          if (fitnessFilterOption === 'passedCertified') return playerFitnessResults.some(res => res.result === 'Pass');
          if (fitnessFilterOption === 'minScoreCertified' && minFitnessTestScore !== undefined) return playerFitnessResults.some(res => { const scoreNum = parseFloat(res.score); return !isNaN(scoreNum) && scoreNum >= minFitnessTestScore; });
          return true;
        });
      }
    }

    if (eligiblePlayers.length === 0) {
      let message = "No players found matching all selected criteria (including series, performance, and fitness filters).";
      if (fitnessFilterOption !== 'none' && (!series.fitnessTestType || !series.fitnessTestPassingScore)) {
        message = `No players could be evaluated for fitness as the series "${series.name}" is missing defined fitness criteria (type/passing score).`;
      } else if (fitnessFilterOption !== 'none') {
        message = `No players met the specified fitness criteria ('${fitnessFilterOption}'${fitnessFilterOption === 'minScoreCertified' ? ` with score >= ${minFitnessTestScore}` : ''}) after other filters were applied.`;
      }
      return { success: true, team: [], message };
    }

    const playerDataString = eligiblePlayers.map(p => {
        const ratingsInSeries = p.ratings.filter(r => gameDataMap.has(r.gameId));
        const gamesPlayedInThisSeries = new Set(ratingsInSeries.map(r => r.gameId)).size;

        const primarySkillNumericScores = ratingsInSeries.map(r => {
            let skillValue: RatingValue | undefined;
            switch (p.primarySkill) {
                case 'Batting': skillValue = r.batting; break;
                case 'Bowling': skillValue = r.bowling; break;
                case 'Wicket Keeping': skillValue = r.wicketKeeping; break;
                default: skillValue = 'Not Rated';
            }
            return ratingValueToNumber(skillValue);
        }).filter(score => score !== null) as number[];

        let seriesSpecificAverageScore = 0;
        if (primarySkillNumericScores.length > 0) {
            const sum = primarySkillNumericScores.reduce((acc, curr) => acc + curr, 0);
            seriesSpecificAverageScore = parseFloat((sum / primarySkillNumericScores.length).toFixed(1));
        }

        const aiPlayerData: PlayerAIData = {
            playerName: p.name,
            primarySkill: p.primarySkill,
            battingOrder: p.battingOrder,
            bowlingStyle: p.bowlingStyle,
            dominantHandBatting: p.dominantHandBatting,
            dominantHandBowling: p.dominantHandBowling,
            averageScore: seriesSpecificAverageScore,
            gamesPlayed: gamesPlayedInThisSeries
        };

        let playerStr = `${aiPlayerData.playerName}: PrimarySkill=${aiPlayerData.primarySkill}`;
        if (aiPlayerData.battingOrder) playerStr += `, BattingOrder=${aiPlayerData.battingOrder}`;
        if (aiPlayerData.bowlingStyle) playerStr += `, BowlingStyle=${aiPlayerData.bowlingStyle}`;
        playerStr += `, DominantHandBat=${aiPlayerData.dominantHandBatting}`;
        if (aiPlayerData.dominantHandBowling) playerStr += `, DominantHandBowl=${aiPlayerData.dominantHandBowling}`;
        playerStr += `, AverageScore=${aiPlayerData.averageScore.toFixed(1)}`;
        playerStr += `, GamesPlayed=${aiPlayerData.gamesPlayed}`;
        return playerStr;
    }).join('; \n');

    const fullCriteriaForAI: TeamCompositionCriteria = { ...criteria, playerData: playerDataString };
    const suggestedTeam = await aiSuggestTeamComposition(fullCriteriaForAI);
    return { success: true, team: suggestedTeam, message: "AI team suggestion generated successfully based on all criteria." };
  } catch (error) {
    console.error("Error in suggestTeam action:", error);
    let errorMessage = "An unexpected error occurred while generating the team suggestion.";
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }

    if (errorMessage.toLowerCase().includes("permission-denied") || errorMessage.toLowerCase().includes("missing or insufficient permissions")) {
      return { success: false, error: "Missing or insufficient permissions." };
    }

    return { success: false, error: errorMessage };
  }
}
