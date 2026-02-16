import type { NostrEvent } from '@nostrify/nostrify';

// ============================================================================
// Message Protocol Types
// ============================================================================

export const MESSAGE_PROTOCOL = {
  NIP04: 'nip04',
  NIP17: 'nip17',
  UNKNOWN: 'unknown',
} as const;

export type MessageProtocol = typeof MESSAGE_PROTOCOL[keyof typeof MESSAGE_PROTOCOL];

// ============================================================================
// Protocol Mode (for user selection)
// ============================================================================

export const PROTOCOL_MODE = {
  NIP04_ONLY: 'nip04_only',
  NIP17_ONLY: 'nip17_only',
  NIP04_OR_NIP17: 'nip04_or_nip17',
} as const;

export type ProtocolMode = typeof PROTOCOL_MODE[keyof typeof PROTOCOL_MODE];

// ============================================================================
// Loading Phases
// ============================================================================

export const LOADING_PHASES = {
  IDLE: 'idle',
  CACHE: 'cache',
  RELAYS: 'relays',
  SUBSCRIPTIONS: 'subscriptions',
  READY: 'ready',
} as const;

export type LoadingPhase = typeof LOADING_PHASES[keyof typeof LOADING_PHASES];

// ============================================================================
// Protocol Configuration
// ============================================================================

export const PROTOCOL_CONFIG = {
  [MESSAGE_PROTOCOL.NIP04]: {
    label: 'NIP-04',
    description: 'Legacy DMs',
    kind: 4,
  },
  [MESSAGE_PROTOCOL.NIP17]: {
    label: 'NIP-17',
    description: 'Private DMs',
    kind: 1059,
  },
  [MESSAGE_PROTOCOL.UNKNOWN]: {
    label: 'Unknown',
    description: 'Unknown protocol',
    kind: 0,
  },
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the message protocol from an event kind
 */
export function getMessageProtocol(event: NostrEvent): MessageProtocol {
  switch (event.kind) {
    case 4:
      return MESSAGE_PROTOCOL.NIP04;
    case 1059:
      return MESSAGE_PROTOCOL.NIP17;
    default:
      return MESSAGE_PROTOCOL.UNKNOWN;
  }
}

/**
 * Check if a protocol is valid for sending messages
 */
export function isValidSendProtocol(protocol: MessageProtocol): boolean {
  return protocol === MESSAGE_PROTOCOL.NIP04 || protocol === MESSAGE_PROTOCOL.NIP17;
}
