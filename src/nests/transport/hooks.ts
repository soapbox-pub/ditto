import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ConnectionState, NestTransport, RemoteParticipant } from "./types";
import { NestTransportContext } from "./context";

/**
 * Get the NestTransport instance from context.
 */
export function useNestTransport(): NestTransport {
  const transport = useContext(NestTransportContext);
  if (!transport) {
    throw new Error("useNestTransport must be used within a <NestTransportProvider>");
  }
  return transport;
}

/**
 * Subscribe to the transport's connection state.
 */
export function useConnectionState(): ConnectionState {
  const transport = useNestTransport();
  const [state, setState] = useState<ConnectionState>(transport.state);

  useEffect(() => {
    // Sync initial state
    setState(transport.state);
    const unsub = transport.onStateChange((s) => setState(s));
    return unsub;
  }, [transport]);

  return state;
}

/**
 * Get local participant state (mic enabled, publishing status).
 */
export function useLocalParticipant() {
  const transport = useNestTransport();

  const [localState, setLocalState] = useState({
    isMicEnabled: transport.isMicEnabled,
    isPublishing: transport.isPublishing,
    declinedPublish: transport.declinedPublish,
  });

  useEffect(() => {
    setLocalState({
      isMicEnabled: transport.isMicEnabled,
      isPublishing: transport.isPublishing,
      declinedPublish: transport.declinedPublish,
    });
    const unsub = transport.onLocalStateChange(() => {
      setLocalState({
        isMicEnabled: transport.isMicEnabled,
        isPublishing: transport.isPublishing,
        declinedPublish: transport.declinedPublish,
      });
    });
    return unsub;
  }, [transport]);

  const setMicEnabled = useCallback(
    (enabled: boolean) => transport.setMicEnabled(enabled),
    [transport],
  );

  const publishMicrophone = useCallback(
    (deviceId?: string) => transport.publishMicrophone(deviceId),
    [transport],
  );

  const unpublishMicrophone = useCallback(() => transport.unpublishMicrophone(), [transport]);

  const resetDeclinedPublish = useCallback(() => transport.resetDeclinedPublish(), [transport]);

  return {
    ...localState,
    setMicEnabled,
    publishMicrophone,
    unpublishMicrophone,
    resetDeclinedPublish,
  };
}

/**
 * Get the map of remote participants.
 */
export function useRemoteParticipants(): ReadonlyMap<string, RemoteParticipant> {
  const transport = useNestTransport();

  const [snapshot, setSnapshot] = useState<ReadonlyMap<string, RemoteParticipant>>(
    () => transport.participants,
  );

  useEffect(() => {
    const unsub = transport.onParticipantsChange((p) => {
      setSnapshot(new Map(p));
    });
    return unsub;
  }, [transport]);

  return snapshot;
}

/**
 * Get the list of remote participant pubkeys as an array.
 */
export function useRemoteParticipantList(): RemoteParticipant[] {
  const participants = useRemoteParticipants();
  return useMemo(() => Array.from(participants.values()), [participants]);
}

/**
 * Volume control hook.
 */
export function useVolume() {
  const transport = useNestTransport();
  const [volume, setVolumeState] = useState(transport.volume);

  const setVolume = useCallback(
    (v: number) => {
      transport.setVolume(v);
      setVolumeState(v);
    },
    [transport],
  );

  return { volume, setVolume };
}
