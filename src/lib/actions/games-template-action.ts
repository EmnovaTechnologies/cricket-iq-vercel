'use server';

import { adminDb } from '../firebase-admin';

interface TemplateData {
  series: { id: string; name: string }[];
  venues: { id: string; name: string; seriesNames: string[] }[];
  teams: { id: string; name: string; seriesNames: string[] }[];
  selectorEmails: string[];
}

export async function getGamesTemplateData(organizationId: string): Promise<TemplateData> {
  if (!organizationId) throw new Error('Organization ID is required.');

  // Fetch active series for this org
  const seriesSnap = await adminDb.collection('series')
    .where('organizationId', '==', organizationId)
    .where('status', '==', 'active')
    .get();

  const series = seriesSnap.docs.map(d => ({
    id: d.id,
    name: (d.data().name || '').trim(),
    venueIds: (d.data().venueIds || []) as string[],
    participatingTeams: (d.data().participatingTeams || []) as string[],
  })).sort((a, b) => a.name.localeCompare(b.name));

  const allVenueIds = [...new Set(series.flatMap(s => s.venueIds))];
  const allTeamIds = [...new Set(series.flatMap(s => s.participatingTeams))];

  const venueSeriesMap = new Map<string, string[]>();
  const teamSeriesMap = new Map<string, string[]>();
  for (const s of series) {
    for (const vid of s.venueIds) {
      if (!venueSeriesMap.has(vid)) venueSeriesMap.set(vid, []);
      venueSeriesMap.get(vid)!.push(s.name);
    }
    for (const tid of s.participatingTeams) {
      if (!teamSeriesMap.has(tid)) teamSeriesMap.set(tid, []);
      teamSeriesMap.get(tid)!.push(s.name);
    }
  }

  const venues: { id: string; name: string; seriesNames: string[] }[] = [];
  for (let i = 0; i < allVenueIds.length; i += 30) {
    const chunk = allVenueIds.slice(i, i + 30);
    if (!chunk.length) continue;
    const snap = await adminDb.collection('venues').where('__name__', 'in', chunk).where('status', '==', 'active').get();
    snap.docs.forEach(d => venues.push({ id: d.id, name: (d.data().name || '').trim(), seriesNames: venueSeriesMap.get(d.id) || [] }));
  }
  venues.sort((a, b) => a.name.localeCompare(b.name));

  const teams: { id: string; name: string; seriesNames: string[] }[] = [];
  for (let i = 0; i < allTeamIds.length; i += 30) {
    const chunk = allTeamIds.slice(i, i + 30);
    if (!chunk.length) continue;
    const snap = await adminDb.collection('teams').where('__name__', 'in', chunk).get();
    snap.docs.forEach(d => teams.push({ id: d.id, name: (d.data().name || '').trim(), seriesNames: teamSeriesMap.get(d.id) || [] }));
  }
  teams.sort((a, b) => a.name.localeCompare(b.name));

  // Fetch selectors: super admins globally + selector/Series Admin scoped to org
  const emailSet = new Set<string>();

  const superAdminSnap = await adminDb.collection('users').where('roles', 'array-contains', 'admin').get();
  superAdminSnap.docs.forEach(d => { const e = d.data().email?.trim(); if (e) emailSet.add(e); });

  const orgUsersSnap = await adminDb.collection('users').where('assignedOrganizationIds', 'array-contains', organizationId).get();
  orgUsersSnap.docs.forEach(d => {
    const roles: string[] = d.data().roles || [];
    if (roles.includes('selector') || roles.includes('Series Admin')) {
      const e = d.data().email?.trim();
      if (e) emailSet.add(e);
    }
  });

  return {
    series: series.map(s => ({ id: s.id, name: s.name })),
    venues,
    teams,
    selectorEmails: Array.from(emailSet).sort(),
  };
}
