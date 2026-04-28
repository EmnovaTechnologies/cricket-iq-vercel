'use server';

import { adminDb } from '../firebase-admin';
import * as admin from 'firebase-admin';
import type {
  SelectionCamp, CampPlayer, CampAssessment,
  CampFitnessResult, CampSelectionStatus, CampSelectorAssignment
} from '@/types';

const toISO = (val: any): string | undefined => {
  if (!val) return undefined;
  if (typeof val === 'string') return val;
  if (val?.toDate) return val.toDate().toISOString();
  return undefined;
};

const serializeCamp = (doc: any): SelectionCamp => ({
  id: doc.id, ...doc.data(),
  createdAt: toISO(doc.data().createdAt) || new Date().toISOString(),
});

const serializeCampPlayer = (doc: any): CampPlayer => ({
  id: doc.id, ...doc.data(),
  invitedAt: toISO(doc.data().invitedAt) || new Date().toISOString(),
});

const serializeAssessment = (doc: any): CampAssessment => ({
  id: doc.id, ...doc.data(),
  assessedAt: toISO(doc.data().assessedAt) || new Date().toISOString(),
  lockedAt: toISO(doc.data().lockedAt),
});

const serializeFitness = (doc: any): CampFitnessResult => ({
  id: doc.id, ...doc.data(),
  recordedAt: toISO(doc.data().recordedAt) || new Date().toISOString(),
});

// ─── Camps ────────────────────────────────────────────────────────────────────

