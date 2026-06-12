import type { NostrEvent } from "@nostrify/nostrify";
import { nip19 } from "nostr-tools";
import { sanitizeUrl } from "@/lib/sanitizeUrl";
import { NESTS_ROOM_KIND } from "./const";

/** Ditto shareable theme kind (rooms may reference one via an a-tag) */
const DITTO_THEME = 36767;

/** Get the a-tag value for a room event: "30312:<pubkey>:<d>" */
export function getRoomATag(event: NostrEvent): string {
  const d = event.tags.find(([t]) => t === "d")?.[1] ?? "";
  return `${NESTS_ROOM_KIND}:${event.pubkey}:${d}`;
}

/** Get the room title */
export function getRoomTitle(event: NostrEvent): string {
  return event.tags.find(([t]) => t === "title")?.[1] ?? "Untitled Room";
}

/** Get the room summary/description */
export function getRoomSummary(event: NostrEvent): string {
  return event.tags.find(([t]) => t === "summary")?.[1] ?? "";
}

/** Get the room status */
export function getRoomStatus(event: NostrEvent): "live" | "planned" | "ended" {
  const status = event.tags.find(([t]) => t === "status")?.[1];
  if (status === "planned" || status === "ended") return status;
  return "live";
}

/** Get the room color/gradient class */
export function getRoomColor(event: NostrEvent): string {
  return event.tags.find(([t]) => t === "color")?.[1] ?? "gradient-1";
}

/**
 * Get the room image URL. Sanitized (https-only, URL-normalized) because the
 * value is interpolated into CSS `url(...)` by callers.
 */
export function getRoomImage(event: NostrEvent): string | undefined {
  return sanitizeUrl(event.tags.find(([t]) => t === "image")?.[1]);
}

/** Get the room streaming URL (MoQ relay endpoint) */
export function getRoomStreamingUrl(event: NostrEvent): string | undefined {
  return event.tags.find(([t]) => t === "streaming")?.[1];
}

/** Get the room auth URL */
export function getRoomAuthUrl(event: NostrEvent): string | undefined {
  return event.tags.find(([t]) => t === "auth")?.[1];
}

/** Get the starts timestamp */
export function getRoomStarts(event: NostrEvent): number | undefined {
  const s = event.tags.find(([t]) => t === "starts")?.[1];
  return s ? parseInt(s, 10) : undefined;
}

/** Get the d-tag identifier */
export function getRoomDTag(event: NostrEvent): string {
  return event.tags.find(([t]) => t === "d")?.[1] ?? "";
}

/** Get room relays from the event */
export function getRoomRelays(event: NostrEvent): string[] {
  const relayTag = event.tags.find(([t]) => t === "relays");
  return relayTag ? relayTag.slice(1) : [];
}

/** Get participant p-tags with their roles */
export function getRoomParticipants(
  event: NostrEvent,
): Array<{ pubkey: string; relay: string; role: string }> {
  return event.tags
    .filter(([t]) => t === "p")
    .map(([, pubkey, relay, role]) => ({
      pubkey: pubkey ?? "",
      relay: relay ?? "",
      role: role ?? "",
    }));
}

/** Build a naddr for a room event */
export function buildRoomNaddr(event: NostrEvent): string {
  return nip19.naddrEncode({
    kind: NESTS_ROOM_KIND,
    pubkey: event.pubkey,
    identifier: getRoomDTag(event),
  });
}

/** Get the MoQ namespace for a room */
export function getRoomNamespace(event: NostrEvent): string {
  return `nests/${NESTS_ROOM_KIND}:${event.pubkey}:${getRoomDTag(event)}`;
}

/** Get the room's theme reference (a-tag pointing to kind:36767) */
export function getRoomThemeRef(event: NostrEvent): string | undefined {
  return event.tags.find(
    ([t, v]) => t === "a" && v?.startsWith(`${DITTO_THEME}:`),
  )?.[1];
}
