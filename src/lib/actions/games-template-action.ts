'use server';

import { adminDb } from '../firebase-admin';

interface TemplateData {
  series: { id: string; name: string }[];
  venues: { id: string; name: string; seriesNames: string[] }[];
  teams: { id: string; name: string; seriesNames: string[] }[];
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

  // Collect all unique venue IDs across all series
  const allVenueIds = [...new Set(series.flatMap(s => s.venueIds))];
  // Collect all unique team IDs across all series
  const allTeamIds = [...new Set(series.flatMap(s => s.participatingTeams))];

  // Build series name lookup per venue/team
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

  // Fetch venues
  const venues: { id: string; name: string; seriesNames: string[] }[] = [];
  for (let i = 0; i < allVenueIds.length; i += 30) {
    const chunk = allVenueIds.slice(i, i + 30);
    if (chunk.length === 0) continue;
    const snap = await adminDb.collection('venues')
      .where('__name__', 'in', chunk)
      .where('status', '==', 'active')
      .get();
    snap.docs.forEach(d => {
      venues.push({
        id: d.id,
        name: (d.data().name || '').trim(),
        seriesNames: venueSeriesMap.get(d.id) || [],
      });
    });
  }
  venues.sort((a, b) => a.name.localeCompare(b.name));

  // Fetch teams
  const teams: { id: string; name: string; seriesNames: string[] }[] = [];
  for (let i = 0; i < allTeamIds.length; i += 30) {
    const chunk = allTeamIds.slice(i, i + 30);
    if (chunk.length === 0) continue;
    const snap = await adminDb.collection('teams')
      .where('__name__', 'in', chunk)
      .get();
    snap.docs.forEach(d => {
      teams.push({
        id: d.id,
        name: (d.data().name || '').trim(),
        seriesNames: teamSeriesMap.get(d.id) || [],
      });
    });
  }
  teams.sort((a, b) => a.name.localeCompare(b.name));

  return {
    series: series.map(s => ({ id: s.id, name: s.name })),
    venues,
    teams,
  };
}
