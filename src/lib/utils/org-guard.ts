// src/lib/utils/org-guard.ts
// Shared utility to prevent cross-org access on entity detail pages.

/**
 * Returns true if access is allowed, false if org mismatch detected.
 * If activeOrgId is missing (not yet loaded), returns false to be safe.
 * If entityOrgId is missing, returns true (entity may not have org field).
 */
export function checkOrgAccess(
  entityOrgId: string | undefined | null,
  activeOrgId: string | undefined | null
): boolean {
  if (!entityOrgId) return true;  // entity has no org field — can't check, allow
  if (!activeOrgId) return false; // active org not loaded yet — deny until we know
  return entityOrgId === activeOrgId;
}

export const ORG_MISMATCH_ERROR =
  'This item belongs to a different organization. Please switch to the correct organization to view it.';
