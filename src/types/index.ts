

import type { RATING_VALUES, PRIMARY_SKILLS, BATTING_ORDERS, BOWLING_STYLES, DOMINANT_HANDS, GENDERS, AGE_CATEGORIES, USER_ROLES, ORGANIZATION_STATUSES, PREDEFINED_THEME_NAMES, VENUE_STATUSES, FITNESS_TEST_TYPES } from '@/lib/constants';
import type { PermissionKey as MasterPermissionKey } from '@/lib/permissions-master-list';
import type { SuggestedTeam as AISuggestedTeam } from '@/ai/flows/suggest-team-composition';


export type RatingValue = typeof RATING_VALUES[number];
export type PrimarySkill = typeof PRIMARY_SKILLS[number];
export type BattingOrder = typeof BATTING_ORDERS[number];
export type BowlingStyle = typeof BOWLING_STYLES[number];
export type DominantHand = typeof DOMINANT_HANDS[number];
export type Gender = typeof GENDERS[number];
export type AgeCategory = typeof AGE_CATEGORIES[number];
export type UserRole = typeof USER_ROLES[number];
export type OrganizationStatus = typeof ORGANIZATION_STATUSES[number];
export type PredefinedThemeName = typeof PREDEFINED_THEME_NAMES[number];
export type VenueStatus = typeof VENUE_STATUSES[number];
export type FitnessTestType = typeof FITNESS_TEST_TYPES[number];
export type PermissionKey = MasterPermissionKey;
export type SuggestedTeam = AISuggestedTeam;

export interface RolePermissionsConfig {
  [roleName: string]: {
    permissions: Partial<Record<PermissionKey, boolean>>;
  };
}

export interface OrganizationBranding {
  themeName?: PredefinedThemeName;
  logoUrl?: string | null;
  bannerUrl?: string | null;
}

export interface Organization {
  id: string;
  name: string;
  organizationAdminUids: string[];
  branding?: OrganizationBranding;
  status: OrganizationStatus;
  clubs?: string[];
  createdAt?: string | null;
  // Selection model settings
  selectionModel?: 'rating' | 'performance' | 'hybrid';
  ratingScope?: 'opposing_only' | 'own_team' | 'both_teams';
  ratingVisibility?: 'admin_only' | 'selectors_own' | 'all_selectors';
  ratingAggregation?: 'average' | 'latest';
  selectorReportScope?: 'opposing_only' | 'both_teams' | 'own_team_only';
  // Stripe Subscription Fields
  stripeCustomerId?: string;
  subscriptionTier?: 'free' | 'pro' | 'enterprise';
  subscriptionStatus?: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid';
  subscriptionEndsAt?: string | null; // ISO String
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName?: string | null;
  roles: UserRole[];
  assignedOrganizationIds?: string[];
  activeOrganizationId?: string | null;
  assignedSeriesIds?: string[];
  assignedTeamIds?: string[];
  assignedGameIds?: string[];
  createdAt?: string | null;
  lastLogin?: string | null;
  phoneNumber?: string | null;
  playerId?: string | null; // Added to link user account to a player profile
}

export interface AdminUserView extends UserProfile {
}

export interface Player {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  userId?: string;
  clubName?: string;
  searchableNameTokens?: string[];
  primarySkill?: PrimarySkill;
  battingOrder?: BattingOrder;
  bowlingStyle?: BowlingStyle;
  dominantHandBatting?: DominantHand;
  dominantHandBowling?: DominantHand;
  avatarUrl?: string;
  gamesPlayed: number;
  cricClubsId: string;
  dateOfBirth: string;
  gender: Gender;
  primaryTeamId?: string;
  organizationId?: string;
  registrationToken?: string;
  registrationTokenExpires?: Date;
}

