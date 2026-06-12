import { useCallback, useEffect, useState } from "react";
import type { NestTransport, RemoteParticipant } from "../transport";
import { useNests } from "@/contexts/nestsContextDef";

/**
 * Null-safe variants of the transport hooks.
 *
 * The upstream transport hooks throw when no transport is in context; in
 * Ditto the transport is created lazily on first join, so room UI that can
 * render before (or without) a connection uses these instead.
 */

const EMPTY_LOCAL = {
  isMicEnabled: false,
  isPublishing: false,
  declinedPublish: false,
};

/** Local mic state, or inert defaults when no transport exists. */
export function useLocalParticipantSafe() {
  const { transport } = useNests();
  const [localState, setLocalState] = useState(EMPTY_LOCAL);

  useEffect(() => {
    if (!transport) {
      setLocalState(EMPTY_LOCAL);
      return;
    }
    const update = () =>
      setLocalState({
        isMicEnabled: transport.isMicEnabled,
        isPublishing: transport.isPublishing,
        declinedPublish: transport.declinedPublish,
      });
    update();
    return transport.onLocalStateChange(update);
  }, [transport]);

  const setMicEnabled = useCallback(
    (enabled: boolean) => transport?.setMicEnabled(enabled),
    [transport],
  );

  const publishMicrophone = useCallback(
    (deviceId?: string) => transport?.publishMicrophone(deviceId) ?? Promise.resolve(),
    [transport],
  );

  const unpublishMicrophone = useCallback(() => transport?.unpublishMicrophone(), [transport]);

  const resetDeclinedPublish = useCallback(() => transport?.resetDeclinedPublish(), [transport]);

  return {
    ...localState,
    setMicEnabled,
    publishMicrophone,
    unpublishMicrophone,
    resetDeclinedPublish,
  };
}

/** Remote participants discovered via MoQ announcements (empty when no transport). */
export function useRemoteParticipantListSafe(): RemoteParticipant[] {
  const { transport } = useNests();
  const [snapshot, setSnapshot] = useState<RemoteParticipant[]>([]);

  useEffect(() => {
    if (!transport) {
      setSnapshot([]);
      return;
    }
    setSnapshot(Array.from(transport.participants.values()));
    return transport.onParticipantsChange((p) => setSnapshot(Array.from(p.values())));
  }, [transport]);

  return snapshot;
}

/** The current transport, or null. */
export function useNestTransportSafe(): NestTransport | null {
  return useNests().transport;
}
