
'use client';

import {
  addFitnessTestHeaderToDB,
  addFitnessTestResultsToDB,
  getFitnessTestHeaderByIdFromDB,
  certifyFitnessTestHeaderInDB,
  getSeriesByIdFromDB, // To verify series criteria
  updateFitnessTestHeaderInDB, // New DB function needed
  deleteFitnessTestResultsForHeaderFromDB, // New DB function needed
} from '../db';
import type {
  FitnessTestHeader,
  FitnessTestResult,
  FitnessTestType,
  Series,
} from '../../types';
import { parseISO, isValid, format } from 'date-fns';
import { Timestamp } from 'firebase/firestore'; // Needed for serverTimestamp or manual updates

interface CreateFitnessTestHeaderData {
  seriesId: string;
  organizationId: string;
  testType: FitnessTestType;
  testDate: string; // ISO string
  location: string;
  administratorName: string;
}

interface CreateFitnessTestPlayerResultData {
  playerId: string;
  score: string; // Raw score string from input
  notes?: string;
}

interface CreateFitnessTestAndResultsParams {
  headerData: CreateFitnessTestHeaderData;
  resultsData: CreateFitnessTestPlayerResultData[];
}

export async function createFitnessTestAndResultsAction({
  headerData,
  resultsData,
}: CreateFitnessTestAndResultsParams): Promise<{
  success: boolean;
  header?: FitnessTestHeader;
  results?: FitnessTestResult[];
  error?: string;
}> {
  try {
    const series = await getSeriesByIdFromDB(headerData.seriesId);
    if (!series) {
      return { success: false, error: "Series not found." };
    }
    if (series.status === 'archived') {
      return { success: false, error: "Cannot add fitness test to an archived series." };
    }
    if (!series.fitnessTestType || !series.fitnessTestPassingScore) {
      return {
        success: false,
        error: `The selected series "${series.name}" does not have fitness test criteria (type and passing score) defined. Please update the series criteria first.`,
      };
    }
    if (series.fitnessTestType !== headerData.testType) {
      return {
        success: false,
        error: `The fitness test type "${headerData.testType}" does not match the type "${series.fitnessTestType}" defined for the series "${series.name}".`,
      };
    }
    if (series.organizationId !== headerData.organizationId) {
        return { success: false, error: "Fitness test organization ID does not match the series organization ID."};
    }

    const newHeaderData: Omit<FitnessTestHeader, 'id' | 'createdAt' | 'isCertified'> = {
      ...headerData,
      testDate: new Date(headerData.testDate).toISOString(),
    };
    const newHeader = await addFitnessTestHeaderToDB(newHeaderData);

    const seriesPassingScoreNum = parseFloat(series.fitnessTestPassingScore);
    if (isNaN(seriesPassingScoreNum)) {
        console.error(`Series ${series.id} has an invalid passing score: ${series.fitnessTestPassingScore}`);
        return { success: false, error: `Series "${series.name}" has an invalid fitness passing score defined. Please correct it in series settings.` };
    }

    const fullResultsData: Array<Omit<FitnessTestResult, 'id' | 'recordedAt'>> = resultsData.map(pr => {
      const playerScoreNum = parseFloat(pr.score);
      let passFailStatus: 'Pass' | 'Fail' = 'Fail';

      if (!isNaN(playerScoreNum)) {
        passFailStatus = playerScoreNum >= seriesPassingScoreNum ? 'Pass' : 'Fail';
      } else if (pr.score.trim().toUpperCase() === 'ABS' || pr.score.trim() === 'Not Rated' || pr.score.trim() === '') {
        // Handle ABS/Not Rated explicitly, might not always be 'Fail' depending on rules, but for calculation, they don't pass
      } else {
        console.warn(`Player ${pr.playerId} has non-numeric score "${pr.score}" for test ${newHeader.id}. Marking as Fail.`);
      }

      return {
        fitnessTestHeaderId: newHeader.id,
        playerId: pr.playerId,
        seriesId: headerData.seriesId,
        organizationId: headerData.organizationId,
        score: pr.score.trim() === '' ? 'Not Rated' : pr.score.trim().toUpperCase() === 'ABS' ? 'ABS' : pr.score.trim(),
        result: passFailStatus,
        notes: pr.notes,
      };
    });

    const newResults = await addFitnessTestResultsToDB(fullResultsData);

    return { success: true, header: newHeader, results: newResults };
  } catch (error) {
    console.error("Error in createFitnessTestAndResultsAction:", error);
    const message = error instanceof Error ? error.message : "An unexpected error occurred.";
    return { success: false, error: message };
  }
}

