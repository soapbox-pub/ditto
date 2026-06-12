/**
 * Nests (live audio rooms) constants.
 *
 * Ported from the Nests app (NestsUI-v2). Nests are NIP-53-style live
 * activities using kind 30312 room events with MoQ audio transport.
 */

/** Nests room event kind (NIP-53 variant) */
export const NESTS_ROOM_KIND = 30312;

/** Room presence event kind */
export const NESTS_PRESENCE_KIND = 10312;

/** Live chat kind (NIP-53, shared with live streams) */
export const NESTS_LIVE_CHAT_KIND = 1311;

/** MoQ server list kind (NIP-51 standard list) */
export const MOQ_SERVER_LIST_KIND = 10112;

/** Admin command kind (mute/kick) */
export const NESTS_ADMIN_COMMAND_KIND = 4312;

/** Room participant roles as used in p-tag markers */
export const NestRole = {
  HOST: "host",
  ADMIN: "admin",
  SPEAKER: "speaker",
} as const;

export type NestRole = (typeof NestRole)[keyof typeof NestRole];

/** MoQ server entry: relay URL + auth URL */
export interface MoQServer {
  relay: string;
  auth: string;
}

/** Default MoQ relay servers (used when user has no kind:10112 list) */
export const DefaultMoQServers: MoQServer[] = [
  {
    relay: "https://moq.nostrnests.com:4443",
    auth: "https://moq-auth.nostrnests.com",
  },
];

/** Default MoQ auth service URL (fallback for rooms without an auth tag) */
export const DefaultMoQAuthUrl = "https://moq-auth.nostrnests.com";

/** Color palette for nest cards (classes defined in index.css) */
export const NestColorPalette = [
  "gradient-1",
  "gradient-2",
  "gradient-3",
  "gradient-4",
  "gradient-5",
  "gradient-6",
  "gradient-7",
  "gradient-8",
  "gradient-9",
  "gradient-10",
  "gradient-11",
] as const;
