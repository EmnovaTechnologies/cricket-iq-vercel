

export const RATING_VALUES = ['Not Rated', 'Not Applicable', '0.5', '1.0', '1.5', '2.0', '2.5', '3.0', '3.5', '4.0', '4.5', '5.0'] as const;

export const PRIMARY_SKILLS = ['Batting', 'Bowling', 'Wicket Keeping'] as const;

export const BATTING_ORDERS = ['Top Order', 'Middle Order', 'Low Order'] as const;

export const BOWLING_STYLES = [
  'Fast',
  'Medium',
  'Off Spin',
  'Leg Spin',
  'Left Hand - Orthodox',
  'Left Hand - Unorthodox'
] as const;

export const DOMINANT_HANDS = ['Right Hand', 'Left Hand'] as const;

export const SKILL_TYPES = ['batting', 'bowling', 'fielding', 'wicketKeeping'] as const;

export const GENDERS = ['Male', 'Female'] as const;

export const AGE_CATEGORIES = [
  'Under 11 (U11)',
  'Under 13 (U13)',
  'Under 15 (U15)',
  'Under 17 (U17)',
  'Under 19 (U19)'
] as const;

export const USER_ROLES = ['admin', 'Organization Admin', 'Series Admin', 'Team Manager', 'selector', 'player', 'unassigned'] as const;

export const ORGANIZATION_STATUSES = ['active', 'inactive'] as const;

export const VENUE_STATUSES = ['active', 'archived'] as const;

export const FITNESS_TEST_TYPES = [
  'Yo-Yo Endurance Test Level 1',
  'Yo-Yo Endurance Test Level 2',
  'Yo-Yo Intermittent Endurance Test, Level 1',
  'Yo-Yo Intermittent Endurance Test, Level 2',
  'Yo-Yo Intermittent Recovery Test, Level 1',
  'Yo-Yo Intermittent Recovery Test, Level 2'
] as const;

export const PREDEFINED_THEME_NAMES = [
    'Default',
    'Moss Green',
    'Ocean Blue',
    'Sunset Orange',
    'Crimson Red',
    'Royal Purple'
] as const;

export type PredefinedThemeName = typeof PREDEFINED_THEME_NAMES[number];

export interface ThemeColorPalette {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  chart1?: string;
  chart2?: string;
  chart3?: string;
  chart4?: string;
  chart5?: string;
}