export async function createCampAction(
  data: Omit<SelectionCamp, 'id' | 'createdAt'>
): Promise<{ success: boolean; campId?: string; error?: string }> {
  try {
    const ref = await adminDb.collection('selectionCamps').add({
      ...data,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: true, campId: ref.id };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function updateCampAction(
  campId: string,
  data: Partial<Omit<SelectionCamp, 'id' | 'createdAt' | 'createdBy'>>
): Promise<{ success: boolean; error?: string }> {
  try {
    await adminDb.collection('selectionCamps').doc(campId).update(data);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function deleteCampAction(
  campId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check no players invited
    const playersSnap = await adminDb.collection('campPlayers')
      .where('campId', '==', campId)
      .limit(1)
      .get();
    if (!playersSnap.empty) {
      return { success: false, error: 'Cannot delete camp — players have been invited. Remove all players first.' };
    }
    // Delete assessments and fitness results too (should be empty but just in case)
    const batch = adminDb.batch();
    const [assessSnap, fitnessSnap] = await Promise.all([
      adminDb.collection('campAssessments').where('campId', '==', campId).get(),
      adminDb.collection('campFitnessResults').where('campId', '==', campId).get(),
    ]);
    assessSnap.docs.forEach(d => batch.delete(d.ref));
    fitnessSnap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(adminDb.collection('selectionCamps').doc(campId));
    await batch.commit();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function getCampsForSeriesAction(
  seriesId: string
): Promise<{ success: boolean; camps?: SelectionCamp[]; error?: string }> {
  try {
    const snap = await adminDb.collection('selectionCamps')
      .where('seriesId', '==', seriesId)
      .get();
    const camps = snap.docs.map(serializeCamp)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return { success: true, camps };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function getCampByIdAction(
  campId: string
): Promise<{ success: boolean; camp?: SelectionCamp; error?: string }> {
  try {
    const doc = await adminDb.collection('selectionCamps').doc(campId).get();
    if (!doc.exists) return { success: false, error: 'Camp not found.' };
    return { success: true, camp: serializeCamp(doc) };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ─── Camp Players ─────────────────────────────────────────────────────────────

export async function invitePlayerToCampAction(
  data: Omit<CampPlayer, 'id' | 'invitedAt'>
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check bib not already taken
    const existing = await adminDb.collection('campPlayers')
      .where('campId', '==', data.campId)
      .where('bibNumber', '==', data.bibNumber)
      .get();
    if (!existing.empty) {
      return { success: false, error: `Bib #${data.bibNumber} is already assigned in this camp.` };
    }
    // Check player not already invited
    const existingPlayer = await adminDb.collection('campPlayers')
      .where('campId', '==', data.campId)
      .where('playerId', '==', data.playerId)
      .get();
    if (!existingPlayer.empty) {
      return { success: false, error: 'This player is already invited to this camp.' };
    }
    await adminDb.collection('campPlayers').add({
      ...data,
      invitedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function updateCampPlayerAction(
  campPlayerId: string,
  data: Partial<Pick<CampPlayer, 'bibNumber' | 'status' | 'selectionStatus' | 'selectionNotes'>>
): Promise<{ success: boolean; error?: string }> {
  try {
    await adminDb.collection('campPlayers').doc(campPlayerId).update(data);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function removeCampPlayerAction(
  campPlayerId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await adminDb.collection('campPlayers').doc(campPlayerId).delete();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function getCampPlayersAction(
  campId: string
): Promise<{ success: boolean; players?: CampPlayer[]; error?: string }> {
  try {
    const snap = await adminDb.collection('campPlayers')
      .where('campId', '==', campId)
      .get();
    // Sort client-side to avoid composite index requirement
    const players = snap.docs.map(serializeCampPlayer)
      .sort((a, b) => a.bibNumber - b.bibNumber);
    return { success: true, players };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function saveFinalSelectionAction(
  campId: string,
  selections: { campPlayerId: string; selectionStatus: CampSelectionStatus; selectionNotes?: string }[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const batch = adminDb.batch();
    selections.forEach(({ campPlayerId, selectionStatus, selectionNotes }) => {
      const ref = adminDb.collection('campPlayers').doc(campPlayerId);
      batch.update(ref, { selectionStatus, selectionNotes: selectionNotes || null });
    });
    await batch.commit();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ─── Camp Assessments ─────────────────────────────────────────────────────────

export async function submitCampAssessmentAction(
  data: Omit<CampAssessment, 'id' | 'assessedAt'>
): Promise<{ success: boolean; assessmentId?: string; error?: string }> {
  try {
    // One assessment per coach per bib per camp
    const existing = await adminDb.collection('campAssessments')
      .where('campId', '==', data.campId)
      .where('bibNumber', '==', data.bibNumber)
      .where('assessedByUid', '==', data.assessedByUid)
      .get();
    if (!existing.empty) {
      return { success: false, error: 'You have already submitted an assessment for this bib. Edit your existing one.' };
    }
    const ref = await adminDb.collection('campAssessments').add({
      ...data,
      assessedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: true, assessmentId: ref.id };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function updateCampAssessmentAction(
  assessmentId: string,
  coachUid: string,
  data: Partial<Omit<CampAssessment, 'id' | 'campId' | 'assessedByUid' | 'assessedAt'>>
): Promise<{ success: boolean; error?: string }> {
  try {
    const doc = await adminDb.collection('campAssessments').doc(assessmentId).get();
    if (!doc.exists) return { success: false, error: 'Assessment not found.' };
    if (doc.data()?.assessedByUid !== coachUid) return { success: false, error: 'You can only edit your own assessments.' };
    if (doc.data()?.isLocked) return { success: false, error: 'Assessment is locked. Unlock before editing.' };
    await adminDb.collection('campAssessments').doc(assessmentId).update(data);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function lockCampAssessmentAction(
  assessmentId: string,
  coachUid: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const doc = await adminDb.collection('campAssessments').doc(assessmentId).get();
    if (!doc.exists) return { success: false, error: 'Assessment not found.' };
    if (doc.data()?.assessedByUid !== coachUid) return { success: false, error: 'You can only lock your own assessments.' };
    await adminDb.collection('campAssessments').doc(assessmentId).update({
      isLocked: true,
      lockedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function unlockCampAssessmentAction(
  assessmentId: string,
  coachUid: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const doc = await adminDb.collection('campAssessments').doc(assessmentId).get();
    if (!doc.exists) return { success: false, error: 'Assessment not found.' };
    if (doc.data()?.assessedByUid !== coachUid) return { success: false, error: 'You can only unlock your own assessments.' };
    await adminDb.collection('campAssessments').doc(assessmentId).update({
      isLocked: false,
      lockedAt: admin.firestore.FieldValue.delete(),
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function getCampAssessmentsAction(
  campId: string
): Promise<{ success: boolean; assessments?: CampAssessment[]; error?: string }> {
  try {
    const snap = await adminDb.collection('campAssessments')
      .where('campId', '==', campId)
      .get();
    return { success: true, assessments: snap.docs.map(serializeAssessment) };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function getMyCampAssessmentsAction(
  campId: string,
  coachUid: string
): Promise<{ success: boolean; assessments?: CampAssessment[]; error?: string }> {
  try {
    const snap = await adminDb.collection('campAssessments')
      .where('campId', '==', campId)
      .where('assessedByUid', '==', coachUid)
      .get();
    const assessments = snap.docs.map(serializeAssessment)
      .sort((a, b) => a.bibNumber - b.bibNumber);
    return { success: true, assessments };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ─── Camp Selector Assignment ────────────────────────────────────────────────

export async function assignSelectorToCampAction(
  campId: string,
  selector: { uid: string; name: string; clubName?: string },
  assignedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const doc = await adminDb.collection('selectionCamps').doc(campId).get();
    if (!doc.exists) return { success: false, error: 'Camp not found.' };
    const existing: any[] = doc.data()?.assignedSelectors || [];
    if (existing.some((s: any) => s.uid === selector.uid)) {
      return { success: false, error: 'This selector is already assigned to this camp.' };
    }
    const newAssignment = {
      uid: selector.uid,
      name: selector.name,
      clubName: selector.clubName || null,
      assignedAt: new Date().toISOString(),
      assignedBy,
    };
    await adminDb.collection('selectionCamps').doc(campId).update({
      assignedSelectors: admin.firestore.FieldValue.arrayUnion(newAssignment),
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function removeSelectorFromCampAction(
  campId: string,
  selectorUid: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const doc = await adminDb.collection('selectionCamps').doc(campId).get();
    if (!doc.exists) return { success: false, error: 'Camp not found.' };
    const existing: any[] = doc.data()?.assignedSelectors || [];
    const updated = existing.filter((s: any) => s.uid !== selectorUid);
    await adminDb.collection('selectionCamps').doc(campId).update({ assignedSelectors: updated });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function getCampsForSelectorAction(
  selectorUid: string,
  organizationId: string
): Promise<{ success: boolean; camps?: SelectionCamp[]; error?: string }> {
  try {
    // Query camps where this selector is assigned - Firestore array-contains on nested field
    // requires querying by a specific field, so we use assignedSelectors array
    const snap = await adminDb.collection('selectionCamps')
      .where('organizationId', '==', organizationId)
      .get();
    // Filter client-side for selector uid
    const camps = snap.docs
      .map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.()?.toISOString() || d.data().createdAt } as SelectionCamp))
      .filter(c => (c.assignedSelectors || []).some((s: any) => s.uid === selectorUid))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return { success: true, camps };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ─── Camp Fitness Results ─────────────────────────────────────────────────────

export async function recordCampFitnessResultAction(
  data: Omit<CampFitnessResult, 'id' | 'recordedAt'>
): Promise<{ success: boolean; error?: string }> {
  try {
    // Upsert — one result per player per camp
    const existing = await adminDb.collection('campFitnessResults')
      .where('campId', '==', data.campId)
      .where('playerId', '==', data.playerId)
      .get();
    if (!existing.empty) {
      await existing.docs[0].ref.update({
        ...data,
        recordedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      await adminDb.collection('campFitnessResults').add({
        ...data,
        recordedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function getCampFitnessResultsAction(
  campId: string
): Promise<{ success: boolean; results?: CampFitnessResult[]; error?: string }> {
  try {
    const snap = await adminDb.collection('campFitnessResults')
      .where('campId', '==', campId)
      .get();
    const results = snap.docs.map(serializeFitness)
      .sort((a, b) => a.bibNumber - b.bibNumber);
    return { success: true, results };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
