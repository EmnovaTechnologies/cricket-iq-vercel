
// src/lib/permissions-master-list.ts

/**
 * Master list of all granular permission keys in the application.
 * This serves as the single source of truth for what permissions can be assigned.
 * Naming convention: FEATURE_ACTION_SCOPE or PAGE_VIEW_IDENTIFIER
 */
export const PERMISSIONS = {
  // Page View Permissions
  PAGE_VIEW_DASHBOARD: 'page:view:dashboard',
  PAGE_VIEW_LOGIN: 'page:view:login',
  PAGE_VIEW_SIGNUP: 'page:view:signup',
  PAGE_VIEW_GAMES_LIST: 'page:view:games_list',
  PAGE_VIEW_GAME_DETAILS: 'page:view:game_details',
  PAGE_VIEW_GAME_RATE_ENHANCED: 'page:view:game_rate_enhanced',
  PAGE_VIEW_GAME_ADD: 'page:view:game_add',
  PAGE_VIEW_GAME_IMPORT: 'page:view:game_import',
  PAGE_VIEW_PLAYERS_LIST: 'page:view:players_list',
  PAGE_VIEW_PLAYER_DETAILS: 'page:view:player_details',
  PAGE_VIEW_PLAYER_ADD: 'page:view:player_add',
  PAGE_VIEW_PLAYER_EDIT: 'page:view:player_edit',
  PAGE_VIEW_PLAYER_IMPORT: 'page:view:player_import',
  PAGE_VIEW_TEAMS_LIST: 'page:view:teams_list',
  PAGE_VIEW_TEAM_DETAILS: 'page:view:team_details',
  PAGE_VIEW_TEAM_ADD: 'page:view:team_add',
  PAGE_VIEW_SERIES_LIST: 'page:view:series_list',
  PAGE_VIEW_SERIES_DETAILS: 'page:view:series_details',
  PAGE_VIEW_SERIES_ADD: 'page:view:series_add',
  PAGE_VIEW_SERIES_IMPORT_CSV: 'page:view:series_import_csv',
  PAGE_VIEW_VENUES_LIST: 'page:view:venues_list',
  PAGE_VIEW_VENUE_ADD: 'page:view:venue_add',
  PAGE_VIEW_TEAM_COMPOSITION: 'page:view:team_composition',
  PAGE_VIEW_ADMIN_USERS_LIST: 'page:view:admin_users_list',
  PAGE_VIEW_ADMIN_ROLE_MANAGEMENT_LIST: 'page:view:admin_role_management_list',
  PAGE_VIEW_ADMIN_ROLE_MANAGEMENT_EDIT: 'page:view:admin_role_management_edit',
  PAGE_VIEW_ADMIN_ORGANIZATIONS_LIST: 'page:view:admin_organizations_list',
  PAGE_VIEW_ADMIN_ORGANIZATION_ADD: 'page:view:admin_organization_add',
  PAGE_VIEW_ADMIN_ORGANIZATION_DETAILS: 'page:view:admin_organization_details',
  PAGE_VIEW_ADMIN_ORGANIZATION_EDIT: 'page:view:admin_organization_edit',
  PAGE_VIEW_ADMIN_ORGANIZATION_BILLING: 'page:view:admin_organization_billing',
  PAGE_VIEW_ADMIN_ICON_LIBRARY: 'page:view:admin_icon_library',

  // Player Management Permissions
  PLAYERS_ADD: 'players:add',
  PLAYERS_EDIT_ANY: 'players:edit_any',
  PLAYERS_EDIT_ASSIGNED: 'players:edit_assigned', // For Org/Series/Team admins
  PLAYER_EDIT_SELF: 'player:edit:self',
  PLAYERS_IMPORT: 'players:import',
  PLAYER_VIEW_OWN_PROFILE: 'player:view:own_profile',

  // Team Management Permissions
  TEAMS_ADD: 'teams:add',
  TEAMS_EDIT_ANY: 'teams:edit_any',
  TEAMS_DELETE_ANY: 'teams:delete_any',
  TEAMS_MANAGE_MANAGERS_ANY: 'teams:manage_managers_any',
  TEAMS_MANAGE_ROSTER_ANY: 'teams:manage_roster_any',
  TEAMS_MANAGE_MANAGERS_ASSIGNED: 'teams:manage_managers_assigned', // Contextual
  TEAMS_MANAGE_ROSTER_ASSIGNED: 'teams:manage_roster_assigned',     // Contextual

  // Series Management Permissions
  SERIES_ADD: 'series:add',
  SERIES_EDIT_ANY: 'series:edit_any',
  SERIES_DELETE_ANY: 'series:delete_any',
  SERIES_ARCHIVE_ANY: 'series:archive_any',
  SERIES_UNARCHIVE_ANY: 'series:unarchive_any',
  SERIES_MANAGE_ADMINS_ANY: 'series:manage_admins_any',
  SERIES_MANAGE_TEAMS_ANY: 'series:manage_teams_any',
  SERIES_MANAGE_VENUES_ANY: 'series:manage_venues_any',
  SERIES_IMPORT_CSV: 'series:import_csv',
  SERIES_MANAGE_ADMINS_ASSIGNED: 'series:manage_admins_assigned', // Contextual
  SERIES_MANAGE_TEAMS_ASSIGNED: 'series:manage_teams_assigned',   // Contextual
  SERIES_MANAGE_VENUES_ASSIGNED: 'series:manage_venues_assigned', // Contextual
  SERIES_ARCHIVE_ASSIGNED: 'series:archive_assigned',             // Contextual
  SERIES_UNARCHIVE_ASSIGNED: 'series:unarchive_assigned',         // Contextual
  SERIES_MANAGE_FITNESS_CRITERIA_ANY: 'series:manage_fitness_criteria_any',
  SERIES_MANAGE_FITNESS_CRITERIA_ASSIGNED: 'series:manage_fitness_criteria_assigned',
  SERIES_VIEW_FITNESS_REPORT: 'series:view_fitness_report',
  SERIES_SAVE_AI_TEAM: 'series:save_ai_team',
  SERIES_VIEW_SAVED_AI_TEAM: 'series:view_saved_ai_team',

  // Venue Management Permissions
  VENUES_ADD: 'venues:add',
  VENUES_EDIT_ANY: 'venues:edit_any',
  VENUES_ARCHIVE_ANY: 'venues:archive_any',
  VENUES_UNARCHIVE_ANY: 'venues:unarchive_any',
  VENUES_DELETE_ANY: 'venues:delete_any',

  // Game & Fitness Test Management Permissions
  GAMES_ADD_TO_ANY_SERIES: 'games:add_to_any_series',
  GAMES_IMPORT_CSV_TO_ANY_SERIES: 'games:import_csv_to_any_series',
  GAMES_MANAGE_ROSTER_ANY: 'games:manage_roster_any',
  GAMES_MANAGE_SELECTORS_ANY: 'games:manage_selectors_any',
  GAMES_RATE_ANY: 'games:rate_any',
  GAMES_CERTIFY_ANY: 'games:certify_any',
  GAMES_FINALIZE_ANY: 'games:finalize_any',
  GAMES_ADMIN_FORCE_FINALIZE_ANY: 'games:admin_force_finalize_any',
  GAMES_RATE_ASSIGNED: 'games:rate_assigned',
  GAMES_CERTIFY_OWN_RATINGS_ASSIGNED: 'games:certify_own_ratings_assigned',
  FITNESS_TESTS_ADD: 'fitness_tests:add',
  FITNESS_TESTS_EDIT_UNCERTIFIED: 'fitness_tests:edit_uncertified',
  FITNESS_TESTS_CERTIFY: 'fitness_tests:certify',

  // Organization Management Permissions
  ORGANIZATIONS_VIEW_LIST_ALL: 'organizations:view_list_all',
  ORGANIZATIONS_VIEW_DETAILS_ANY: 'organizations:view_details_any',
  ORGANIZATIONS_VIEW_DETAILS_ASSIGNED: 'organizations:view_details_assigned',
  ORGANIZATIONS_ADD: 'organizations:add',
  ORGANIZATIONS_EDIT_ANY: 'organizations:edit_any',
  ORGANIZATIONS_EDIT_BRANDING_ANY: 'organizations:edit_branding_any',
  ORGANIZATIONS_EDIT_ADMINS_ANY: 'organizations:edit_admins_any',
  ORGANIZATIONS_EDIT_ASSIGNED: 'organizations:edit_assigned',
  ORGANIZATIONS_EDIT_BRANDING_ASSIGNED: 'organizations:edit_branding_assigned',
  ORGANIZATIONS_MANAGE_BILLING_ANY: 'organizations:manage_billing_any',

  // User Management Permissions
  USERS_VIEW_LIST_ALL: 'users:view_list_all',
  USERS_VIEW_LIST_ASSIGNED_ORG: 'users:view_list_assigned_org',
  USERS_MANAGE_ROLES_ANY: 'users:manage_roles_any',
  USERS_MANAGE_ROLES_ASSIGNED_ORG: 'users:manage_roles_assigned_org',

  // AI Feature Permissions
  AI_USE_TEAM_COMPOSITION: 'ai:use_team_composition',

  // Data Export Permissions
  PAGE_VIEW_EXPORT: 'page:view:export',
  DATA_EXPORT_ORG: 'data:export:org',       // Org Admin — export all data for their org
  DATA_EXPORT_SERIES: 'data:export:series', // Series Admin — export data for assigned series only
} as const;

