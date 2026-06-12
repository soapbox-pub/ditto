// Transport abstraction layer - public API
//
// Unlike the upstream Nests app, there is no NestTransportProvider here: the
// transport instance is owned by the app-level NestsProvider so the audio
// connection survives navigation while a nest is minimized.
export type {
  ConnectionState,
  NestTransport,
  RemoteParticipant,
  TransportConfig,
  Unsubscribe,
} from "./types";

export { MoQAudioTransport } from "./moq-transport";
export { NestTransportContext } from "./context";
export { authenticateWithMoqRelay } from "./auth";
export {
  useNestTransport,
  useConnectionState,
  useLocalParticipant,
  useRemoteParticipants,
  useRemoteParticipantList,
  useVolume,
} from "./hooks";
