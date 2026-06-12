import { useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { Mic, Users } from "lucide-react";
import { nip19 } from "nostr-tools";
import type { NostrEvent } from "@nostrify/nostrify";

import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { useAddrEvent } from "@/hooks/useEvent";
import { useAppContext } from "@/hooks/useAppContext";
import { cn } from "@/lib/utils";
import { NESTS_ROOM_KIND } from "@/nests/lib/const";
import {
  getRoomATag,
  getRoomColor,
  getRoomStatus,
  getRoomSummary,
  getRoomTitle,
} from "@/nests/lib/room";
import { sanitizeUntrustedRelays } from "@/nests/lib/relays";
import { useRoomPresence } from "@/nests/hooks/useRoomPresence";

/** Decode a nest naddr into addr coordinates + relay hints. */
function useNestAddr(naddr: string | undefined) {
  return useMemo(() => {
    if (!naddr) return undefined;
    try {
      const decoded = nip19.decode(naddr);
      if (decoded.type !== "naddr" || decoded.data.kind !== NESTS_ROOM_KIND) {
        return undefined;
      }
      return {
        kind: decoded.data.kind,
        pubkey: decoded.data.pubkey,
        identifier: decoded.data.identifier,
        relays: sanitizeUntrustedRelays(decoded.data.relays),
      };
    } catch {
      return undefined;
    }
  }, [naddr]);
}

export function NestRoomPage() {
  const { naddr } = useParams<{ naddr: string }>();
  const location = useLocation();
  const { config } = useAppContext();

  const addr = useNestAddr(naddr);

  // An event passed via navigation state renders instantly; the addr query
  // keeps it fresh (the room event is replaceable and edited live).
  const stateEvent = (location.state as { event?: NostrEvent } | null)?.event;
  const { data: fetchedEvent, isLoading } = useAddrEvent(addr, addr?.relays);

  const event =
    fetchedEvent && stateEvent
      ? fetchedEvent.created_at >= stateEvent.created_at ? fetchedEvent : stateEvent
      : fetchedEvent ?? stateEvent;

  const roomATag = event ? getRoomATag(event) : undefined;
  const status = event ? getRoomStatus(event) : undefined;
  const { data: presenceList } = useRoomPresence(status === "live" ? roomATag : undefined);

  useSeoMeta({
    title: event ? `${getRoomTitle(event)} | ${config.appName}` : `Nest | ${config.appName}`,
  });

  if (!addr) {
    return (
      <main>
        <PageHeader title="Nest" icon={<Mic className="size-5" />} backTo="/nests" alwaysShowBack />
        <div className="px-4">
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              This link is not a valid nest.
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (!event) {
    return (
      <main>
        <PageHeader title="Nest" icon={<Mic className="size-5" />} backTo="/nests" alwaysShowBack />
        <div className="px-4 space-y-3">
          {isLoading ? (
            <>
              <Skeleton className="h-[160px] rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
            </>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-muted-foreground">
                Nest not found. It may have ended or its relays are unreachable.
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    );
  }

  const title = getRoomTitle(event);
  const summary = getRoomSummary(event);
  const color = getRoomColor(event);
  const listenerCount = presenceList?.length ?? 0;

  return (
    <main>
      <PageHeader title={title} icon={<Mic className="size-5" />} backTo="/nests" alwaysShowBack />

      <div className="px-4 pb-8 space-y-4">
        {/* Room banner */}
        <div className={cn("relative rounded-xl overflow-hidden p-5 md:p-6", color)}>
          <div className="flex items-center justify-between mb-2">
            {status === "live" ? (
              <Badge className="bg-red-500/90 text-white border-0 text-xs">LIVE</Badge>
            ) : status === "planned" ? (
              <Badge className="bg-white/20 text-white border-0 text-xs">PLANNED</Badge>
            ) : (
              <Badge className="bg-white/10 text-white/60 border-0 text-xs">ENDED</Badge>
            )}
            {status === "live" && listenerCount > 0 && (
              <div className="flex items-center gap-1 text-white/70 text-xs">
                <Users className="size-3" />
                {listenerCount}
              </div>
            )}
          </div>
          <h2 className="text-white font-semibold text-lg md:text-xl">{title}</h2>
          {summary && <p className="text-white/70 text-sm mt-1">{summary}</p>}
        </div>
      </div>
    </main>
  );
}
