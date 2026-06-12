import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import type { NostrEvent } from "@nostrify/nostrify";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAppContext } from "@/hooks/useAppContext";
import { useToast } from "@/hooks/useToast";
import { useAudioPlayer } from "@/contexts/audioPlayerContextDef";
import { getEffectiveRelays } from "@/lib/appRelays";

import { NestsContext, type NestsSession } from "./nestsContextDef";
import { NestTransportContext } from "@/nests/transport/context";
import { authenticateWithMoqRelay } from "@/nests/transport/auth";
import type { ConnectionState, NestTransport } from "@/nests/transport/types";
import { NESTS_ROOM_KIND, DefaultMoQAuthUrl } from "@/nests/lib/const";
import {
  buildRoomNaddr,
  getRoomATag,
  getRoomAuthUrl,
  getRoomDTag,
  getRoomNamespace,
  getRoomRelays,
  getRoomStatus,
  getRoomStreamingUrl,
  getRoomTitle,
} from "@/nests/lib/room";
import { dedupeRelays, sanitizeUntrustedRelays } from "@/nests/lib/relays";
import { usePresence } from "@/nests/hooks/usePresence";
import { useAdminCommands } from "@/nests/hooks/useAdminCommands";
import { useIsAdmin } from "@/nests/hooks/useIsAdmin";
import { useWakeLock } from "@/nests/hooks/useWakeLock";
import { useAudioKeepAlive } from "@/nests/hooks/useAudioKeepAlive";
import { useBackgroundAudio } from "@/nests/hooks/useBackgroundAudio";

/**
 * App-level provider owning the active nest (live audio room) session.
 *
 * Mirrors AudioPlayerProvider: because it lives at the app root, the MoQ
 * audio connection, presence heartbeat, and moderation listeners all survive
 * navigation — the user can minimize a nest and keep listening while
 * browsing the rest of the app.
 *
 * The MoQ transport (and the @moq/* libraries) are loaded lazily on first
 * join so they stay out of the main bundle.
 */