export interface PlayerRating {
  id?: string;
  gameId: string;
  playerId: string;
  organizationId: string; // Denormalized for security rules
  seriesId: string; // Denormalized for security rules
  batting?: RatingValue;
  battingComments?: { [selectorUid: string]: string };
  bowling?: RatingValue;
  bowlingComments?: { [selectorUid: string]: string };
  fielding?: RatingValue;
  fieldingComments?: { [selectorUid: string]: string };
  wicketKeeping?: RatingValue;
  wicketKeepingComments?: { [selectorUid: string]: string };
  gameName?: string; // Added for richer display
  seriesName?: string; // Added for richer display and filtering
}

export interface SelectorCertificationData {
  status: 'pending' | 'certified';
  certifiedAt: string;
  displayName: string;
  lastCertifiedValues?: {
    [playerSkillKey: string]: RatingValue;
  };
}

export interface Game {
  id: string;
  date: string;
  venue: string;
  team1: string;
  team2: string;
  team1Players?: string[];
  team2Players?: string[];
  seriesId?: string;
  seriesName?: string;
  organizationId: string;
  selectorUserIds?: string[];
  /** Team-aware selector assignments — parallel to selectorUserIds, written by Manage Selectors panel */
  selectorAssignments?: ScorecardSelectorAssignment[];
  status?: 'active' | 'archived';
  createdAt?: string | null;
  ratingsLastModifiedAt?: string;
  ratingsLastModifiedBy?: string;
  selectorCertifications?: {
    [selectorUid: string]: SelectorCertificationData;
  };
  ratingsFinalized?: boolean;
  ratingsFinalizedAt?: string | null;
  ratingsFinalizedBy?: string | null;
}

export interface PlayerWithRatings extends Player {
  ratings: PlayerRating[]; // This will now be Array<PlayerRating & { gameName?: string, seriesName?: string }> after DB enrichment
  averageBattingScore: number | 'N/A';
  averageBowlingScore: number | 'N/A';
  averageFieldingScore: number | 'N/A';
  averageWicketKeepingScore: number | 'N/A';
  calculatedAverageScore: number;
  age?: number;
  primaryTeamName?: string;
  currentTeamName?: string;
}

export interface PlayerAIData {
  playerName: string;
  primarySkill?: PrimarySkill;
  battingOrder?: BattingOrder;
  bowlingStyle?: BowlingStyle;
  dominantHandBatting?: DominantHand;
  dominantHandBowling?: DominantHand;
  averageScore: number;
  gamesPlayed: number;
}

export interface GameRatingFormValues {
  [playerId: string]: {
    batting?: RatingValue;
    battingComment?: string;
    bowling?: RatingValue;
    bowlingComment?: string;
    fielding?: RatingValue;
    fieldingComment?: string;
    wicketKeeping?: RatingValue;
    wicketKeepingComment?: string;
  };
}

export interface PlayerInGameDetails extends Player {
  teamName: string;
}

export interface Series {
  id: string;
  name: string;
  ageCategory: AgeCategory;
  year: number;
  organizationId: string;
  participatingTeams: string[];
  venueIds: string[];
  seriesAdminUids?: string[];
  status: 'active' | 'archived';
  maleCutoffDate?: string | null;
  femaleCutoffDate?: string | null;
  fitnessTestType?: FitnessTestType;
  fitnessTestPassingScore?: string;
  createdAt?: string | null;
  savedAiTeam?: SuggestedTeam;
  savedAiTeamAt?: string | null;
}

export interface Team {
  id: string;
  name: string;
  clubName: string;
  ageCategory: AgeCategory;
  organizationId: string;
  playerIds: string[];
  teamManagerUids?: string[];
}

export interface Venue {
  id: string;
  name: string;
  address: string;
  organizationId: string;
  latitude?: number;
  longitude?: number;
  status?: VenueStatus;
}

export interface RankedBatsman {
  id: string;
  name: string;
  avatarUrl?: string;
  dominantHandBatting?: DominantHand;
  battingOrder?: BattingOrder;
  gamesPlayedInSeries: number;
  averageBattingScoreInSeries: number;
}