export async function certifyFitnessTestAction(
  fitnessTestHeaderId: string,
  certifierUid: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const header = await getFitnessTestHeaderByIdFromDB(fitnessTestHeaderId);
    if (!header) {
      return { success: false, error: "Fitness Test not found." };
    }
    if (header.isCertified) {
      return { success: true, message: "This fitness test has already been certified." };
    }
    const series = await getSeriesByIdFromDB(header.seriesId);
    if (series?.status === 'archived') {
        return { success: false, error: "Cannot certify a fitness test for an archived series." };
    }

    await certifyFitnessTestHeaderInDB(fitnessTestHeaderId, certifierUid);

    return { success: true, message: "Fitness Test certified successfully." };
  } catch (error) {
    console.error("Error in certifyFitnessTestAction:", error);
    const message = error instanceof Error ? error.message : "An unexpected error occurred.";
    return { success: false, error: message };
  }
}

interface UpdateFitnessTestHeaderUpdates {
  testDate?: string; // ISO string
  location?: string;
  administratorName?: string;
}

interface UpdateFitnessTestAndResultsParams {
  headerId: string;
  headerUpdates: UpdateFitnessTestHeaderUpdates;
  resultsData: CreateFitnessTestPlayerResultData[]; // Full new list of results
  currentUserUid: string; // For logging who made the update if needed
}

export async function updateFitnessTestAndResultsAction({
  headerId,
  headerUpdates,
  resultsData,
  currentUserUid, // TODO: Use this for a lastModifiedBy field
}: UpdateFitnessTestAndResultsParams): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const existingHeader = await getFitnessTestHeaderByIdFromDB(headerId);
    if (!existingHeader) {
      return { success: false, error: "Fitness test not found." };
    }
    if (existingHeader.isCertified) {
      return { success: false, error: "Cannot update a fitness test that has already been certified." };
    }
    const series = await getSeriesByIdFromDB(existingHeader.seriesId);
    if (!series) {
      return { success: false, error: "Associated series not found." };
    }
    if (series.status === 'archived') {
      return { success: false, error: "Cannot update fitness test for an archived series." };
    }
    if (!series.fitnessTestType || !series.fitnessTestPassingScore) {
        return { success: false, error: "Series fitness criteria (type/passing score) is missing." };
    }


    // Prepare header data for update
    const headerDataToUpdate: Partial<Omit<FitnessTestHeader, 'id' | 'seriesId' | 'organizationId' | 'testType' | 'createdAt' | 'isCertified' | 'certifiedBy' | 'certifiedAt'>> & { lastModifiedAt?: Timestamp, lastModifiedBy?: string } = {};
    if (headerUpdates.location && headerUpdates.location !== existingHeader.location) {
      headerDataToUpdate.location = headerUpdates.location;
    }
    if (headerUpdates.administratorName && headerUpdates.administratorName !== existingHeader.administratorName) {
      headerDataToUpdate.administratorName = headerUpdates.administratorName;
    }
    if (headerUpdates.testDate && new Date(headerUpdates.testDate).toISOString() !== existingHeader.testDate) {
      // Ensure the new date is also stored as Timestamp for consistency with new tests.
      headerDataToUpdate.testDate = Timestamp.fromDate(new Date(headerUpdates.testDate));
    }

    if (Object.keys(headerDataToUpdate).length > 0 || resultsData.length > 0) {
      headerDataToUpdate.lastModifiedAt = Timestamp.now();
      headerDataToUpdate.lastModifiedBy = currentUserUid;
    }

    if (Object.keys(headerDataToUpdate).length > 0) {
      await updateFitnessTestHeaderInDB(headerId, headerDataToUpdate);
    }

    // Delete existing results
    await deleteFitnessTestResultsForHeaderFromDB(headerId);

    // Add new results
    if (resultsData.length > 0) {
      const seriesPassingScoreNum = parseFloat(series.fitnessTestPassingScore);
      if (isNaN(seriesPassingScoreNum)) {
        // This should ideally not happen if series validation is robust
        return { success: false, error: "Series passing score is invalid."};
      }

      const fullResultsData: Array<Omit<FitnessTestResult, 'id' | 'recordedAt'>> = resultsData.map(pr => {
        const playerScoreNum = parseFloat(pr.score);
        let passFailStatus: 'Pass' | 'Fail' = 'Fail';
        if (!isNaN(playerScoreNum)) {
          passFailStatus = playerScoreNum >= seriesPassingScoreNum ? 'Pass' : 'Fail';
        } else if (pr.score.trim().toUpperCase() === 'ABS' || pr.score.trim() === 'Not Rated' || pr.score.trim() === '') {
           // Handled
        } else {
          // Non-numeric, non-special string
        }
        return {
          fitnessTestHeaderId: headerId,
          playerId: pr.playerId,
          seriesId: existingHeader.seriesId,
          organizationId: existingHeader.organizationId,
          score: pr.score.trim() === '' ? 'Not Rated' : pr.score.trim().toUpperCase() === 'ABS' ? 'ABS' : pr.score.trim(),
          result: passFailStatus,
          notes: pr.notes,
        };
      });
      await addFitnessTestResultsToDB(fullResultsData);
    }

    return { success: true };
  } catch (error) {
    console.error("Error in updateFitnessTestAndResultsAction:", error);
    const message = error instanceof Error ? error.message : "An unexpected error occurred.";
    return { success: false, error: message };
  }
}
