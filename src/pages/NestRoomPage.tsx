import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { Mic, Users, WifiOff } from "lucide-react";
import { nip19 } from "nostr-tools";
import type { Event } from "nostr-tools";
import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import type { NostrEvent } from "@nostrify/nostrify";

import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { LiveStreamChat } from "@/components/LiveStreamChat";
import { ZapDialog } from "@/components/ZapDialog";
import { useLayoutOptions } from "@/contexts/LayoutContext";
import { useAddrEvent } from "@/hooks/useEvent";
import { useAppContext } from "@/hooks/useAppContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useIsMobile } from "@/hooks/useIsMobile";
import { getEffectiveRelays } from "@/lib/appRelays";
import { cn } from "@/lib/utils";

import { ScopedTheme } from "@/components/ScopedTheme";
import { useNests } from "@/contexts/nestsContextDef";
import { NestRoomProvider } from "@/nests/NestRoomProvider";
import { useRoomTheme } from "@/nests/hooks/useRoomTheme";
import { RoomRelaysProvider } from "@/nests/RoomRelaysProvider";
import { ParticipantsGrid } from "@/nests/components/ParticipantsGrid";
import { NestMenuBar } from "@/nests/components/NestMenuBar";
import { ReactionOverlay } from "@/nests/components/ReactionOverlay";
import { NESTS_ROOM_KIND, isNestAudioSupported } from "@/nests/lib/const";
import {
  getRoomATag,
  getRoomColor,
  getRoomImage,
  getRoomStatus,
  getRoomSummary,
  getRoomTitle,
  getRoomRelays,
} from "@/nests/lib/room";
import { dedupeRelays, sanitizeUntrustedRelays } from "@/nests/lib/relays";
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
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { session, joinNest, expand, connectionState, authError } = useNests();

  const addr = useNestAddr(naddr);
  const sessionMatches = !!session && !!naddr && session.naddr === naddr;

  // --- Resolve the room event ---
  // An event passed via navigation state renders instantly.
  const stateEvent = (location.state as { event?: NostrEvent } | null)?.event;
  const { data: fetchedEvent, isLoading } = useAddrEvent(
    // When the session owns this room, its 5s polling keeps the event fresh —
    // skip the page-level query.
    sessionMatches ? undefined : addr,
    addr?.relays,
  );

  const userRelayUrls = useMemo(
    () =>
      getEffectiveRelays(config.relayMetadata, config.useAppRelays, config.useUserRelays)
        .relays.map((r) => r.url),
    [config.relayMetadata, config.useAppRelays, config.useUserRelays],
  );

  const event = sessionMatches
    ? session.roomEvent
    : fetchedEvent && stateEvent
      ? fetchedEvent.created_at >= stateEvent.created_at ? fetchedEvent : stateEvent
      : fetchedEvent ?? stateEvent;

  // Refresh the room event every 5s while viewing without a session
  // (role changes and edits should show for spectators too).
  const spectating = !!event && !sessionMatches;
  const { data: refreshedEvent } = useQuery({
    queryKey: ["nests", "room-refresh", addr?.pubkey ?? "", addr?.identifier ?? ""],
    queryFn: async () => {
      const relays = dedupeRelays(
        userRelayUrls,
        addr?.relays,
        event ? sanitizeUntrustedRelays(getRoomRelays(event)) : undefined,
      );
      const pool = relays.length > 0 ? nostr.group(relays) : nostr;
      const events = await pool.query(
        [{ kinds: [NESTS_ROOM_KIND], authors: [addr!.pubkey], "#d": [addr!.identifier], limit: 5 }],
        { signal: AbortSignal.timeout(5000) },
      );
      return events.sort((a, b) => b.created_at - a.created_at)[0] ?? null;
    },
    enabled: spectating && !!addr,
    refetchInterval: 5_000,
  });

  const currentEvent =
    refreshedEvent && event && refreshedEvent.created_at > event.created_at && !sessionMatches
      ? refreshedEvent
      : event;

  // Effective relay set for room-scoped queries (chat, presence, reactions)
  const roomRelays = useMemo(() => {
    if (sessionMatches) return session.relays;
    return dedupeRelays(
      userRelayUrls,
      addr?.relays,
      currentEvent ? sanitizeUntrustedRelays(getRoomRelays(currentEvent)) : undefined,
    );
  }, [sessionMatches, session, userRelayUrls, addr?.relays, currentEvent]);

  const status = currentEvent ? getRoomStatus(currentEvent) : undefined;

  // Room theme (inline c/f/bg tags or referenced kind 36767)
  const roomTheme = useRoomTheme(currentEvent ?? undefined);

  // Load the room theme's custom font (trusted CDNs only)
  useEffect(() => {
    const fontUrl = roomTheme?.font?.url;
    if (!fontUrl) return;
    const trustedHosts = ["fonts.googleapis.com", "fonts.bunny.net", "fonts.cdnfonts.com", "use.typekit.net"];
    try {
      const host = new URL(fontUrl).hostname;
      if (!trustedHosts.some((h) => host === h || host.endsWith(`.${h}`))) return;
    } catch {
      return;
    }
    const id = "nest-room-theme-font";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = fontUrl;
    document.head.appendChild(link);
    return () => {
      document.getElementById(id)?.remove();
    };
  }, [roomTheme?.font?.url]);

  // Background image + font family applied to the themed wrapper
  const themedStyle = useMemo(() => {
    if (!roomTheme) return undefined;
    const style: React.CSSProperties = {};
    if (roomTheme.background?.url) {
      style.backgroundImage = `url(${roomTheme.background.url})`;
      style.backgroundSize = roomTheme.background.mode === "tile" ? "auto" : "cover";
      style.backgroundRepeat = roomTheme.background.mode === "tile" ? "repeat" : "no-repeat";
      style.backgroundPosition = "center";
    }
    if (roomTheme.font?.family) {
      style.fontFamily = `'${roomTheme.font.family}', sans-serif`;
    }
    return style;
  }, [roomTheme]);

  // --- Auto-join on first visit (like clicking into a Space) ---
  // The ref prevents re-joining after an explicit leave or kick.
  const autoJoinedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentEvent || !user || !naddr) return;
    if (status === "ended") return;
    if (sessionMatches) return;
    if (autoJoinedRef.current === naddr) return;
    autoJoinedRef.current = naddr;
    joinNest(currentEvent, { relayHints: addr?.relays });
  }, [currentEvent, user, naddr, status, sessionMatches, joinNest, addr?.relays]);

  // Un-minimize whenever this page shows the active session
  useEffect(() => {
    if (sessionMatches && session.minimized) expand();
  }, [sessionMatches, session, expand]);

  useSeoMeta({
    title: currentEvent
      ? `${getRoomTitle(currentEvent)} | ${config.appName}`
      : `Nest | ${config.appName}`,
  });

  // --- Chat layout: desktop right sidebar, mobile drawer ---
  const isMobile = useIsMobile();
  const [chatOpen, setChatOpen] = useState(false);
  const [zapOpen, setZapOpen] = useState(false);
  const roomATag = currentEvent ? getRoomATag(currentEvent) : undefined;

  const chatSidebar = currentEvent ? (
    <aside className="hidden lg:flex lg:flex-col lg:w-[340px] lg:shrink-0 h-screen sticky top-0">
      <LiveStreamChat aTag={roomATag!} relays={roomRelays} className="h-full" />
    </aside>
  ) : undefined;

  useLayoutOptions({ rightSidebar: chatSidebar, noOverscroll: true });

  // --- Not-found / loading / invalid states ---
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

  if (!currentEvent) {
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

  const title = getRoomTitle(currentEvent);
  const summary = getRoomSummary(currentEvent);
  const color = getRoomColor(currentEvent);
  const image = getRoomImage(currentEvent);

  const roomContent = (
        <main
          className="flex flex-col min-h-[calc(100dvh-3.5rem)] sidebar:min-h-screen bg-background text-foreground"
          style={themedStyle}
        >
          {/* Room banner */}
          <div className="shrink-0 p-2 md:p-4 pb-0 md:pb-0">
            <div className={cn("relative overflow-hidden rounded-xl shadow-lg", color)}>
              {image && (
                <>
                  <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${image})` }} />
                  <div className="absolute inset-0 bg-black/40" />
                </>
              )}
              <div className="relative px-5 py-4 md:px-6 md:py-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h1 className="text-white font-bold text-lg md:text-xl leading-tight drop-shadow-md">{title}</h1>
                    {summary && (
                      <p className="text-white/80 text-sm md:text-base mt-1 line-clamp-2 drop-shadow-sm">{summary}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2.5">
                      {status === "live" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500 text-white shadow-sm">
                          <span className="size-2 rounded-full bg-white animate-pulse" />
                          LIVE
                        </span>
                      ) : status === "planned" ? (
                        <Badge className="bg-white/20 text-white border-0">PLANNED</Badge>
                      ) : (
                        <Badge className="bg-white/10 text-white/60 border-0">ENDED</Badge>
                      )}
                      <ListenerCount roomATag={status === "live" ? roomATag : undefined} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Connection status notices */}
          {!isNestAudioSupported() && status === "live" && (
            <div className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 text-xs px-4 py-1.5 text-center mt-2">
              Live audio isn't supported in this browser. You can still see who's here and follow the chat.
            </div>
          )}
          {sessionMatches && authError && (
            <div className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 text-xs px-4 py-1.5 text-center mt-2">
              Audio connection issue: {authError}
            </div>
          )}
          {sessionMatches && connectionState === "reconnecting" && (
            <div className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 text-xs px-4 py-1.5 text-center mt-2 flex items-center justify-center gap-1.5">
              <WifiOff className="size-3.5" />
              Reconnecting to audio…
            </div>
          )}

          {/* Join prompt for logged-out users or after leaving */}
          {!sessionMatches && status !== "ended" && (
            <div className="px-4 pt-3">
              <Card>
                <CardContent className="py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {user
                      ? "You're viewing this nest. Join to listen and participate."
                      : "Log in to join this nest and listen live."}
                  </p>
                  {user && (
                    <Button
                      size="sm"
                      onClick={() => {
                        autoJoinedRef.current = null;
                        joinNest(currentEvent, { relayHints: addr.relays });
                      }}
                    >
                      <Mic className="size-4 mr-1.5" />
                      Join Nest
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Participants */}
          <div className="flex-1 px-2 md:px-4 py-2 md:py-4 pb-36 sidebar:pb-4">
            <div className="bg-background/70 backdrop-blur-sm rounded-xl border border-border/30">
              <ParticipantsGrid />
            </div>
          </div>

          {/* Menu bar: mobile fixed bottom, desktop floating pill */}
          <NestMenuBar
            onChatToggle={isMobile ? () => setChatOpen(!chatOpen) : undefined}
            chatOpen={chatOpen}
            onZap={() => setZapOpen(true)}
          />

          {/* Mobile chat drawer */}
          {isMobile && (
            <Drawer open={chatOpen} onOpenChange={setChatOpen}>
              <DrawerContent className="h-[70dvh] max-h-[70dvh]">
                <DrawerTitle className="sr-only">Chat</DrawerTitle>
                <LiveStreamChat aTag={roomATag!} relays={roomRelays} className="h-full" />
              </DrawerContent>
            </Drawer>
          )}

          {/* Flying emoji reactions */}
          <ReactionOverlay />

          {/* Zap the nest (zaps go to the room host) */}
          <ZapDialog
            target={currentEvent as Event}
            open={zapOpen}
            onOpenChange={setZapOpen}
          />
        </main>
  );

  return (
    <RoomRelaysProvider relays={roomRelays}>
      <NestRoomProvider event={currentEvent}>
        {roomTheme ? (
          <ScopedTheme colors={roomTheme.colors}>{roomContent}</ScopedTheme>
        ) : (
          roomContent
        )}
      </NestRoomProvider>
    </RoomRelaysProvider>
  );
}

function ListenerCount({ roomATag }: { roomATag: string | undefined }) {
  const { data: presenceList } = useRoomPresence(roomATag);
  const count = presenceList?.length ?? 0;
  if (!roomATag || count === 0) return null;
  return (
    <span className="text-white/70 text-xs md:text-sm flex items-center gap-1.5">
      <Users className="size-3.5" />
      {count} listening
    </span>
  );
}