export const THEME_PREVIEW_COLORS: Record<PredefinedThemeName, ThemeColorPalette> = {
  'Default': { // Based on typical ShadCN defaults
    background: "0 0% 100%",
    foreground: "222.2 84% 4.9%",
    card: "0 0% 100%",
    cardForeground: "222.2 84% 4.9%",
    popover: "0 0% 100%",
    popoverForeground: "222.2 84% 4.9%",
    primary: "222.2 47.4% 11.2%",
    primaryForeground: "210 40% 98%",
    secondary: "210 40% 96.1%",
    secondaryForeground: "222.2 47.4% 11.2%",
    muted: "210 40% 96.1%",
    mutedForeground: "215.4 16.3% 46.9%",
    accent: "222.2 47.4% 11.2%",
    accentForeground: "210 40% 98%",
    destructive: "0 84.2% 60.2%",
    destructiveForeground: "210 40% 98%",
    border: "214.3 31.8% 91.4%",
    input: "214.3 31.8% 91.4%",
    ring: "214.3 31.8% 91.4%",
    chart1: "221.2 83.2% 53.3%",
    chart2: "162.1 76.1% 50.6%",
    chart3: "38.9 91.7% 50.2%",
    chart4: "22.2 84% 4.9%",
    chart5: "280.7 65.5% 52.7%",
  },
  'Moss Green': { // Values from the user's globals.css :root
    background: "140 13% 95%",
    foreground: "145 16% 27%",
    card: "140 13% 98%",
    cardForeground: "145 16% 27%",
    popover: "140 13% 98%",
    popoverForeground: "145 16% 27%",
    primary: "145 15% 34%",
    primaryForeground: "0 0% 100%",
    secondary: "145 10% 85%",
    secondaryForeground: "145 15% 25%",
    muted: "145 10% 90%",
    mutedForeground: "145 10% 50%",
    accent: "26 43% 35%",
    accentForeground: "0 0% 100%",
    destructive: "0 84.2% 60.2%",
    destructiveForeground: "0 0% 98%",
    border: "145 10% 80%",
    input: "145 10% 88%",
    ring: "145 15% 34%",
    chart1: "145 40% 50%",
    chart2: "26 60% 55%",
    chart3: "140 30% 60%",
    chart4: "200 50% 50%",
    chart5: "30 70% 60%",
  },
  'Ocean Blue': {
    background: "200 30% 96%",
    foreground: "210 25% 25%",
    card: "200 30% 98%",
    cardForeground: "210 25% 25%",
    popover: "200 30% 98%",
    popoverForeground: "210 25% 25%",
    primary: "210 40% 45%",
    primaryForeground: "0 0% 100%",
    secondary: "210 30% 88%",
    secondaryForeground: "210 30% 30%",
    muted: "210 30% 92%",
    mutedForeground: "210 20% 55%",
    accent: "180 50% 40%",
    accentForeground: "0 0% 100%",
    destructive: "0 84.2% 60.2%",
    destructiveForeground: "0 0% 98%",
    border: "210 25% 80%",
    input: "210 25% 88%",
    ring: "210 40% 45%",
    chart1: "210 70% 50%",
    chart2: "180 60% 45%",
    chart3: "200 50% 60%",
    chart4: "220 60% 50%",
    chart5: "190 65% 48%",
  },
  'Sunset Orange': {
    background: "30 100% 96%",
    foreground: "25 50% 30%",
    card: "30 100% 98%",
    cardForeground: "25 50% 30%",
    popover: "30 100% 98%",
    popoverForeground: "25 50% 30%",
    primary: "25 80% 55%",
    primaryForeground: "0 0% 100%",
    secondary: "30 70% 88%",
    secondaryForeground: "25 60% 40%",
    muted: "30 80% 92%",
    mutedForeground: "25 40% 60%",
    accent: "40 90% 60%",
    accentForeground: "20 100% 15%",
    destructive: "0 84.2% 60.2%",
    destructiveForeground: "0 0% 98%",
    border: "30 60% 80%",
    input: "30 70% 88%",
    ring: "25 80% 55%",
    chart1: "25 85% 60%",
    chart2: "40 95% 65%",
    chart3: "20 70% 50%",
    chart4: "35 75% 50%",
    chart5: "15 80% 58%",
  },
  'Crimson Red': {
    background: "0 60% 96%",
    foreground: "0 40% 30%",
    card: "0 60% 98%",
    cardForeground: "0 40% 30%",
    popover: "0 60% 98%",
    popoverForeground: "0 40% 30%",
    primary: "0 70% 50%",
    primaryForeground: "0 0% 100%",
    secondary: "0 50% 88%",
    secondaryForeground: "0 50% 40%",
    muted: "0 50% 92%",
    mutedForeground: "0 30% 60%",
    accent: "340 70% 55%",
    accentForeground: "0 0% 100%",
    destructive: "0 70% 50%",
    destructiveForeground: "0 0% 100%",
    border: "0 40% 80%",
    input: "0 50% 88%",
    ring: "0 70% 50%",
    chart1: "0 75% 55%",
    chart2: "340 75% 60%",
    chart3: "350 60% 50%",
    chart4: "10 65% 50%",
    chart5: "330 68% 53%",
  },
  'Royal Purple': {
    background: "270 50% 96%",
    foreground: "270 30% 30%",
    card: "270 50% 98%",
    cardForeground: "270 30% 30%",
    popover: "270 50% 98%",
    popoverForeground: "270 30% 30%",
    primary: "270 50% 55%",
    primaryForeground: "0 0% 100%",
    secondary: "270 40% 88%",
    secondaryForeground: "270 40% 40%",
    muted: "270 40% 92%",
    mutedForeground: "270 25% 60%",
    accent: "290 50% 60%",
    accentForeground: "0 0% 100%",
    destructive: "0 84.2% 60.2%",
    destructiveForeground: "0 0% 98%",
    border: "270 30% 80%",
    input: "270 40% 88%",
    ring: "270 50% 55%",
    chart1: "270 60% 60%",
    chart2: "290 55% 65%",
    chart3: "260 45% 50%",
    chart4: "280 50% 50%",
    chart5: "250 58% 58%",
  },
};

export const PALETTE_TO_CSS_VAR_MAP: Record<keyof ThemeColorPalette, string> = {
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  cardForeground: "--card-foreground",
  popover: "--popover",
  popoverForeground: "--popover-foreground",
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  secondary: "--secondary",
  secondaryForeground: "--secondary-foreground",
  muted: "--muted",
  mutedForeground: "--muted-foreground",
  accent: "--accent",
  accentForeground: "--accent-foreground",
  destructive: "--destructive",
  destructiveForeground: "--destructive-foreground",
  border: "--border",
  input: "--input",
  ring: "--ring",
  chart1: "--chart-1",
  chart2: "--chart-2",
  chart3: "--chart-3",
  chart4: "--chart-4",
  chart5: "--chart-5",
};
