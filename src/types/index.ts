

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
