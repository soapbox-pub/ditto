import type { NostrEvent } from "@nostrify/nostrify";

/**
 * Derive an action verb for replaceable/addressable events based on the `published_at` tag.
 * - If `published_at` exists and equals `created_at` → first publish ("created")
 * - If `published_at` exists and differs from `created_at` → subsequent update ("updated")
 * - If `published_at` is absent → fallback verb ("shared")
 */
export function publishedAtAction(
  event: NostrEvent | undefined,
  { created: createdVerb, updated: updatedVerb, fallback: fallbackVerb }: { created: string; updated: string; fallback: string },
): string {
  if (!event) return fallbackVerb;
  const publishedAt = event.tags.find(([name]) => name === "published_at")?.[1];
  if (!publishedAt) return fallbackVerb;
  return publishedAt === String(event.created_at) ? createdVerb : updatedVerb;
}