export interface RankedBowler {
  id: string;
  name: string;
  avatarUrl?: string;
  dominantHandBowling?: DominantHand;
  bowlingStyle?: BowlingStyle;
  gamesPlayedInSeries: number;
  averageBowlingScoreInSeries: number;
}

export interface RankedWicketKeeper {
  id: string;
  name: string;
  avatarUrl?: string;
  gamesPlayedInSeries: number;
  averageWicketKeepingScoreInSeries: number;
}

export interface RankedFielder {
  id: string;
  name: string;
  avatarUrl?: string;
  primarySkill?: PrimarySkill;
  gamesPlayedInSeries: number;
  averageFieldingScoreInSeries: number;
}

export interface RankedAllRounder {
  id: string;
  name: string;
  avatarUrl?: string;
  gamesPlayedInSeries: number;
  averageBattingScoreInSeries: number;
  averageBowlingScoreInSeries: number;
  averageAllRounderScore: number;
}

export interface CsvGameImportRow {
  GameDate: string;
  VenueName: string;
  SeriesName: string;
  Team1Name: string;
  Team2Name: string;
}

export interface GameImportError {
  rowNumber: number;
  csvRow: Record<string, string>;
  error: string;
}

export interface GameImportResult {
  success: boolean;
  message?: string;
  successfulImports: number;
  failedImports: number;
  errors: GameImportError[];
}

export interface CsvSeriesImportRow {
  SeriesName: string;
  AgeCategory: AgeCategory | string;
  Year: string;
  MaleCutoffDate: string;
  FemaleCutoffDate: string;
  SeriesAdminEmails?: string;
}

export interface SeriesImportError {
  rowNumber: number;
  csvRow: Record<string, string>;
  error: string;
}

export interface SeriesImportResult {
  success: boolean;
  message?: string;
  successfulImports: number;
  failedImports: number;
  errors: SeriesImportError[];
}

export interface CsvPlayerImportRow {
  FirstName: string;
  LastName: string;
  CricClubsID: string;
  DateOfBirth: string;
  Gender: Gender | string;
  PrimarySkill: PrimarySkill | string;
  DominantHandBatting: DominantHand | string;
  BattingOrder: BattingOrder | string;
  DominantHandBowling?: DominantHand | string;
  BowlingStyle?: BowlingStyle | string;
  PrimaryClubName?: string;
  PrimaryTeamName?: string;
}

export interface PlayerImportError {
  rowNumber: number;
  csvRow: Record<string, string>;
  error: string;
}

export interface PlayerImportResult {
  success: boolean;
  message?: string;
  successfulImports: number;
  failedImports: number;
  errors: PlayerImportError[];
}

// New Fitness Test Types
export interface FitnessTestHeader {
  id: string;
  seriesId: string;
  organizationId: string;
  testType: FitnessTestType;
  testDate: string; // ISO string
  location: string;
  administratorName: string;
  isCertified: boolean;
  certifiedBy?: string; // UID of admin/series admin
  certifiedAt?: string; // ISO string
  createdAt: string; // ISO string
  lastModifiedAt?: string | null;
  lastModifiedBy?: string;
}

export interface FitnessTestResult {
  id: string;
  fitnessTestHeaderId: string;
  playerId: string;
  seriesId: string; // Denormalized
  organizationId: string; // Denormalized
  score: string; // e.g., "15.2" or "ABS"
  result: 'Pass' | 'Fail';
  notes?: string;
  recordedAt: string; // ISO string
}

export interface GlobalPlayerSearchResult {
  id: string;
  name: string;
  cricClubsId: string;
  age?: number;
  primarySkill?: Player['primarySkill'];
  avatarUrl?: string;
  organizationId?: string;
  organizationName?: string;
  isEligible: boolean;
}

export interface RegistrationResult {
    success: boolean;
    registrationToken?: string;
    message?: string;
    error?: string;
}

// ─── Scorecard Types ──────────────────────────────────────────────────────────

export interface ScorecardBatter {
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  dismissal: string;
  scorecardPlayerId?: string;
  linkedPlayerId?: string;
}

