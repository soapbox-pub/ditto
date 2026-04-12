/**
 * Central registry of Nostr event kind labels.
 *
 * This is the single source of truth for kind → human-readable label mappings.
 * All other files that need kind labels should import from here rather than
 * maintaining their own maps.
 *
 * Sources:
 * - NIP README kinds table (https://github.com/nostr-protocol/nips)
 * - Ditto reference (https://about.ditto.pub/reference)
 * - Existing codebase registries (consolidated)
 *
 * Labels are bare noun phrases (no articles, no verbs) so each consumer can
 * add its own grammar:
 *   - NsitePermissionPrompt: "Sign: Short text note"
 *   - CommentContext:         "a short text note"
 *   - NotificationsPage:      "reacted to your short text note"
 *   - signerWithNudge:        "Approve post in signer" (uses its own override)
 */

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

/** Map of every known Nostr event kind to a short human-readable label. */
export const KIND_LABELS: Record<number, string> = {
  // NIP-01 core
  0: 'Profile',
  1: 'Short text note',
  2: 'Recommend relay',
  3: 'Follows',
  4: 'Encrypted message',
  5: 'Deletion',
  6: 'Repost',
  7: 'Reaction',
  8: 'Badge award',
  9: 'Chat message',
  10: 'Group chat threaded reply',
  11: 'Thread',
  12: 'Group thread reply',
  13: 'Seal',
  14: 'Direct message',
  15: 'File message',
  16: 'Generic repost',
  17: 'Reaction to a website',
  20: 'Photo',
  21: 'Video',
  22: 'Short video',
  24: 'Public message',

  // NKBIP-03
  30: 'Internal reference',
  31: 'External web reference',
  32: 'Hardcopy reference',
  33: 'Prompt reference',

  // NIP-28 Public Chat
  40: 'Channel creation',
  41: 'Channel metadata',
  42: 'Channel message',
  43: 'Channel hide message',
  44: 'Channel mute user',

  // NIP-62
  62: 'Request to vanish',
  // NIP-64
  64: 'Chess (PGN)',

  // Marmot
  443: 'KeyPackage',
  444: 'Welcome message',
  445: 'Group event',

  // NIP-54
  818: 'Merge request',

  // NIP-88 Poll
  1018: 'Poll vote',
  // NIP-15 Marketplace
  1021: 'Bid',
  1022: 'Bid confirmation',
  // NIP-03
  1040: 'OpenTimestamps',
  // NIP-59
  1059: 'Gift wrap',
  // NIP-94
  1063: 'File metadata',
  // NIP-88
  1068: 'Poll',
  // NIP-22
  1111: 'Comment',
  // NIP-A0 Voice
  1222: 'Voice message',
  1244: 'Voice message comment',
  // NIP-53 Live
  1311: 'Live chat message',
  // NIP-C0
  1337: 'Code snippet',
  // NIP-34 Git
  1617: 'Patch',
  1618: 'Pull request',
  1619: 'Pull request update',
  1621: 'Issue',
  1622: 'Git reply',
  1630: 'Git status (open)',
  1631: 'Git status (applied)',
  1632: 'Git status (closed)',
  1633: 'Git status (draft)',
  // Nostrocket
  1971: 'Problem tracker',
  // NIP-56
  1984: 'Report',
  // NIP-32
  1985: 'Label',
  // Relay reviews
  1986: 'Relay review',
  // AI embeddings
  1987: 'AI embeddings',
  // NIP-35 Torrents
  2003: 'Torrent',
  2004: 'Torrent comment',
  // Coinjoin
  2022: 'Coinjoin pool',

  // NIP-82 (Zapstore)
  3063: 'Zapstore asset',

  // Ditto custom kinds
  3367: 'Color moment',

  // NIP-72
  4550: 'Community post approval',

  // NIP-90 DVM (ranges)
  5000: 'Job request',
  6000: 'Job result',
  7000: 'Job feedback',

  // NIP-60 Cashu
  7374: 'Reserved Cashu wallet tokens',
  7375: 'Cashu wallet tokens',
  7376: 'Cashu wallet history',

  // Geocaching
  7516: 'Found log',
  7517: 'Geocache proof of find',

  // NIP-43
  8000: 'Add user',
  8001: 'Remove user',

  // Ditto letters
  8211: 'Letter',

  // NIP-29 Group control (range)
  9000: 'Group control event',

  // NIP-75
  9041: 'Zap goal',
  // NIP-61
  9321: 'Nutzap',
  // Tidal
  9467: 'Tidal login',
  // NIP-57 Zaps
  9734: 'Zap request',
  9735: 'Zap',
  // NIP-84
  9802: 'Highlight',

  // ---- Replaceable events (10000+) ----

  // NIP-51 Lists
  10000: 'Mute list',
  10001: 'Pin list',
  // NIP-65
  10002: 'Relay list',
  // NIP-51
  10003: 'Bookmark list',
  10004: 'Communities list',
  10005: 'Public chats list',
  10006: 'Blocked relays list',
  10007: 'Search relays list',
  // NIP-58
  10008: 'Profile badges',
  // NIP-29
  10009: 'User groups',
  // NIP-39
  10011: 'External identities',
  // NIP-51
  10012: 'Favorite relays list',
  // NIP-37
  10013: 'Private event relay list',
  // NIP-51
  10015: 'Interests list',
  // NIP-61
  10019: 'Nutzap mint recommendation',
  // NIP-51
  10020: 'Media follows',
  10030: 'Emoji list',
  // NIP-17
  10050: 'DM relay list',
  // Marmot
  10051: 'KeyPackage relays list',
  // Blossom
  10063: 'Blossom server list',
  // NIP-96 (deprecated)
  10096: 'File storage server list',
  // NIP-66
  10166: 'Relay monitor announcement',
  // NIP-53
  10312: 'Room presence',
  // Nostr Epoxy
  10377: 'Proxy announcement',
  11111: 'Transport method announcement',
  // Bookstr
  10073: 'Read books',
  10074: 'Currently reading',
  10075: 'To be read',
  // Blobbi
  11125: 'Blobbonaut profile',

  // NIP-47 Wallet
  13194: 'Wallet info',
  // NIP-43
  13534: 'Membership lists',
  // Corny Chat
  14388: 'User sound effect lists',

  // Blobbi
  14919: 'Blobbi interaction',
  14920: 'Blobbi breeding',
  14921: 'Blobbi record',

  // NIP-5A nsites
  15128: 'Nsite',
  // Weather station
  16158: 'Weather station',
  // Theme
  16767: 'Active profile theme',
  // Profile tabs
  16769: 'Profile tabs',
  // NIP-60
  17375: 'Cashu wallet event',
  // Lightning.Pub
  21000: 'Lightning Pub RPC',
  // NIP-42
  22242: 'Client authentication',
  // NIP-47
  23194: 'Wallet request',
  23195: 'Wallet response',
  // NIP-46
  24133: 'Nostr Connect',
  // Blossom
  24242: 'Blob stored on mediaserver',
  // NIP-98
  27235: 'HTTP auth',
  // NIP-43
  28934: 'Join request',
  28935: 'Invite request',
  28936: 'Leave request',

  // Webxdc
  4932: 'Webxdc sync',
  20932: 'Webxdc sync',

  // ---- Addressable events (30000+) ----

  // NIP-51 Sets
  30000: 'Follow set',
  30001: 'Generic list',
  30002: 'Relay set',
  30003: 'Bookmark set',
  30004: 'Curation set',
  30005: 'Video set',
  30006: 'Picture set',
  30007: 'Kind mute set',
  // NIP-58
  30008: 'Badge set',
  30009: 'Badge definition',
  // NIP-51
  30015: 'Interest set',
  // NIP-15 Marketplace
  30017: 'Stall',
  30018: 'Product',
  30019: 'Marketplace UI/UX',
  30020: 'Auction product',
  // NIP-23
  30023: 'Article',
  30024: 'Draft long-form content',
  // NIP-30
  30030: 'Emoji set',
  // NKBIP-01
  30040: 'Curated publication index',
  30041: 'Curated publication content',
  // NIP-82 (Zapstore)
  30063: 'Zapstore release',
  // NIP-78
  30078: 'App settings',
  // NIP-66
  30166: 'Relay discovery',
  // NIP-51
  30267: 'App curation set',
  // NIP-53
  30311: 'Live event',
  30312: 'Interactive room',
  30313: 'Conference event',
  // NIP-38
  30315: 'User status',
  // NIP-85
  30382: 'User trusted assertion',
  30383: 'Event trusted assertion',
  30384: 'Addressable event trusted assertion',
  // Corny Chat
  30388: 'Slide set',
  // NIP-99
  30402: 'Classified listing',
  30403: 'Draft classified listing',
  // Podcasts
  30054: 'Podcast episode',
  30055: 'Podcast trailer',
  // NIP-34 Git
  30617: 'Repository',
  30618: 'Repository state',
  // NIP-54 Wiki
  30818: 'Wiki article',
  30819: 'Wiki redirect',
  // Custom NIP
  30817: 'Custom NIP',
  // NIP-37
  31234: 'Draft event',
  // Corny Chat
  31388: 'Link set',
  // Custom Feeds
  31890: 'Feed',
  // NIP-52 Calendar
  31922: 'Date calendar event',
  31923: 'Time calendar event',
  31924: 'Calendar',
  31925: 'Calendar event RSVP',
  // NIP-89
  31989: 'App recommendation',
  31990: 'App',
  // Bookstr
  31985: 'Book review',
  // Blobbi
  31124: 'Blobbi',
  // Zapstore
  32267: 'Zapstore app',
  // Corny Chat
  32388: 'User room favorites',
  33388: 'High scores',
  // NIP-71
  34235: 'Addressable video',
  34236: 'Addressable short video',
  // Corny Chat
  34388: 'Sound effects',
  // Music
  34139: 'Music playlist',
  // NIP-72
  34550: 'Community definition',
  // NIP-5A
  34128: 'Nsite (legacy)',
  35128: 'Nsite',
  // Theme
  36767: 'Theme definition',
  // Music
  36787: 'Music track',
  // Ditto custom
  37381: 'Magic deck',
  37516: 'Geocache listing',
  // NIP-87
  38172: 'Cashu mint announcement',
  38173: 'Fedimint announcement',
  // NIP-69
  38383: 'Peer-to-peer order',
  // NIP-51
  39089: 'Follow pack',
  39092: 'Media follow pack',
  // NIP-B0
  39701: 'Web bookmark',
};

// ---------------------------------------------------------------------------
// Lookup function
// ---------------------------------------------------------------------------

/**
 * Get the human-readable label for a Nostr event kind.
 *
 * Falls back to `"Kind <n>"` for unknown kinds, unless a custom fallback
 * is provided.
 */
export function getKindLabel(kind: number, fallback?: string): string {
  return KIND_LABELS[kind] ?? fallback ?? `Kind ${kind}`;
}
