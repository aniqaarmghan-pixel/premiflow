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
/** Display-only label for the Devnet test token on seeded demo cards. The mint, decimals and math are unchanged. */
export const DEMO_TOKEN_LABEL = "Demo USDT";
/** Muted caption next to demo amounts so nobody mistakes them for official USDT. */
export const DEMO_ASSET_NOTE = "Devnet test asset";
export const DEMO_ASSET_NOTE_TITLE = "Not official USDT: a Devnet test token with no real value.";

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