export interface ScorecardBowler {
  name: string;
  overs: number;
  maidens: number;
  runs: number;
  wickets: number;
  economy: number;
  wides: number;
  noballs: number;
  dots: number;
  scorecardPlayerId?: string;
  linkedPlayerId?: string;
}

export interface ScorecardFielder {
  name: string;
  catches: number;         // from "c Name b ..." dismissals
  runOuts: number;         // from "run out (Name/...)" dismissals
  stumpings: number;       // from "st Name b ..." (keeper)
  keeperCatches: number;   // from "c †Name b ..." (keeper catch, † symbol)
  byesConceded?: number;   // keeper only — from extras byes
}

export interface ScorecardExtras {
  byes: number;
  legByes: number;
  wides: number;
  noballs: number;
  total: number;
}

export interface ScorecardInnings {
  inningsNumber: 1 | 2;
  battingTeam: string;
  totalRuns: number;
  wickets: number;
  overs: string;
  extras: ScorecardExtras;
  batting: ScorecardBatter[];
  bowling: ScorecardBowler[];
  fielding: ScorecardFielder[];  // derived from dismissal text
  fallOfWickets: string[];
  didNotBat: string[];
}

export interface ScorecardSelectorAssignment {
  uid: string;
  name: string;
  teamAssociation: string | 'neutral'; // team name from the scorecard or 'neutral'
  assignedAt?: string;
}

export interface MatchScorecard {
  id: string;
  organizationId: string;
  importedBy: string;
  importedAt: string;
  // CricClubs source info
  cricClubsUrl?: string;
  cricClubsMatchId?: string;
  cricClubsClubId?: string;
  cricClubsLeague?: string;
  // Match info
  team1: string;
  team2: string;
  date: string;
  venue?: string;
  result?: string;
  // Optional links
  linkedGameId?: string;
  seriesId?: string;
  seriesName?: string;
  // Selector assignments (direct, not via game)
  selectorAssignments?: ScorecardSelectorAssignment[];
  // Innings data
  innings: ScorecardInnings[];
}

export interface ScorecardPlayer {
  id: string;
  organizationId: string;
  name: string;
  cricClubsId?: string;
  cricClubsLeague?: string;
  linkedPlayerId?: string; // linked Cricket IQ Player doc ID
  firstSeenAt: string;
  lastSeenAt: string;
  gamesAppeared: number;
}

// ─── Scorecard Scoring Config ─────────────────────────────────────────────────

export interface ScorecardScoringConfig {
  id?: string;
  organizationId: string;
  updatedAt?: string;
  // Batting weights
  batting: {
    runsMultiplier: number;        // default 1
    srBonus200: number;            // SR > 200: default +10
    srBonus150: number;            // SR > 150: default +7.5
    srBonus100: number;            // SR > 100: default +5
    srPenaltySub50: number;        // SR < 50: default -5
    foursMultiplier: number;       // default 2
    sixesMultiplier: number;       // default 4
  };
  // Bowling weights
  bowling: {
    wicketsMultiplier: number;     // default 20
    econBonus4: number;            // Econ < 4: default +10
    econBonus6: number;            // Econ < 6: default +5
    econPenalty8: number;          // Econ > 8: default -5
    dotsMultiplier: number;        // default 1
    widesMultiplier: number;       // default -1
    noballsMultiplier: number;     // default -2
  };
  // Fielding weights
  fielding: {
    catchesMultiplier: number;     // default 10
    runOutsMultiplier: number;     // default 10
    stumpingsMultiplier: number;   // default 10
    keeperCatchesMultiplier: number; // default 10
    byesMultiplier: number;        // default -2
  };
  // Coach top rating
  coachTopRatingPerMention: number;  // default 15, per mention (max 3 mentions)
}