export function NestsProvider({ children }: PropsWithChildren) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { toast } = useToast();
  const audioPlayer = useAudioPlayer();

  const [session, setSession] = useState<NestsSession | null>(null);
  const [transport, setTransport] = useState<NestTransport | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [authError, setAuthError] = useState<string | null>(null);
  const [handRaised, setHandRaised] = useState(false);
  const transportLoading = useRef(false);
  /** Pubkey that joined the current session — used to leave on logout/account switch. */
  const sessionPubkeyRef = useRef<string | null>(null);

  // The user's own relay URLs — the base of every room's effective relay set.
  const userRelayUrls = useMemo(
    () =>
      getEffectiveRelays(config.relayMetadata, config.useAppRelays, config.useUserRelays)
        .relays.map((r) => r.url),
    [config.relayMetadata, config.useAppRelays, config.useUserRelays],
  );

  const leaveNest = useCallback(() => {
    transport?.disconnect();
    setSession(null);
    setHandRaised(false);
    setAuthError(null);
    sessionPubkeyRef.current = null;
  }, [transport]);

  const joinNest = useCallback((event: NostrEvent, opts?: { relayHints?: string[] }) => {
    if (!user) return;

    // A live conversation takes priority over music/podcast playback.
    audioPlayer.pause();

    // Tear down any previous connection (switching nests)
    transport?.disconnect();

    const relays = dedupeRelays(
      userRelayUrls,
      sanitizeUntrustedRelays(opts?.relayHints),
      sanitizeUntrustedRelays(getRoomRelays(event)),
    );

    setHandRaised(false);
    setAuthError(null);
    sessionPubkeyRef.current = user.pubkey;
    setSession({
      roomEvent: event,
      naddr: buildRoomNaddr(event),
      roomATag: getRoomATag(event),
      relays,
      minimized: false,
    });

    // Lazily load the MoQ transport on first join
    if (!transport && !transportLoading.current) {
      transportLoading.current = true;
      import("@/nests/transport/moq-transport")
        .then(({ MoQAudioTransport }) => {
          setTransport(new MoQAudioTransport());
        })
        .catch((err) => {
          console.error("Failed to load audio engine:", err);
          setAuthError("Failed to load the audio engine");
          transportLoading.current = false;
        });
    }
  }, [user, transport, audioPlayer, userRelayUrls]);

  const minimize = useCallback(() => {
    setSession((prev) => (prev && !prev.minimized ? { ...prev, minimized: true } : prev));
  }, []);

  const expand = useCallback(() => {
    setSession((prev) => (prev && prev.minimized ? { ...prev, minimized: false } : prev));
  }, []);

  // --- Connection state mirroring ---
  useEffect(() => {
    if (!transport) return;
    setConnectionState(transport.state);
    return transport.onStateChange(setConnectionState);
  }, [transport]);

  // --- Local mic state (for presence) ---
  const [localState, setLocalState] = useState({
    isPublishing: false,
    isMicEnabled: false,
    declinedPublish: false,
  });
  useEffect(() => {
    if (!transport) return;
    const update = () =>
      setLocalState({
        isPublishing: transport.isPublishing,
        isMicEnabled: transport.isMicEnabled,
        declinedPublish: transport.declinedPublish,
      });
    update();
    return transport.onLocalStateChange(update);
  }, [transport]);

  // --- MoQ auth + connect (re-runs when promoted/demoted: isSpeaker changes) ---
  const { isSpeaker } = useIsAdmin(session?.roomEvent);
  const streamingUrl = session ? getRoomStreamingUrl(session.roomEvent) : undefined;
  const moqAuthUrl = session ? (getRoomAuthUrl(session.roomEvent) ?? DefaultMoQAuthUrl) : undefined;
  const namespace = session ? getRoomNamespace(session.roomEvent) : undefined;

  useEffect(() => {
    if (!transport || !user || !streamingUrl || !moqAuthUrl || !namespace) return;

    let cancelled = false;

    (async () => {
      let token: string | undefined;
      let canPublish = isSpeaker;
      try {
        token = await authenticateWithMoqRelay(moqAuthUrl, user.signer, namespace, isSpeaker);
        if (cancelled) return;
        setAuthError(null);
      } catch (err) {
        if (cancelled) return;
        console.error("MoQ auth failed:", err);
        setAuthError(err instanceof Error ? err.message : "Authentication failed");
        // Still join as listener without publish rights
        canPublish = false;
        token = undefined;
      }

      if (cancelled) return;
      try {
        await transport.connect({
          serverUrl: streamingUrl,
          authUrl: moqAuthUrl,
          roomNamespace: namespace,
          identity: user.pubkey,
          canPublish,
          token,
        });
      } catch (err) {
        if (!cancelled) console.error("Failed to connect transport:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [transport, user, streamingUrl, moqAuthUrl, namespace, isSpeaker]);

  // --- Keep the room event fresh (edits, role changes, status) ---
  const sessionPubkey = session?.roomEvent.pubkey;
  const sessionDTag = session ? getRoomDTag(session.roomEvent) : undefined;
  const relaysKey = session?.relays.join("|") ?? "";

  const { data: freshEvent } = useQuery({
    queryKey: ["nests", "session-room", sessionPubkey ?? "", sessionDTag ?? "", relaysKey],
    queryFn: async () => {
      const relays = relaysKey ? relaysKey.split("|") : [];
      const pool = relays.length > 0 ? nostr.group(relays) : nostr;
      const events = await pool.query(
        [{
          kinds: [NESTS_ROOM_KIND],
          authors: [sessionPubkey!],
          "#d": [sessionDTag!],
          limit: 5,
        }],
        { signal: AbortSignal.timeout(5000) },
      );
      return events.sort((a, b) => b.created_at - a.created_at)[0] ?? null;
    },
    enabled: !!session,
    refetchInterval: 5_000, // Fast refetch so stage promotions apply quickly
  });

  useEffect(() => {
    if (!freshEvent) return;
    setSession((prev) => {
      if (!prev || freshEvent.created_at <= prev.roomEvent.created_at) return prev;
      return {
        ...prev,
        roomEvent: freshEvent,
        relays: dedupeRelays(
          userRelayUrls,
          prev.relays,
          sanitizeUntrustedRelays(getRoomRelays(freshEvent)),
        ),
      };
    });
  }, [freshEvent, userRelayUrls]);

  // Leave automatically when the host ends the nest
  useEffect(() => {
    if (session && getRoomStatus(session.roomEvent) === "ended") {
      toast({ title: "This nest has ended" });
      leaveNest();
    }
  }, [session, toast, leaveNest]);

  // --- Presence heartbeat (runs while minimized too) ---
  usePresence({
    roomATag: session?.roomATag,
    handRaised,
    isPublishing: localState.isPublishing,
    isMuted: !localState.isMicEnabled,
    onStage: isSpeaker && !localState.declinedPublish,
    declinedPublish: localState.declinedPublish,
    relays: session?.relays,
  });

  // --- Moderation: kicks land even while minimized ---
  const onKick = useCallback(() => {
    toast({ title: "You have been removed from the nest", variant: "destructive" });
    leaveNest();
  }, [toast, leaveNest]);

  useAdminCommands({
    roomEvent: session?.roomEvent,
    relays: session?.relays,
    onKick,
  });

  // --- Keep screen/tab/audio alive while in a nest ---
  const sessionActive = !!session;
  useWakeLock(sessionActive);
  useAudioKeepAlive(sessionActive);
  useBackgroundAudio(session ? getRoomTitle(session.roomEvent) : "", sessionActive);

  // --- Leave on logout or account switch ---
  useEffect(() => {
    if (sessionPubkeyRef.current && user?.pubkey !== sessionPubkeyRef.current) {
      leaveNest();
    }
  }, [user?.pubkey, leaveNest]);

  // --- Best-effort cleanup when the tab closes ---
  useEffect(() => {
    if (!sessionActive || !transport) return;
    const onPageHide = () => transport.disconnect();
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [sessionActive, transport]);

  const contextValue = useMemo(
    () => ({
      session,
      transport,
      connectionState,
      authError,
      handRaised,
      setHandRaised,
      joinNest,
      leaveNest,
      minimize,
      expand,
    }),
    [session, transport, connectionState, authError, handRaised, joinNest, leaveNest, minimize, expand],
  );

  return (
    <NestsContext.Provider value={contextValue}>
      <NestTransportContext.Provider value={transport}>
        {children}
      </NestTransportContext.Provider>
    </NestsContext.Provider>
  );
}