export type PermissionKey = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// Structure for organizing permissions in the UI
export const PERMISSION_CATEGORIES = {
  GENERAL_AND_AI: {
    label: 'General & AI Features',
    permissions: [
      PERMISSIONS.PAGE_VIEW_DASHBOARD,
      PERMISSIONS.PAGE_VIEW_LOGIN,
      PERMISSIONS.PAGE_VIEW_SIGNUP,
      PERMISSIONS.PAGE_VIEW_TEAM_COMPOSITION,
      PERMISSIONS.AI_USE_TEAM_COMPOSITION,
    ]
  },
  DATA_EXPORT: {
    label: 'Data Export',
    permissions: [
      PERMISSIONS.PAGE_VIEW_EXPORT,
      PERMISSIONS.DATA_EXPORT_ORG,
      PERMISSIONS.DATA_EXPORT_SERIES,
    ]
  },
  PLAYER_PERMISSIONS: {
    label: 'Player Self-Service',
    permissions: [
      PERMISSIONS.PLAYER_VIEW_OWN_PROFILE,
      PERMISSIONS.PLAYER_EDIT_SELF,
    ]
  },
  PLAYER_MANAGEMENT: {
    label: 'Player Management (Admin)',
    permissions: [
      PERMISSIONS.PAGE_VIEW_PLAYERS_LIST,
      PERMISSIONS.PAGE_VIEW_PLAYER_DETAILS,
      PERMISSIONS.PAGE_VIEW_PLAYER_ADD,
      PERMISSIONS.PAGE_VIEW_PLAYER_EDIT,
      PERMISSIONS.PAGE_VIEW_PLAYER_IMPORT,
      PERMISSIONS.PLAYERS_ADD,
      PERMISSIONS.PLAYERS_EDIT_ANY,
      PERMISSIONS.PLAYERS_EDIT_ASSIGNED,
      PERMISSIONS.PLAYERS_IMPORT,
    ]
  },
  TEAM_MANAGEMENT: {
    label: 'Team Management',
    permissions: [
      PERMISSIONS.PAGE_VIEW_TEAMS_LIST,
      PERMISSIONS.PAGE_VIEW_TEAM_DETAILS,
      PERMISSIONS.PAGE_VIEW_TEAM_ADD,
      PERMISSIONS.TEAMS_ADD,
      PERMISSIONS.TEAMS_EDIT_ANY,
      PERMISSIONS.TEAMS_DELETE_ANY,
      PERMISSIONS.TEAMS_MANAGE_MANAGERS_ANY,
      PERMISSIONS.TEAMS_MANAGE_ROSTER_ANY,
      PERMISSIONS.TEAMS_MANAGE_MANAGERS_ASSIGNED,
      PERMISSIONS.TEAMS_MANAGE_ROSTER_ASSIGNED,
    ]
  },
  SERIES_MANAGEMENT: {
    label: 'Series Management',
    permissions: [
      PERMISSIONS.PAGE_VIEW_SERIES_LIST,
      PERMISSIONS.PAGE_VIEW_SERIES_DETAILS,
      PERMISSIONS.PAGE_VIEW_SERIES_ADD,
      PERMISSIONS.PAGE_VIEW_SERIES_IMPORT_CSV,
      PERMISSIONS.SERIES_ADD,
      PERMISSIONS.SERIES_EDIT_ANY,
      PERMISSIONS.SERIES_DELETE_ANY,
      PERMISSIONS.SERIES_ARCHIVE_ANY,
      PERMISSIONS.SERIES_UNARCHIVE_ANY,
      PERMISSIONS.SERIES_MANAGE_ADMINS_ANY,
      PERMISSIONS.SERIES_MANAGE_TEAMS_ANY,
      PERMISSIONS.SERIES_MANAGE_VENUES_ANY,
      PERMISSIONS.SERIES_MANAGE_FITNESS_CRITERIA_ANY,
      PERMISSIONS.SERIES_MANAGE_FITNESS_CRITERIA_ASSIGNED,
      PERMISSIONS.SERIES_VIEW_FITNESS_REPORT,
      PERMISSIONS.SERIES_SAVE_AI_TEAM,
      PERMISSIONS.SERIES_VIEW_SAVED_AI_TEAM,
      PERMISSIONS.SERIES_IMPORT_CSV,
      PERMISSIONS.SERIES_MANAGE_ADMINS_ASSIGNED,
      PERMISSIONS.SERIES_MANAGE_TEAMS_ASSIGNED,
      PERMISSIONS.SERIES_MANAGE_VENUES_ASSIGNED,
      PERMISSIONS.SERIES_ARCHIVE_ASSIGNED,
      PERMISSIONS.SERIES_UNARCHIVE_ASSIGNED,
    ]
  },
  VENUE_MANAGEMENT: {
    label: 'Venue Management',
    permissions: [
      PERMISSIONS.PAGE_VIEW_VENUES_LIST,
      PERMISSIONS.PAGE_VIEW_VENUE_ADD,
      PERMISSIONS.VENUES_ADD,
      PERMISSIONS.VENUES_EDIT_ANY,
      PERMISSIONS.VENUES_ARCHIVE_ANY,
      PERMISSIONS.VENUES_UNARCHIVE_ANY,
      PERMISSIONS.VENUES_DELETE_ANY,
    ]
  },
  GAME_AND_FITNESS_MANAGEMENT: {
    label: 'Game & Fitness Test Management',
    permissions: [
      PERMISSIONS.PAGE_VIEW_GAMES_LIST,
      PERMISSIONS.PAGE_VIEW_GAME_DETAILS,
      PERMISSIONS.PAGE_VIEW_GAME_RATE_ENHANCED,
      PERMISSIONS.PAGE_VIEW_GAME_ADD,
      PERMISSIONS.PAGE_VIEW_GAME_IMPORT,
      PERMISSIONS.GAMES_ADD_TO_ANY_SERIES,
      PERMISSIONS.GAMES_IMPORT_CSV_TO_ANY_SERIES,
      PERMISSIONS.GAMES_MANAGE_ROSTER_ANY,
      PERMISSIONS.GAMES_MANAGE_SELECTORS_ANY,
      PERMISSIONS.GAMES_RATE_ANY,
      PERMISSIONS.GAMES_CERTIFY_ANY,
      PERMISSIONS.GAMES_FINALIZE_ANY,
      PERMISSIONS.GAMES_ADMIN_FORCE_FINALIZE_ANY,
      PERMISSIONS.GAMES_RATE_ASSIGNED,
      PERMISSIONS.GAMES_CERTIFY_OWN_RATINGS_ASSIGNED,
      PERMISSIONS.FITNESS_TESTS_ADD,
      PERMISSIONS.FITNESS_TESTS_EDIT_UNCERTIFIED,
      PERMISSIONS.FITNESS_TESTS_CERTIFY,
    ]
  },
  ORGANIZATION_ADMIN: {
    label: 'Organization Administration (Assigned Org)',
    permissions: [
      PERMISSIONS.ORGANIZATIONS_VIEW_DETAILS_ASSIGNED,
      PERMISSIONS.ORGANIZATIONS_EDIT_ASSIGNED,
      PERMISSIONS.ORGANIZATIONS_EDIT_BRANDING_ASSIGNED,
      PERMISSIONS.USERS_VIEW_LIST_ASSIGNED_ORG,
      PERMISSIONS.USERS_MANAGE_ROLES_ASSIGNED_ORG,
    ]
  },
  SUPER_ADMIN: {
    label: 'Super Administration (Global)',
    permissions: [
      PERMISSIONS.PAGE_VIEW_ADMIN_USERS_LIST,
      PERMISSIONS.PAGE_VIEW_ADMIN_ROLE_MANAGEMENT_LIST,
      PERMISSIONS.PAGE_VIEW_ADMIN_ROLE_MANAGEMENT_EDIT,
      PERMISSIONS.PAGE_VIEW_ADMIN_ORGANIZATIONS_LIST,
      PERMISSIONS.PAGE_VIEW_ADMIN_ORGANIZATION_ADD,
      PERMISSIONS.PAGE_VIEW_ADMIN_ORGANIZATION_DETAILS,
      PERMISSIONS.PAGE_VIEW_ADMIN_ORGANIZATION_EDIT,
      PERMISSIONS.PAGE_VIEW_ADMIN_ORGANIZATION_BILLING,
      PERMISSIONS.PAGE_VIEW_ADMIN_ICON_LIBRARY,
      PERMISSIONS.ORGANIZATIONS_VIEW_LIST_ALL,
      PERMISSIONS.ORGANIZATIONS_VIEW_DETAILS_ANY,
      PERMISSIONS.ORGANIZATIONS_ADD,
      PERMISSIONS.ORGANIZATIONS_EDIT_ANY,
      PERMISSIONS.ORGANIZATIONS_EDIT_BRANDING_ANY,
      PERMISSIONS.ORGANIZATIONS_EDIT_ADMINS_ANY,
      PERMISSIONS.ORGANIZATIONS_MANAGE_BILLING_ANY,
      PERMISSIONS.USERS_VIEW_LIST_ALL,
      PERMISSIONS.USERS_MANAGE_ROLES_ANY,
    ]
  }
};

