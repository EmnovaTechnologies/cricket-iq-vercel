export function parseCricClubsUrl(url: string): {
  league?: string;
  matchId?: string;
  clubId?: string;
  valid: boolean;
} {
  try {
    const match = url.match(/cricclubs\.com\/([^/]+)\/viewScorecard\.do\?matchId=(\d+)&clubId=(\d+)/);
    if (!match) return { valid: false };
    return { league: match[1], matchId: match[2], clubId: match[3], valid: true };
  } catch {
    return { valid: false };
  }
}
