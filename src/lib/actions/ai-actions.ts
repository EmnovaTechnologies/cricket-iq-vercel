'use server';

import {
  adminGetSeriesById,
  adminGetPlayersWithDetails,
  adminGetTeamsForSeries,
  adminGetGamesForSeries,
  adminGetFitnessTestsForSeries,
  adminGetFitnessTestResults,
  isPlayerEligibleForSeries,
  ratingValueToNumber,
} from '../admin-db';

import { suggestTeamComposition as aiSuggestTeamComposition } from '@/ai/flows/suggest-team-composition';
import type { TeamCompositionCriteria, SuggestedTeam } from '@/ai/flows/suggest-team-composition';
import type { PlayerWithRatings, RatingValue } from '../../types';

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
    const series = await adminGetSeriesById(seriesId);
    if (!series) return { success: false, error: "Selected series not found." };
    if (series.status === 'archived') return { success: false, error: "Cannot suggest team for an archived series." };
    if (!series.organizationId) return { success: false, error: "Series is not associated with an organization." };

    const allPlayersWithFullDetails: PlayerWithRatings[] = await adminGetPlayersWithDetails(series.organizationId);
    const teamsInSeries = await adminGetTeamsForSeries(seriesId);
    const playerIdsInSeriesTeams = new Set<string>();
    teamsInSeries.forEach(team => team.playerIds?.forEach(pid => playerIdsInSeriesTeams.add(pid)));

    const gamesForSeries = await adminGetGamesForSeries(seriesId);
    const gameDataMap = new Map(gamesForSeries.map(g => [g.id, g]));

    let eligiblePlayers = allPlayersWithFullDetails.filter(p => {
      if (!playerIdsInSeriesTeams.has(p.id)) return false;
      if (!isPlayerEligibleForSeries(p, series)) return false;
      if (minPrimarySkillScore !== undefined && minPrimarySkillScore > 0 &&
        (p.calculatedAverageScore === 0 || (typeof p.calculatedAverageScore === 'number' && p.calculatedAverageScore < minPrimarySkillScore))) return false;
      if (minFieldingScore !== undefined && minFieldingScore > 0) {
        const fieldingScoreNum = typeof p.averageFieldingScore === 'number' ? p.averageFieldingScore : -1;
        if (fieldingScoreNum < minFieldingScore) return false;
      }
      return true;
    });

    eligiblePlayers = eligiblePlayers.filter(p => {
      if (minGamesPlayed !== undefined && minGamesPlayed > 0) {
        const gamesInSeries = new Set(p.ratings.filter(r => gameDataMap.has(r.gameId) && gameDataMap.get(r.gameId)?.seriesId === seriesId).map(r => r.gameId)).size;
        if (gamesInSeries < minGamesPlayed) return false;
      }
      return true;
    });

    if (fitnessFilterOption && fitnessFilterOption !== 'none' && eligiblePlayers.length > 0) {
      if (!series.fitnessTestType || !series.fitnessTestPassingScore) {
        return { success: false, error: `The selected fitness filter cannot be applied because the series "${series.name}" does not have a fitness test type and/or passing score defined.` };
      }
      const certifiedHeaders = await adminGetFitnessTestsForSeries(seriesId);
      const filteredHeaders = certifiedHeaders.filter(h => h.testType === series.fitnessTestType);

      if (filteredHeaders.length > 0) {
        const certifiedHeaderIds = filteredHeaders.map(h => h.id);
        const playerIdsForCheck = eligiblePlayers.map(p => p.id);
        const allFitnessResults = await adminGetFitnessTestResults(playerIdsForCheck, certifiedHeaderIds);

        const playerResultsMap = new Map<string, typeof allFitnessResults>();
        allFitnessResults.forEach(res => {
          const curr = playerResultsMap.get(res.playerId) || [];
          curr.push(res);
          playerResultsMap.set(res.playerId, curr);
        });

        eligiblePlayers = eligiblePlayers.filter(player => {
          const results = playerResultsMap.get(player.id) || [];
          if (!results.length) return false;
          if (fitnessFilterOption === 'passedCertified') return results.some(r => r.result === 'Pass');
          if (fitnessFilterOption === 'minScoreCertified' && minFitnessTestScore !== undefined)
            return results.some(r => { const s = parseFloat(r.score); return !isNaN(s) && s >= minFitnessTestScore; });
          return true;
        });
      }
    }

    if (eligiblePlayers.length === 0) {
      return { success: true, team: [], message: "No players found matching all selected criteria." };
    }

    const playerDataString = eligiblePlayers.map(p => {
      const ratingsInSeries = p.ratings.filter(r => gameDataMap.has(r.gameId));
      const gamesPlayedInSeries = new Set(ratingsInSeries.map(r => r.gameId)).size;

      const primaryScores = ratingsInSeries.map(r => {
        let val: RatingValue | undefined;
        if (p.primarySkill === 'Batting') val = r.batting;
        else if (p.primarySkill === 'Bowling') val = r.bowling;
        else if (p.primarySkill === 'Wicket Keeping') val = r.wicketKeeping;
        return ratingValueToNumber(val);
      }).filter(s => s !== null) as number[];

      const avgScore = primaryScores.length
        ? parseFloat((primaryScores.reduce((a, b) => a + b, 0) / primaryScores.length).toFixed(1))
        : 0;

      let str = `${p.name}: PrimarySkill=${p.primarySkill}`;
      if (p.battingOrder) str += `, BattingOrder=${p.battingOrder}`;
      if (p.bowlingStyle) str += `, BowlingStyle=${p.bowlingStyle}`;
      str += `, DominantHandBat=${p.dominantHandBatting}`;
      if (p.dominantHandBowling) str += `, DominantHandBowl=${p.dominantHandBowling}`;
      str += `, AverageScore=${avgScore.toFixed(1)}`;
      str += `, GamesPlayed=${gamesPlayedInSeries}`;
      return str;
    }).join('; \n');

    const fullCriteria: TeamCompositionCriteria = { ...criteria, playerData: playerDataString };
    const suggestedTeam = await aiSuggestTeamComposition(fullCriteria);
    return { success: true, team: suggestedTeam, message: "AI team suggestion generated successfully." };

  } catch (error) {
    console.error("Error in suggestTeam action:", error);
    let errorMessage = "An unexpected error occurred while generating the team suggestion.";
    if (error instanceof Error) errorMessage = error.message;
    else if (typeof error === 'string') errorMessage = error;
    if (errorMessage.toLowerCase().includes("permission-denied") || errorMessage.toLowerCase().includes("missing or insufficient permissions")) {
      return { success: false, error: "Missing or insufficient permissions." };
    }
    return { success: false, error: errorMessage };
  }
}
