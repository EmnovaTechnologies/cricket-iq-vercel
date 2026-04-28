// src/lib/utils/org-guard.ts
// Shared utility to prevent cross-org access on entity detail pages.
// Call after loading an entity by ID — if the entity's org doesn't match
// the user's active org, deny access.

/**
 * Returns true if access is allowed, false if org mismatch detected.
 * If either orgId is missing/undefined, access is allowed (can't check).
 */
export function checkOrgAccess(
  entityOrgId: string | undefined | null,
  activeOrgId: string | undefined | null
): boolean {
  if (!entityOrgId || !activeOrgId) return true;
  return entityOrgId === activeOrgId;
}

export const ORG_MISMATCH_ERROR =
  'This item belongs to a different organization. Please switch to the correct organization to view it.';