export type PermissionCategory = keyof typeof PERMISSION_CATEGORIES;

/**
 * Provides a more human-readable description for each permission key.
 * Used in the admin UI for clarity.
 */
export const PERMISSION_DESCRIPTIONS: Record<PermissionKey, string> = {
  [PERMISSIONS.PAGE_VIEW_DASHBOARD]: "View main dashboard",
  [PERMISSIONS.PAGE_VIEW_LOGIN]: "View login page",
  [PERMISSIONS.PAGE_VIEW_SIGNUP]: "View signup page",
  [PERMISSIONS.PAGE_VIEW_GAMES_LIST]: "View list of games",
  [PERMISSIONS.PAGE_VIEW_GAME_DETAILS]: "View game details",
  [PERMISSIONS.PAGE_VIEW_GAME_RATE_ENHANCED]: "Access player rating page for a game",
  [PERMISSIONS.PAGE_VIEW_GAME_ADD]: "View 'Add New Game' page",
  [PERMISSIONS.PAGE_VIEW_GAME_IMPORT]: "View 'Import Games' page",
  [PERMISSIONS.PAGE_VIEW_PLAYERS_LIST]: "View list of players",
  [PERMISSIONS.PAGE_VIEW_PLAYER_DETAILS]: "View player profile details",
  [PERMISSIONS.PAGE_VIEW_PLAYER_ADD]: "View 'Add New Player' page",
  [PERMISSIONS.PAGE_VIEW_PLAYER_EDIT]: "View 'Edit Player' page",
  [PERMISSIONS.PAGE_VIEW_PLAYER_IMPORT]: "View 'Import Players' page",
  [PERMISSIONS.PAGE_VIEW_TEAMS_LIST]: "View list of teams",
  [PERMISSIONS.PAGE_VIEW_TEAM_DETAILS]: "View team details",
  [PERMISSIONS.PAGE_VIEW_TEAM_ADD]: "View 'Add New Team' page",
  [PERMISSIONS.PAGE_VIEW_SERIES_LIST]: "View list of series",
  [PERMISSIONS.PAGE_VIEW_SERIES_DETAILS]: "View series details",
  [PERMISSIONS.PAGE_VIEW_SERIES_ADD]: "View 'Add New Series' page",
  [PERMISSIONS.PAGE_VIEW_SERIES_IMPORT_CSV]: "View 'Import Series via CSV' page",
  [PERMISSIONS.PAGE_VIEW_VENUES_LIST]: "View list of venues",
  [PERMISSIONS.PAGE_VIEW_VENUE_ADD]: "View 'Add New Venue' page",
  [PERMISSIONS.PAGE_VIEW_TEAM_COMPOSITION]: "Access AI Team Composition tool",
  [PERMISSIONS.PAGE_VIEW_ADMIN_USERS_LIST]: "View User Management list (Admin)",
  [PERMISSIONS.PAGE_VIEW_ADMIN_ROLE_MANAGEMENT_LIST]: "View Role Management list (Admin)",
  [PERMISSIONS.PAGE_VIEW_ADMIN_ROLE_MANAGEMENT_EDIT]: "View Role Permission Editing page (Admin)",
  [PERMISSIONS.PAGE_VIEW_ADMIN_ORGANIZATIONS_LIST]: "View Organizations list (Admin)",
  [PERMISSIONS.PAGE_VIEW_ADMIN_ORGANIZATION_ADD]: "View 'Add New Organization' page (Admin)",
  [PERMISSIONS.PAGE_VIEW_ADMIN_ORGANIZATION_DETAILS]: "View Organization details (Admin)",
  [PERMISSIONS.PAGE_VIEW_ADMIN_ORGANIZATION_EDIT]: "View 'Edit Organization' page (Admin)",
  [PERMISSIONS.PAGE_VIEW_ADMIN_ORGANIZATION_BILLING]: "View and manage organization billing page",
  [PERMISSIONS.PAGE_VIEW_ADMIN_ICON_LIBRARY]: "View the project's icon library",

  [PERMISSIONS.PLAYERS_ADD]: "Add new players",
  [PERMISSIONS.PLAYERS_EDIT_ANY]: "Edit any player's information (Super Admin)",
  [PERMISSIONS.PLAYERS_EDIT_ASSIGNED]: "Edit players in their assigned context (Org/Series/Team)",
  [PERMISSIONS.PLAYER_EDIT_SELF]: "Allow a player to edit their own profile details",
  [PERMISSIONS.PLAYERS_IMPORT]: "Import players from CSV/Excel",
  [PERMISSIONS.PLAYER_VIEW_OWN_PROFILE]: "Allow a player to view their own profile page",

  [PERMISSIONS.TEAMS_ADD]: "Add new teams",
  [PERMISSIONS.TEAMS_EDIT_ANY]: "Edit any team's information",
  [PERMISSIONS.TEAMS_DELETE_ANY]: "Delete a team (only if no games or players associated)",
  [PERMISSIONS.TEAMS_MANAGE_MANAGERS_ANY]: "Assign/remove managers for any team",
  [PERMISSIONS.TEAMS_MANAGE_ROSTER_ANY]: "Manage player roster for any team",
  [PERMISSIONS.TEAMS_MANAGE_MANAGERS_ASSIGNED]: "Assign/remove managers for their assigned teams (Contextual)",
  [PERMISSIONS.TEAMS_MANAGE_ROSTER_ASSIGNED]: "Manage player roster for their assigned teams (Contextual)",

  [PERMISSIONS.SERIES_ADD]: "Add new series",
  [PERMISSIONS.SERIES_EDIT_ANY]: "Edit any series information",
  [PERMISSIONS.SERIES_DELETE_ANY]: "Delete a series (only if no games associated)",
  [PERMISSIONS.SERIES_ARCHIVE_ANY]: "Archive any series",
  [PERMISSIONS.SERIES_UNARCHIVE_ANY]: "Unarchive any series",
  [PERMISSIONS.SERIES_MANAGE_ADMINS_ANY]: "Manage administrators for any series",
  [PERMISSIONS.SERIES_MANAGE_TEAMS_ANY]: "Add/remove teams for any series",
  [PERMISSIONS.SERIES_MANAGE_VENUES_ANY]: "Add/remove venues for any series",
  [PERMISSIONS.SERIES_MANAGE_FITNESS_CRITERIA_ANY]: "Edit fitness criteria for any series",
  [PERMISSIONS.SERIES_MANAGE_FITNESS_CRITERIA_ASSIGNED]: "Edit fitness criteria for assigned series (Contextual)",
  [PERMISSIONS.SERIES_VIEW_FITNESS_REPORT]: "View the series-wide fitness report",
  [PERMISSIONS.SERIES_SAVE_AI_TEAM]: "Save a generated AI team suggestion to a series",
  [PERMISSIONS.SERIES_VIEW_SAVED_AI_TEAM]: "View a previously saved AI team suggestion for a series",
  [PERMISSIONS.SERIES_IMPORT_CSV]: "Import series via CSV",
  [PERMISSIONS.SERIES_MANAGE_ADMINS_ASSIGNED]: "Manage administrators for their assigned series (Contextual)",
  [PERMISSIONS.SERIES_MANAGE_TEAMS_ASSIGNED]: "Add/remove teams for their assigned series (Contextual)",
  [PERMISSIONS.SERIES_MANAGE_VENUES_ASSIGNED]: "Add/remove venues for their assigned series (Contextual)",
  [PERMISSIONS.SERIES_ARCHIVE_ASSIGNED]: "Archive their assigned series (Contextual)",
  [PERMISSIONS.SERIES_UNARCHIVE_ASSIGNED]: "Unarchive their assigned series (Contextual)",

  [PERMISSIONS.VENUES_ADD]: "Add new venues",
  [PERMISSIONS.VENUES_EDIT_ANY]: "Edit any venue information",
  [PERMISSIONS.VENUES_ARCHIVE_ANY]: "Archive any venue",
  [PERMISSIONS.VENUES_UNARCHIVE_ANY]: "Unarchive any venue",
  [PERMISSIONS.VENUES_DELETE_ANY]: "Delete any venue (if unused)",

  [PERMISSIONS.GAMES_ADD_TO_ANY_SERIES]: "Add new games to any series",
  [PERMISSIONS.GAMES_IMPORT_CSV_TO_ANY_SERIES]: "Import games via CSV to any series",
  [PERMISSIONS.GAMES_MANAGE_ROSTER_ANY]: "Manage player roster for any game",
  [PERMISSIONS.GAMES_MANAGE_SELECTORS_ANY]: "Manage selectors for any game",
  [PERMISSIONS.GAMES_RATE_ANY]: "Submit/edit ratings for any game",
  [PERMISSIONS.GAMES_CERTIFY_ANY]: "Certify ratings on behalf of any selector for any game",
  [PERMISSIONS.GAMES_FINALIZE_ANY]: "Finalize ratings for any game (if conditions met)",
  [PERMISSIONS.GAMES_ADMIN_FORCE_FINALIZE_ANY]: "Force finalize ratings for any game (Admin)",
  [PERMISSIONS.GAMES_RATE_ASSIGNED]: "Submit/edit ratings for games they are assigned to select (Contextual)",
  [PERMISSIONS.GAMES_CERTIFY_OWN_RATINGS_ASSIGNED]: "Certify their own submitted ratings for assigned games (Contextual)",
  [PERMISSIONS.FITNESS_TESTS_ADD]: "Add new fitness test sessions",
  [PERMISSIONS.FITNESS_TESTS_EDIT_UNCERTIFIED]: "Edit fitness test results before certification",
  [PERMISSIONS.FITNESS_TESTS_CERTIFY]: "Certify fitness test results, locking them from edits",

  [PERMISSIONS.ORGANIZATIONS_VIEW_LIST_ALL]: "View list of all organizations (Super Admin)",
  [PERMISSIONS.ORGANIZATIONS_VIEW_DETAILS_ANY]: "View details of any organization (Super Admin)",
  [PERMISSIONS.ORGANIZATIONS_VIEW_DETAILS_ASSIGNED]: "View details of their assigned organization (Org Admin)",
  [PERMISSIONS.ORGANIZATIONS_ADD]: "Add new organizations (Super Admin)",
  [PERMISSIONS.ORGANIZATIONS_EDIT_ANY]: "Edit any organization's name/status (Super Admin)",
  [PERMISSIONS.ORGANIZATIONS_EDIT_BRANDING_ANY]: "Edit branding (theme, logo) for any organization (Super Admin)",
  [PERMISSIONS.ORGANIZATIONS_EDIT_ADMINS_ANY]: "Manage administrators for any organization (Super Admin)",
  [PERMISSIONS.ORGANIZATIONS_EDIT_ASSIGNED]: "Edit their assigned organization's name/status (Org Admin)",
  [PERMISSIONS.ORGANIZATIONS_EDIT_BRANDING_ASSIGNED]: "Edit branding for their assigned organization (Org Admin)",
  [PERMISSIONS.ORGANIZATIONS_MANAGE_BILLING_ANY]: "View and manage billing/subscriptions for any organization",

  [PERMISSIONS.USERS_VIEW_LIST_ALL]: "View list of all users in the system (Super Admin)",
  [PERMISSIONS.USERS_VIEW_LIST_ASSIGNED_ORG]: "View list of users in their assigned organization(s)",
  [PERMISSIONS.USERS_MANAGE_ROLES_ANY]: "Assign/change roles for any user (Super Admin)",
  [PERMISSIONS.USERS_MANAGE_ROLES_ASSIGNED_ORG]: "Assign/change roles for users within their assigned organization(s) (Org Admin)",

  [PERMISSIONS.AI_USE_TEAM_COMPOSITION]: "Use AI Team Composition tool",

  [PERMISSIONS.PAGE_VIEW_EXPORT]: "View Data Export page",
  [PERMISSIONS.DATA_EXPORT_ORG]: "Export all data (players, ratings) for their assigned organization",
  [PERMISSIONS.DATA_EXPORT_SERIES]: "Export data (players, ratings) for their assigned series only",
};
