/**
 * Profile vs Gig: a PROFILE is the person or business (name, photo, headline,
 * skills). A GIG is one specific service sold by that profile, with its own
 * images, video, price and delivery. Pure helpers + copy, no storage: the
 * profile photo stays the existing https avatarUrl field.
 */
export const PROFILE_VS_GIG_COPY = {
  title: "Profile vs gigs",
  profile:
    "Your profile is you: your name or business, profile photo, headline, skills and rate. Clients see it next to everything you do.",
  gig: "Gigs are the specific services you sell from this profile. Each gig has its own images, video, price and delivery time.",
  gigMediaNote:
    "These images and video describe this service, not you. Your profile photo is set on your profile.",
} as const;

export const PROFILE_PHOTO_COPY = {
  title: "Profile photo",
  help: "Paste a link to a square photo or logo (https). Nothing is uploaded; we show the image from that link.",
  invalid: "Use a secure https link to an image, for example https://example.com/photo.jpg",
  add: "Add photo",
  change: "Change photo",
  done: "Done",
  remove: "Remove photo",
  linkLabel: "Photo link (https)",
} as const;

/** Up to two initials from a display name; wallet fallback; never empty-string junk. */
export function profileInitials(name?: string | null, wallet?: string | null): string {
  const words = (name ?? "")
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  const w = (wallet ?? "").trim();
  return w ? w.slice(0, 2).toUpperCase() : "";
}

/** Client-side hint only (the server validates too). Empty = no photo = valid. */
export function profilePhotoUrlError(url: string | null | undefined): string | null {
  const value = (url ?? "").trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || !parsed.hostname) return PROFILE_PHOTO_COPY.invalid;
    return null;
  } catch {
    return PROFILE_PHOTO_COPY.invalid;
  }
}

/** https image links that can be previewed directly (same rule as photo links). */
export function previewableImageUrls(urls: readonly (string | null | undefined)[], max = 6): string[] {
  return urls
    .map((u) => (u ?? "").trim())
    .filter((u) => u && profilePhotoUrlError(u) === null)
    .slice(0, max);
}
