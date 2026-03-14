import type { NostrEvent } from "@nostrify/nostrify";
import type { BlossomServerMetadata } from "@/contexts/AppContext";

/** Normalize a Blossom server URL for deduplication (lowercase, ensure trailing slash). */
function normalizeUrl(url: string): string {
  return url.toLowerCase().replace(/\/+$/, "");
}

/** Parse a kind 10063 Blossom server list event into validated server URLs. */
export function parseBlossomServerList(event: NostrEvent): string[] {
  return event.tags
    .filter(([name]) => name === "server")
    .map(([, url]) => url)
    .filter((url) => {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    });
}

/**
 * App default Blossom servers used as a fallback when the user has no kind 10063
 * server list, and can be optionally combined with user servers (mirroring APP_RELAYS).
 */
export const APP_BLOSSOM_SERVERS: BlossomServerMetadata = {
  servers: [
    "https://blossom.ditto.pub/",
    "https://blossom.dreamith.to/",
    "https://blossom.primal.net/",
  ],
  updatedAt: 0,
};

/**
 * Get the effective Blossom server list based on user settings.
 *
 * Mirrors getEffectiveRelays() semantics:
 * - If useAppBlossomServers is true, merges app servers with user servers (deduped).
 * - If useAppBlossomServers is false, returns only user servers (deduped).
 *
 * Order is preserved: app servers first (when enabled), then user servers.
 * This matches BUD-03's "most trusted first" ordering convention.
 */
export function getEffectiveBlossomServers(
  userMeta: BlossomServerMetadata,
  useAppBlossomServers: boolean,
): string[] {
  if (!useAppBlossomServers) {
    return deduplicateServers(userMeta.servers);
  }

  const seen = new Set<string>();
  const merged: string[] = [];

  for (const url of [...APP_BLOSSOM_SERVERS.servers, ...userMeta.servers]) {
    const normalized = normalizeUrl(url);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      merged.push(url);
    }
  }

  return merged;
}

/** Deduplicate servers by normalized URL, preserving order. */
function deduplicateServers(servers: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of servers) {
    const normalized = normalizeUrl(url);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(url);
    }
  }
  return result;
}
