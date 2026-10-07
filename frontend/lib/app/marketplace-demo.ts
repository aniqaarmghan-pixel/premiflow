/**
 * Devnet demo marketplace presentation helpers (display only).
 *
 * Seeded demo records (lib/server/marketplace/demo-seed.ts) carry the
 * DEMO_SKILL_TAG skill. Cards hide that tag as a skill chip and show a small
 * "Demo" badge instead. Nothing here changes payment, token or mint logic.
 */
import { ACTIVE_CLUSTER_ID, type PremiflowClusterId } from "@/lib/cluster";

export const DEMO_SKILL_TAG = "devnet demo";
export const DEMO_BADGE_LABEL = "Demo";
export const DEVNET_DEMO_NOTICE = "Devnet demo marketplace \u2014 sample listings and profiles.";
/** Short, clearly non-production label for the Devnet test token on demo cards. The mint is unchanged. */
export const DEMO_TOKEN_LABEL = "Devnet test token";

export function isDemoSkill(skill: string): boolean {
  return skill.trim().toLowerCase() === DEMO_SKILL_TAG;
}

export function isDemoListing(item: { skills?: readonly string[] | null } | null | undefined): boolean {
  return Boolean(item?.skills?.some(isDemoSkill));
}

export function withoutDemoTag(skills: readonly string[] | null | undefined): string[] {
  return (skills ?? []).filter((skill) => !isDemoSkill(skill));
}

export function showDevnetDemoNotice(clusterId: PremiflowClusterId = ACTIVE_CLUSTER_ID): boolean {
  return clusterId === "devnet";
}