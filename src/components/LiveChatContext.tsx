import { useMemo } from "react";
import { Link } from "react-router-dom";
import { nip19 } from "nostr-tools";
import { Radio } from "lucide-react";
import type { NostrEvent } from "@nostrify/nostrify";

import { useAddrEvent, type AddrCoords } from "@/hooks/useEvent";
import { isNostrId } from "@/lib/nostrId";

/**
 * Parse the NIP-53 live-chat root `a` tag (`30311:<pubkey>:<d>`) into
 * addressable coordinates. Returns `undefined` when the tag is missing or
 * the pubkey isn't well-formed hex (guards `nip19.naddrEncode`, which throws
 * on malformed input).
 */
function parseStreamCoords(event: NostrEvent): AddrCoords | undefined {
  const aTag = event.tags.find(([n]) => n === "a")?.[1];
  if (!aTag) return undefined;
  const [kindStr, pubkey, ...rest] = aTag.split(":");
  const kind = Number(kindStr);
  if (!Number.isFinite(kind) || !isNostrId(pubkey)) return undefined;
  return { kind, pubkey, identifier: rest.join(":") };
}

/**
 * Context line for a NIP-53 live chat message (kind 1311), shown above the
 * message body: "in {stream title}", linking to the stream it belongs to.
 * Without it, a chat message reads as a bare comment with no anchor. Renders
 * nothing when the `a` tag is missing or malformed.
 */
export function LiveChatContext({ event, className }: { event: NostrEvent; className?: string }) {
  const coords = useMemo(() => parseStreamCoords(event), [event]);
  const { data: stream } = useAddrEvent(coords);

  const naddr = useMemo(
    () =>
      coords
        ? nip19.naddrEncode({ kind: coords.kind, pubkey: coords.pubkey, identifier: coords.identifier })
        : undefined,
    [coords],
  );

  if (!coords || !naddr) return null;

  const title = stream?.tags.find(([n]) => n === "title")?.[1]?.trim() || "a live stream";

  return (
    <div
      className={
        className ||
        "flex items-center gap-1.5 text-sm text-muted-foreground mt-2 mb-1 min-w-0 overflow-hidden"
      }
    >
      <Radio className="size-3.5 shrink-0" />
      <span className="shrink-0">in</span>
      <Link
        to={`/${naddr}`}
        className="text-primary hover:underline truncate"
        onClick={(e) => e.stopPropagation()}
      >
        {title}
      </Link>
    </div>
  );
}