export const DEFAULT_SCORING_CONFIG: Omit<ScorecardScoringConfig, 'id' | 'organizationId' | 'updatedAt'> = {
  batting: {
    runsMultiplier: 1,
    srBonus200: 10,
    srBonus150: 7.5,
    srBonus100: 5,
    srPenaltySub50: -5,
    foursMultiplier: 2,
    sixesMultiplier: 4,
  },
  bowling: {
    wicketsMultiplier: 20,
    econBonus4: 10,
    econBonus6: 5,
    econPenalty8: -5,
    dotsMultiplier: 1,
    widesMultiplier: -1,
    noballsMultiplier: -2,
  },
  fielding: {
    catchesMultiplier: 10,
    runOutsMultiplier: 10,
    stumpingsMultiplier: 10,
    keeperCatchesMultiplier: 10,
    byesMultiplier: -2,
  },
  coachTopRatingPerMention: 15,
};

export interface PlayerScore {
  name: string;
  team: string;
  battingScore: number;
  bowlingScore: number;
  fieldingScore: number;
  totalScore: number;
  // breakdown for display
  batting?: { runs: number; balls: number; strikeRate: number; fours: number; sixes: number; dismissal: string };
  bowling?: { overs: number; wickets: number; runs: number; economy: number; dots: number; wides: number; noballs: number };
  fielding?: { catches: number; runOuts: number; stumpings: number; keeperCatches: number; byesConceded?: number };
}

// ─── Scorecard Selection Types ────────────────────────────────────────────────

export interface AggregatedPlayerStats {
  name: string;
  team: string;
  gamesPlayed: number;
  // Batting aggregates
  totalRuns: number;
  totalBalls: number;
  totalFours: number;
  totalSixes: number;
  avgStrikeRate: number;
  // Bowling aggregates
  totalWickets: number;
  totalOvers: number;
  totalDots: number;
  avgEconomy: number;
  totalWides: number;
  totalNoballs: number;
  // Fielding aggregates
  totalCatches: number;
  totalRunOuts: number;
  totalStumpings: number;
  totalKeeperCatches: number;
  // Scores
  totalBattingScore: number;
  totalBowlingScore: number;
  totalFieldingScore: number;
  totalCoachTopRatingScore: number;  // sum of coach top rating scores
  coachMentions: number;             // raw mention count (for badge display)
  totalScore: number;
  avgScorePerGame: number;
}

export interface ScorecardSelectionConstraints {
  teamSize: number;           // default 11
  minOpeners: number;         // default 2
  minMiddleOrder: number;     // default 3
  minWicketKeepers: number;      // default 1, max 2
  minBowlers: number;         // default 4
  minAllRounders: number;     // default 1
  minBowlerOversPerGame: number; // min avg overs per game to qualify as bowler, default 2
}

export const DEFAULT_SELECTION_CONSTRAINTS: ScorecardSelectionConstraints = {
  teamSize: 11,
  minOpeners: 2,
  minMiddleOrder: 3,
  minWicketKeepers: 1,
  minBowlers: 4,
  minAllRounders: 1,
  minBowlerOversPerGame: 2,
};

// ─── Match Report Types ───────────────────────────────────────────────────────

export interface MatchReport {
  id: string;
  gameId: string;
  scorecardId?: string;
  organizationId: string;
  seriesId?: string;
  // Teams
  reportingTeam: string;       // team the submitter represents
  opposingTeam: string;        // team being evaluated
  // Submission
  submittedBy: string;         // uid
  submittedByName: string;
  submittedAt: string;
  // Top 3 performers from opposing team
  top3Players: string[];       // player names (up to 3)
  // Notes
  highlights: string;
  missedCatches: string;
  missedRunOuts: string;
  greatCatchesRunOuts: string;
  sportsmanship: string;
  // Selector self-certification (locks report; reversible until admin certifies)
  isSelectorCertified?: boolean;
  selectorCertifiedAt?: string;
  // Admin certification (final approval; irreversible)
  isCertified: boolean;
  certifiedBy?: string;
  certifiedByName?: string;
  certifiedAt?: string;
}
