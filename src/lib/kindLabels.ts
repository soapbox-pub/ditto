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

import { defineMessage, type IntlShape, type MessageDescriptor } from 'react-intl';

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

/** Map of every known Nostr event kind to a short human-readable label. */
export const KIND_LABELS: Record<number, MessageDescriptor> = {
  // NIP-01 core
  0: defineMessage({ id: 'kindLabels.k0', defaultMessage: 'Profile' }),
  1: defineMessage({ id: 'kindLabels.k1', defaultMessage: 'Short text note' }),
  2: defineMessage({ id: 'kindLabels.k2', defaultMessage: 'Recommend relay' }),
  3: defineMessage({ id: 'kindLabels.k3', defaultMessage: 'Follows' }),
  4: defineMessage({ id: 'kindLabels.k4', defaultMessage: 'Encrypted message' }),
  5: defineMessage({ id: 'kindLabels.k5', defaultMessage: 'Deletion' }),
  6: defineMessage({ id: 'kindLabels.k6', defaultMessage: 'Repost' }),
  7: defineMessage({ id: 'kindLabels.k7', defaultMessage: 'Reaction' }),
  8: defineMessage({ id: 'kindLabels.k8', defaultMessage: 'Badge award' }),
  9: defineMessage({ id: 'kindLabels.k9', defaultMessage: 'Chat message' }),
  10: defineMessage({ id: 'kindLabels.k10', defaultMessage: 'Group chat threaded reply' }),
  11: defineMessage({ id: 'kindLabels.k11', defaultMessage: 'Thread' }),
  12: defineMessage({ id: 'kindLabels.k12', defaultMessage: 'Group thread reply' }),
  13: defineMessage({ id: 'kindLabels.k13', defaultMessage: 'Seal' }),
  14: defineMessage({ id: 'kindLabels.k14', defaultMessage: 'Direct message' }),
  15: defineMessage({ id: 'kindLabels.k15', defaultMessage: 'File message' }),
  16: defineMessage({ id: 'kindLabels.k16', defaultMessage: 'Generic repost' }),
  17: defineMessage({ id: 'kindLabels.k17', defaultMessage: 'Reaction to a website' }),
  20: defineMessage({ id: 'kindLabels.k20', defaultMessage: 'Photo' }),
  21: defineMessage({ id: 'kindLabels.k21', defaultMessage: 'Video' }),
  22: defineMessage({ id: 'kindLabels.k22', defaultMessage: 'Short video' }),
  24: defineMessage({ id: 'kindLabels.k24', defaultMessage: 'Public message' }),

  // NKBIP-03
  30: defineMessage({ id: 'kindLabels.k30', defaultMessage: 'Internal reference' }),
  31: defineMessage({ id: 'kindLabels.k31', defaultMessage: 'External web reference' }),
  32: defineMessage({ id: 'kindLabels.k32', defaultMessage: 'Hardcopy reference' }),
  33: defineMessage({ id: 'kindLabels.k33', defaultMessage: 'Prompt reference' }),

  // NIP-28 Public Chat
  40: defineMessage({ id: 'kindLabels.k40', defaultMessage: 'Channel creation' }),
  41: defineMessage({ id: 'kindLabels.k41', defaultMessage: 'Channel metadata' }),
  42: defineMessage({ id: 'kindLabels.k42', defaultMessage: 'Channel message' }),
  43: defineMessage({ id: 'kindLabels.k43', defaultMessage: 'Channel hide message' }),
  44: defineMessage({ id: 'kindLabels.k44', defaultMessage: 'Channel mute user' }),

  // NIP-62
  62: defineMessage({ id: 'kindLabels.k62', defaultMessage: 'Request to vanish' }),
  // NIP-64
  64: defineMessage({ id: 'kindLabels.k64', defaultMessage: 'Chess (PGN)' }),

  // Marmot
  443: defineMessage({ id: 'kindLabels.k443', defaultMessage: 'KeyPackage' }),
  444: defineMessage({ id: 'kindLabels.k444', defaultMessage: 'Welcome message' }),
  445: defineMessage({ id: 'kindLabels.k445', defaultMessage: 'Group event' }),

  // NIP-54
  818: defineMessage({ id: 'kindLabels.k818', defaultMessage: 'Merge request' }),

  // NIP-88 Poll
  1018: defineMessage({ id: 'kindLabels.k1018', defaultMessage: 'Poll vote' }),
  // NIP-15 Marketplace
  1021: defineMessage({ id: 'kindLabels.k1021', defaultMessage: 'Bid' }),
  1022: defineMessage({ id: 'kindLabels.k1022', defaultMessage: 'Bid confirmation' }),
  // NIP-03
  1040: defineMessage({ id: 'kindLabels.k1040', defaultMessage: 'OpenTimestamps' }),
  // NIP-59
  1059: defineMessage({ id: 'kindLabels.k1059', defaultMessage: 'Gift wrap' }),
  // NIP-94
  1063: defineMessage({ id: 'kindLabels.k1063', defaultMessage: 'File metadata' }),
  // NIP-88
  1068: defineMessage({ id: 'kindLabels.k1068', defaultMessage: 'Poll' }),
  // NIP-22
  1111: defineMessage({ id: 'kindLabels.k1111', defaultMessage: 'Comment' }),
  // NIP-A0 Voice
  1222: defineMessage({ id: 'kindLabels.k1222', defaultMessage: 'Voice message' }),
  1244: defineMessage({ id: 'kindLabels.k1244', defaultMessage: 'Voice message comment' }),
  // NIP-53 Live
  1311: defineMessage({ id: 'kindLabels.k1311', defaultMessage: 'Live chat message' }),
  // NIP-C0
  1337: defineMessage({ id: 'kindLabels.k1337', defaultMessage: 'Code snippet' }),
  // NIP-34 Git
  1617: defineMessage({ id: 'kindLabels.k1617', defaultMessage: 'Patch' }),
  1618: defineMessage({ id: 'kindLabels.k1618', defaultMessage: 'Pull request' }),
  1619: defineMessage({ id: 'kindLabels.k1619', defaultMessage: 'Pull request update' }),
  1621: defineMessage({ id: 'kindLabels.k1621', defaultMessage: 'Issue' }),
  1622: defineMessage({ id: 'kindLabels.k1622', defaultMessage: 'Git reply' }),
  1630: defineMessage({ id: 'kindLabels.k1630', defaultMessage: 'Git status (open)' }),
  1631: defineMessage({ id: 'kindLabels.k1631', defaultMessage: 'Git status (applied)' }),
  1632: defineMessage({ id: 'kindLabels.k1632', defaultMessage: 'Git status (closed)' }),
  1633: defineMessage({ id: 'kindLabels.k1633', defaultMessage: 'Git status (draft)' }),
  // Nostrocket
  1971: defineMessage({ id: 'kindLabels.k1971', defaultMessage: 'Problem tracker' }),
  // NIP-56
  1984: defineMessage({ id: 'kindLabels.k1984', defaultMessage: 'Report' }),
  // NIP-32
  1985: defineMessage({ id: 'kindLabels.k1985', defaultMessage: 'Label' }),
  // Relay reviews
  1986: defineMessage({ id: 'kindLabels.k1986', defaultMessage: 'Relay review' }),
  // AI embeddings
  1987: defineMessage({ id: 'kindLabels.k1987', defaultMessage: 'AI embeddings' }),
  // NIP-35 Torrents
  2003: defineMessage({ id: 'kindLabels.k2003', defaultMessage: 'Torrent' }),
  2004: defineMessage({ id: 'kindLabels.k2004', defaultMessage: 'Torrent comment' }),
  // Coinjoin
  2022: defineMessage({ id: 'kindLabels.k2022', defaultMessage: 'Coinjoin pool' }),

  // NIP-TR tarot reading
  2256: defineMessage({ id: 'kindLabels.k2256', defaultMessage: 'Tarot reading' }),

  // Ditto custom kinds
  2473: defineMessage({ id: 'kindLabels.k2473', defaultMessage: 'Bird detection' }),

  // NIP-82 (software releases)
  3063: defineMessage({ id: 'kindLabels.k3063', defaultMessage: 'Software asset' }),

  // Ditto custom kinds
  3367: defineMessage({ id: 'kindLabels.k3367', defaultMessage: 'Color moment' }),

  // NIP-72
  4550: defineMessage({ id: 'kindLabels.k4550', defaultMessage: 'Community post approval' }),

  // NIP-90 DVM (ranges)
  5000: defineMessage({ id: 'kindLabels.k5000', defaultMessage: 'Job request' }),
  6000: defineMessage({ id: 'kindLabels.k6000', defaultMessage: 'Job result' }),
  7000: defineMessage({ id: 'kindLabels.k7000', defaultMessage: 'Job feedback' }),

  // NIP-60 Cashu
  7374: defineMessage({ id: 'kindLabels.k7374', defaultMessage: 'Reserved Cashu wallet tokens' }),
  7375: defineMessage({ id: 'kindLabels.k7375', defaultMessage: 'Cashu wallet tokens' }),
  7376: defineMessage({ id: 'kindLabels.k7376', defaultMessage: 'Cashu wallet history' }),

  // Geocaching
  7516: defineMessage({ id: 'kindLabels.k7516', defaultMessage: 'Found log' }),
  7517: defineMessage({ id: 'kindLabels.k7517', defaultMessage: 'Geocache proof of find' }),

  // Ditto quizzes
  7849: defineMessage({ id: 'kindLabels.k7849', defaultMessage: 'Quiz result' }),

  // NIP-43
  8000: defineMessage({ id: 'kindLabels.k8000', defaultMessage: 'Add user' }),
  8001: defineMessage({ id: 'kindLabels.k8001', defaultMessage: 'Remove user' }),

  // Ditto letters
  8211: defineMessage({ id: 'kindLabels.k8211', defaultMessage: 'Letter' }),

  // NIP-29 Group control (range)
  9000: defineMessage({ id: 'kindLabels.k9000', defaultMessage: 'Group control event' }),

  // NIP-75
  9041: defineMessage({ id: 'kindLabels.k9041', defaultMessage: 'Zap goal' }),
  // NIP-61
  9321: defineMessage({ id: 'kindLabels.k9321', defaultMessage: 'Nutzap' }),
  // Tidal
  9467: defineMessage({ id: 'kindLabels.k9467', defaultMessage: 'Tidal login' }),
  // NIP-57 Zaps
  9734: defineMessage({ id: 'kindLabels.k9734', defaultMessage: 'Zap request' }),
  9735: defineMessage({ id: 'kindLabels.k9735', defaultMessage: 'Zap' }),
  // On-chain zap — labeled as plain "Zap" so the UI doesn't single it out from
  // Lightning zaps. The two rails intentionally look the same in feeds and
  // detail headers; the difference is mechanical, not social.
  8333: defineMessage({ id: 'kindLabels.k8333', defaultMessage: 'Zap' }),
  // NIP-84
  9802: defineMessage({ id: 'kindLabels.k9802', defaultMessage: 'Highlight' }),

  // ---- Replaceable events (10000+) ----

  // NIP-51 Lists
  10000: defineMessage({ id: 'kindLabels.k10000', defaultMessage: 'Mute list' }),
  10001: defineMessage({ id: 'kindLabels.k10001', defaultMessage: 'Pin list' }),
  // NIP-65
  10002: defineMessage({ id: 'kindLabels.k10002', defaultMessage: 'Relay list' }),
  // NIP-51
  10003: defineMessage({ id: 'kindLabels.k10003', defaultMessage: 'Bookmark list' }),
  10004: defineMessage({ id: 'kindLabels.k10004', defaultMessage: 'Communities list' }),
  10005: defineMessage({ id: 'kindLabels.k10005', defaultMessage: 'Public chats list' }),
  10006: defineMessage({ id: 'kindLabels.k10006', defaultMessage: 'Blocked relays list' }),
  10007: defineMessage({ id: 'kindLabels.k10007', defaultMessage: 'Search relays list' }),
  // NIP-58
  10008: defineMessage({ id: 'kindLabels.k10008', defaultMessage: 'Profile badges' }),
  // NIP-29
  10009: defineMessage({ id: 'kindLabels.k10009', defaultMessage: 'User groups' }),
  // NIP-39
  10011: defineMessage({ id: 'kindLabels.k10011', defaultMessage: 'Linked accounts' }),
  // NIP-51
  10012: defineMessage({ id: 'kindLabels.k10012', defaultMessage: 'Favorite relays list' }),
  // NIP-37
  10013: defineMessage({ id: 'kindLabels.k10013', defaultMessage: 'Private event relay list' }),
  // NIP-51
  10015: defineMessage({ id: 'kindLabels.k10015', defaultMessage: 'Interests list' }),
  // NIP-61
  10019: defineMessage({ id: 'kindLabels.k10019', defaultMessage: 'Nutzap mint recommendation' }),
  // NIP-51
  10020: defineMessage({ id: 'kindLabels.k10020', defaultMessage: 'Media follows' }),
  10030: defineMessage({ id: 'kindLabels.k10030', defaultMessage: 'Emoji list' }),
  // NIP-17
  10050: defineMessage({ id: 'kindLabels.k10050', defaultMessage: 'DM relay list' }),
  // Marmot
  10051: defineMessage({ id: 'kindLabels.k10051', defaultMessage: 'KeyPackage relays list' }),
  // Blossom
  10063: defineMessage({ id: 'kindLabels.k10063', defaultMessage: 'Blossom server list' }),
  // NIP-96 (deprecated)
  10096: defineMessage({ id: 'kindLabels.k10096', defaultMessage: 'File storage server list' }),
  // NIP-66
  10166: defineMessage({ id: 'kindLabels.k10166', defaultMessage: 'Relay monitor announcement' }),
  // NIP-53
  10312: defineMessage({ id: 'kindLabels.k10312', defaultMessage: 'Room presence' }),
  // Nostr Epoxy
  10377: defineMessage({ id: 'kindLabels.k10377', defaultMessage: 'Proxy announcement' }),
  11111: defineMessage({ id: 'kindLabels.k11111', defaultMessage: 'Transport method announcement' }),
  // Bookstr
  10073: defineMessage({ id: 'kindLabels.k10073', defaultMessage: 'Read books' }),
  10074: defineMessage({ id: 'kindLabels.k10074', defaultMessage: 'Currently reading' }),
  10075: defineMessage({ id: 'kindLabels.k10075', defaultMessage: 'To be read' }),
  // Blobbi
  11125: defineMessage({ id: 'kindLabels.k11125', defaultMessage: 'Blobbonaut profile' }),

  // Ditto custom kinds
  12473: defineMessage({ id: 'kindLabels.k12473', defaultMessage: 'Birdex' }),

  // NIP-47 Wallet
  13194: defineMessage({ id: 'kindLabels.k13194', defaultMessage: 'Wallet info' }),
  // NIP-43
  13534: defineMessage({ id: 'kindLabels.k13534', defaultMessage: 'Membership lists' }),
  // Corny Chat
  14388: defineMessage({ id: 'kindLabels.k14388', defaultMessage: 'User sound effect lists' }),

  // Blobbi
  14919: defineMessage({ id: 'kindLabels.k14919', defaultMessage: 'Blobbi interaction' }),
  14920: defineMessage({ id: 'kindLabels.k14920', defaultMessage: 'Blobbi breeding' }),
  14921: defineMessage({ id: 'kindLabels.k14921', defaultMessage: 'Blobbi record' }),

  // NIP-5A nsites
  5128: defineMessage({ id: 'kindLabels.k5128', defaultMessage: 'Nsite snapshot' }),
  15128: defineMessage({ id: 'kindLabels.k15128', defaultMessage: 'Nsite' }),
  // Ditto custom — Love List ("1·LOVE" on a phone keypad)
  15683: defineMessage({ id: 'kindLabels.k15683', defaultMessage: 'Love list' }),
  // Ditto custom — Top 8 ("1·TOP8" on a phone keypad)
  18678: defineMessage({ id: 'kindLabels.k18678', defaultMessage: 'Top 8' }),
  // Ditto custom — Posting streak ("1·FIRE" on a phone keypad)
  13473: defineMessage({ id: 'kindLabels.k13473', defaultMessage: 'Posting streak' }),
  // Weather station
  16158: defineMessage({ id: 'kindLabels.k16158', defaultMessage: 'Weather station' }),
  // Theme
  16767: defineMessage({ id: 'kindLabels.k16767', defaultMessage: 'Active profile theme' }),
  // Profile tabs
  16769: defineMessage({ id: 'kindLabels.k16769', defaultMessage: 'Profile tabs' }),
  // NIP-60
  17375: defineMessage({ id: 'kindLabels.k17375', defaultMessage: 'Cashu wallet event' }),
  // Lightning.Pub
  21000: defineMessage({ id: 'kindLabels.k21000', defaultMessage: 'Lightning Pub RPC' }),
  // NIP-42
  22242: defineMessage({ id: 'kindLabels.k22242', defaultMessage: 'Client authentication' }),
  // NIP-47
  23194: defineMessage({ id: 'kindLabels.k23194', defaultMessage: 'Wallet request' }),
  23195: defineMessage({ id: 'kindLabels.k23195', defaultMessage: 'Wallet response' }),
  // NIP-46
  24133: defineMessage({ id: 'kindLabels.k24133', defaultMessage: 'Nostr Connect' }),
  // Blossom
  24242: defineMessage({ id: 'kindLabels.k24242', defaultMessage: 'Blob stored on mediaserver' }),
  // NIP-98
  27235: defineMessage({ id: 'kindLabels.k27235', defaultMessage: 'HTTP auth' }),
  // NIP-43
  28934: defineMessage({ id: 'kindLabels.k28934', defaultMessage: 'Join request' }),
  28935: defineMessage({ id: 'kindLabels.k28935', defaultMessage: 'Invite request' }),
  28936: defineMessage({ id: 'kindLabels.k28936', defaultMessage: 'Leave request' }),

  // Webxdc
  4932: defineMessage({ id: 'kindLabels.k4932', defaultMessage: 'Webxdc sync' }),
  20932: defineMessage({ id: 'kindLabels.k20932', defaultMessage: 'Webxdc sync' }),

  // ---- Addressable events (30000+) ----

  // NIP-51 Sets
  30000: defineMessage({ id: 'kindLabels.k30000', defaultMessage: 'Follow set' }),
  30001: defineMessage({ id: 'kindLabels.k30001', defaultMessage: 'Generic list' }),
  30002: defineMessage({ id: 'kindLabels.k30002', defaultMessage: 'Relay set' }),
  30003: defineMessage({ id: 'kindLabels.k30003', defaultMessage: 'Bookmark set' }),
  30004: defineMessage({ id: 'kindLabels.k30004', defaultMessage: 'Curation set' }),
  30005: defineMessage({ id: 'kindLabels.k30005', defaultMessage: 'Video set' }),
  30006: defineMessage({ id: 'kindLabels.k30006', defaultMessage: 'Picture set' }),
  30007: defineMessage({ id: 'kindLabels.k30007', defaultMessage: 'Kind mute set' }),
  // NIP-58
  30008: defineMessage({ id: 'kindLabels.k30008', defaultMessage: 'Badge set' }),
  30009: defineMessage({ id: 'kindLabels.k30009', defaultMessage: 'Badge definition' }),
  // NIP-51
  30015: defineMessage({ id: 'kindLabels.k30015', defaultMessage: 'Interest set' }),
  // NIP-15 Marketplace
  30017: defineMessage({ id: 'kindLabels.k30017', defaultMessage: 'Stall' }),
  30018: defineMessage({ id: 'kindLabels.k30018', defaultMessage: 'Product' }),
  30019: defineMessage({ id: 'kindLabels.k30019', defaultMessage: 'Marketplace UI/UX' }),
  30020: defineMessage({ id: 'kindLabels.k30020', defaultMessage: 'Auction product' }),
  // NIP-23
  30023: defineMessage({ id: 'kindLabels.k30023', defaultMessage: 'Article' }),
  30024: defineMessage({ id: 'kindLabels.k30024', defaultMessage: 'Draft long-form content' }),
  // NIP-30
  30030: defineMessage({ id: 'kindLabels.k30030', defaultMessage: 'Emoji set' }),
  // NKBIP-01
  30040: defineMessage({ id: 'kindLabels.k30040', defaultMessage: 'Curated publication index' }),
  30041: defineMessage({ id: 'kindLabels.k30041', defaultMessage: 'Curated publication content' }),
  // NIP-82 (software releases)
  30063: defineMessage({ id: 'kindLabels.k30063', defaultMessage: 'Software release' }),
  // NIP-78
  30078: defineMessage({ id: 'kindLabels.k30078', defaultMessage: 'App settings' }),
  // NIP-66
  30166: defineMessage({ id: 'kindLabels.k30166', defaultMessage: 'Relay discovery' }),
  // NIP-51
  30267: defineMessage({ id: 'kindLabels.k30267', defaultMessage: 'App curation set' }),
  // NIP-53
  30311: defineMessage({ id: 'kindLabels.k30311', defaultMessage: 'Live event' }),
  30312: defineMessage({ id: 'kindLabels.k30312', defaultMessage: 'Interactive room' }),
  30313: defineMessage({ id: 'kindLabels.k30313', defaultMessage: 'Conference event' }),
  // NIP-38
  30315: defineMessage({ id: 'kindLabels.k30315', defaultMessage: 'User status' }),
  // NIP-85
  30382: defineMessage({ id: 'kindLabels.k30382', defaultMessage: 'User trusted assertion' }),
  30383: defineMessage({ id: 'kindLabels.k30383', defaultMessage: 'Event trusted assertion' }),
  30384: defineMessage({ id: 'kindLabels.k30384', defaultMessage: 'Addressable event trusted assertion' }),
  // Corny Chat
  30388: defineMessage({ id: 'kindLabels.k30388', defaultMessage: 'Slide set' }),
  // NIP-99
  30402: defineMessage({ id: 'kindLabels.k30402', defaultMessage: 'Classified listing' }),
  30403: defineMessage({ id: 'kindLabels.k30403', defaultMessage: 'Draft classified listing' }),
  // Podcasts
  30054: defineMessage({ id: 'kindLabels.k30054', defaultMessage: 'Podcast episode' }),
  30055: defineMessage({ id: 'kindLabels.k30055', defaultMessage: 'Podcast trailer' }),
  // NIP-34 Git
  30617: defineMessage({ id: 'kindLabels.k30617', defaultMessage: 'Repository' }),
  30618: defineMessage({ id: 'kindLabels.k30618', defaultMessage: 'Repository state' }),
  // Ditto custom kinds
  30621: defineMessage({ id: 'kindLabels.k30621', defaultMessage: 'Constellation' }),
  // NIP-54 Wiki
  30818: defineMessage({ id: 'kindLabels.k30818', defaultMessage: 'Wiki article' }),
  30819: defineMessage({ id: 'kindLabels.k30819', defaultMessage: 'Wiki redirect' }),
  // Custom NIP
  30817: defineMessage({ id: 'kindLabels.k30817', defaultMessage: 'Custom NIP' }),
  // NIP-37
  31234: defineMessage({ id: 'kindLabels.k31234', defaultMessage: 'Draft event' }),
  // Corny Chat
  31388: defineMessage({ id: 'kindLabels.k31388', defaultMessage: 'Link set' }),
  // Attestations
  31871: defineMessage({ id: 'kindLabels.k31871', defaultMessage: 'Attestation' }),
  // Custom Feeds
  31890: defineMessage({ id: 'kindLabels.k31890', defaultMessage: 'Feed' }),
  // NIP-52 Calendar
  31922: defineMessage({ id: 'kindLabels.k31922', defaultMessage: 'Date calendar event' }),
  31923: defineMessage({ id: 'kindLabels.k31923', defaultMessage: 'Time calendar event' }),
  31924: defineMessage({ id: 'kindLabels.k31924', defaultMessage: 'Calendar' }),
  31925: defineMessage({ id: 'kindLabels.k31925', defaultMessage: 'Calendar event RSVP' }),
  // NIP-89
  31989: defineMessage({ id: 'kindLabels.k31989', defaultMessage: 'App recommendation' }),
  31990: defineMessage({ id: 'kindLabels.k31990', defaultMessage: 'App' }),
  // Bookstr
  31985: defineMessage({ id: 'kindLabels.k31985', defaultMessage: 'Book review' }),
  // Blobbi
  31124: defineMessage({ id: 'kindLabels.k31124', defaultMessage: 'Blobbi' }),
  // NIP-82 (software apps)
  32267: defineMessage({ id: 'kindLabels.k32267', defaultMessage: 'Software app' }),
  // Corny Chat
  32388: defineMessage({ id: 'kindLabels.k32388', defaultMessage: 'User room favorites' }),
  33331: defineMessage({ id: 'kindLabels.k33331', defaultMessage: '3D object' }),

  33388: defineMessage({ id: 'kindLabels.k33388', defaultMessage: 'High scores' }),
  // Fundraisers
  33863: defineMessage({ id: 'kindLabels.k33863', defaultMessage: 'Fundraiser' }),
  // Publications (PressStr)
  33953: defineMessage({ id: 'kindLabels.k33953', defaultMessage: 'Ebook' }),
  34609: defineMessage({ id: 'kindLabels.k34609', defaultMessage: 'Magazine' }),
  39731: defineMessage({ id: 'kindLabels.k39731', defaultMessage: 'Magazine issue' }),
  // NIP-71
  34235: defineMessage({ id: 'kindLabels.k34235', defaultMessage: 'Addressable video' }),
  34236: defineMessage({ id: 'kindLabels.k34236', defaultMessage: 'Addressable short video' }),
  // Corny Chat
  34388: defineMessage({ id: 'kindLabels.k34388', defaultMessage: 'Sound effects' }),
  // Music
  34139: defineMessage({ id: 'kindLabels.k34139', defaultMessage: 'Music playlist' }),
  // NIP-72
  34550: defineMessage({ id: 'kindLabels.k34550', defaultMessage: 'Community definition' }),
  // NIP-5A
  34128: defineMessage({ id: 'kindLabels.k34128', defaultMessage: 'Nsite (legacy)' }),
  35128: defineMessage({ id: 'kindLabels.k35128', defaultMessage: 'Nsite' }),
  // Theme
  36767: defineMessage({ id: 'kindLabels.k36767', defaultMessage: 'Theme definition' }),
  // Music
  36787: defineMessage({ id: 'kindLabels.k36787', defaultMessage: 'Music track' }),
  // Ditto custom
  37381: defineMessage({ id: 'kindLabels.k37381', defaultMessage: 'Magic deck' }),
  37516: defineMessage({ id: 'kindLabels.k37516', defaultMessage: 'Geocache listing' }),
  37849: defineMessage({ id: 'kindLabels.k37849', defaultMessage: 'Quiz' }),
  // NIP-87
  38172: defineMessage({ id: 'kindLabels.k38172', defaultMessage: 'Cashu mint announcement' }),
  38173: defineMessage({ id: 'kindLabels.k38173', defaultMessage: 'Fedimint announcement' }),
  // NIP-69
  38383: defineMessage({ id: 'kindLabels.k38383', defaultMessage: 'Peer-to-peer order' }),
  // NIP-51
  39089: defineMessage({ id: 'kindLabels.k39089', defaultMessage: 'Follow pack' }),
  39092: defineMessage({ id: 'kindLabels.k39092', defaultMessage: 'Media follow pack' }),
  // NIP-B0
  39701: defineMessage({ id: 'kindLabels.k39701', defaultMessage: 'Web bookmark' }),
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
export function getKindLabel(intl: IntlShape, kind: number, fallback?: string): string {
  const label = KIND_LABELS[kind];
  if (label) return intl.formatMessage(label);
  return fallback ?? intl.formatMessage(
    { id: 'kindLabels.unknown', defaultMessage: 'Kind {kind}' },
    { kind: String(kind) },
  );
}
