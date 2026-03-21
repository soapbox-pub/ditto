import type { BadgeTier } from '@/lib/badgeUtils';

export type AchievementCategory =
  | 'social'
  | 'profile'
  | 'content'
  | 'community'
  | 'lightning'
  | 'power-user'
  | 'treasures'
  | 'ditto-specials';

export interface AchievementDef {
  /** The d-tag identifier for the badge definition. */
  dTag: string;
  /** Display name. */
  name: string;
  /** How to earn this achievement. */
  description: string;
  /** Category grouping. */
  category: AchievementCategory;
  /** Optional tier (bronze/silver/gold/diamond). */
  tier?: BadgeTier;
  /** Target count to earn. */
  target: number;
  /** Which Nostr event kind to count for progress tracking. */
  verificationKind?: number;
}

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string> = {
  social: 'Social Milestones',
  profile: 'Profile Completeness',
  content: 'Content Creator',
  community: 'Community & Social',
  lightning: 'Lightning & Economy',
  'power-user': 'Power User',
  treasures: 'Treasures & Exploration',
  'ditto-specials': 'Ditto Specials',
};

export const ACHIEVEMENT_CATALOG: AchievementDef[] = [
  // ── Social Milestones ──
  { dTag: 'first-post', name: 'First Post', description: 'You said something! Your first note on Nostr.', category: 'social', target: 1, verificationKind: 1 },
  { dTag: 'chatterbox-bronze', name: 'Chatterbox', description: '10 notes and counting.', category: 'social', tier: 'bronze', target: 10, verificationKind: 1 },
  { dTag: 'chatterbox-silver', name: 'Chatterbox', description: "50 notes. You've got things to say.", category: 'social', tier: 'silver', target: 50, verificationKind: 1 },
  { dTag: 'chatterbox-gold', name: 'Chatterbox', description: '100 notes! A true voice of Nostr.', category: 'social', tier: 'gold', target: 100, verificationKind: 1 },
  { dTag: 'chatterbox-diamond', name: 'Chatterbox', description: '1,000 notes. Legendary poster.', category: 'social', tier: 'diamond', target: 1000, verificationKind: 1 },
  { dTag: 'thread-starter', name: 'Thread Starter', description: 'You wove your first thread.', category: 'social', target: 1, verificationKind: 11 },
  { dTag: 'first-repost', name: 'First Repost', description: 'Sharing is caring.', category: 'social', target: 1, verificationKind: 6 },
  { dTag: 'signal-boost-bronze', name: 'Signal Boost', description: 'Amplifying the signal.', category: 'social', tier: 'bronze', target: 25, verificationKind: 6 },
  { dTag: 'signal-boost-gold', name: 'Signal Boost', description: 'The Nostr megaphone.', category: 'social', tier: 'gold', target: 100, verificationKind: 6 },
  { dTag: 'first-reaction', name: 'First Reaction', description: 'You liked something!', category: 'social', target: 1, verificationKind: 7 },
  { dTag: 'reaction-machine-bronze', name: 'Reaction Machine', description: 'Generous with the hearts.', category: 'social', tier: 'bronze', target: 100, verificationKind: 7 },
  { dTag: 'reaction-machine-gold', name: 'Reaction Machine', description: 'The ultimate hype person.', category: 'social', tier: 'gold', target: 1000, verificationKind: 7 },

  // ── Profile Completeness ──
  { dTag: 'identity-claimed', name: 'Identity Claimed', description: 'You have a name!', category: 'profile', target: 1, verificationKind: 0 },
  { dTag: 'face-reveal', name: 'Face Reveal', description: 'The world can see you now.', category: 'profile', target: 1, verificationKind: 0 },
  { dTag: 'banner-day', name: 'Banner Day', description: 'Your profile has a skyline.', category: 'profile', target: 1, verificationKind: 0 },
  { dTag: 'nip05-verified', name: 'Verified', description: 'Your identity is verified on the web.', category: 'profile', target: 1, verificationKind: 0 },
  { dTag: 'lightning-ready', name: 'Lightning Ready', description: 'Ready to receive sats.', category: 'profile', target: 1, verificationKind: 0 },
  { dTag: 'full-profile', name: 'Full Profile', description: 'Profile 100% complete. Looking sharp.', category: 'profile', target: 1, verificationKind: 0 },

  // ── Content Creator ──
  { dTag: 'wordsmith', name: 'Wordsmith', description: 'Your first article. The pen is mightier.', category: 'content', target: 1, verificationKind: 30023 },
  { dTag: 'prolific-author-bronze', name: 'Prolific Author', description: 'Five articles deep.', category: 'content', tier: 'bronze', target: 5, verificationKind: 30023 },
  { dTag: 'prolific-author-gold', name: 'Prolific Author', description: 'A true Nostr journalist.', category: 'content', tier: 'gold', target: 25, verificationKind: 30023 },
  { dTag: 'shutterbug', name: 'Shutterbug', description: 'Say cheese!', category: 'content', target: 1, verificationKind: 20 },
  { dTag: 'photographer-bronze', name: 'Photographer', description: 'Building a gallery.', category: 'content', tier: 'bronze', target: 10, verificationKind: 20 },
  { dTag: 'photographer-gold', name: 'Photographer', description: 'Master of the lens.', category: 'content', tier: 'gold', target: 100, verificationKind: 20 },
  { dTag: 'director', name: 'Director', description: 'Lights, camera, action!', category: 'content', target: 1, verificationKind: 21 },
  { dTag: 'film-buff-bronze', name: 'Film Buff', description: "You're a creator now.", category: 'content', tier: 'bronze', target: 10, verificationKind: 21 },
  { dTag: 'broadcaster', name: 'Broadcaster', description: 'Going live!', category: 'content', target: 1, verificationKind: 30311 },
  { dTag: 'pollster', name: 'Pollster', description: 'Democracy in action.', category: 'content', target: 1, verificationKind: 1068 },
  { dTag: 'voice-note', name: 'Voice Note', description: 'Your voice was heard.', category: 'content', target: 1, verificationKind: 1222 },

  // ── Community & Social ──
  { dTag: 'social-butterfly-bronze', name: 'Social Butterfly', description: 'Expanding your circle.', category: 'community', tier: 'bronze', target: 10, verificationKind: 3 },
  { dTag: 'social-butterfly-silver', name: 'Social Butterfly', description: 'Quite the social network.', category: 'community', tier: 'silver', target: 50, verificationKind: 3 },
  { dTag: 'social-butterfly-gold', name: 'Social Butterfly', description: 'You know everyone.', category: 'community', tier: 'gold', target: 200, verificationKind: 3 },
  { dTag: 'commentator', name: 'Commentator', description: 'Joining the conversation.', category: 'community', target: 1, verificationKind: 1111 },
  { dTag: 'dm-pioneer', name: 'DM Pioneer', description: 'Sliding into DMs, privately.', category: 'community', target: 1, verificationKind: 14 },

  // ── Lightning & Economy ──
  { dTag: 'first-zap-sent', name: 'First Zap Sent', description: 'Your first lightning bolt!', category: 'lightning', target: 1, verificationKind: 9734 },
  { dTag: 'generous-tipper-bronze', name: 'Generous Tipper', description: 'Spreading the sats around.', category: 'lightning', tier: 'bronze', target: 10, verificationKind: 9734 },
  { dTag: 'generous-tipper-gold', name: 'Generous Tipper', description: 'A philanthropist of the protocol.', category: 'lightning', tier: 'gold', target: 50, verificationKind: 9734 },
  { dTag: 'first-zap-received', name: 'First Zap Received', description: 'Sats incoming!', category: 'lightning', target: 1, verificationKind: 9735 },
  { dTag: 'zap-magnet-bronze', name: 'Zap Magnet', description: 'The sats keep coming.', category: 'lightning', tier: 'bronze', target: 10, verificationKind: 9735 },
  { dTag: 'zap-magnet-gold', name: 'Zap Magnet', description: 'Lightning rod.', category: 'lightning', tier: 'gold', target: 100, verificationKind: 9735 },
  { dTag: 'nwc-connected', name: 'NWC Connected', description: 'Wallet linked and ready.', category: 'lightning', target: 1 },
  { dTag: 'first-shop-purchase', name: 'Shopper', description: 'First purchase from the Badge Shop!', category: 'lightning', target: 1 },

  // ── Power User ──
  { dTag: 'relay-master', name: 'Relay Master', description: 'You run your own relay infrastructure.', category: 'power-user', target: 1, verificationKind: 10002 },
  { dTag: 'bookworm', name: 'Bookworm', description: 'Curating the best of Nostr.', category: 'power-user', target: 5, verificationKind: 10003 },
  { dTag: 'emoji-artist', name: 'Emoji Artist', description: 'Express yourself in pixels.', category: 'power-user', target: 1, verificationKind: 30030 },
  { dTag: 'theme-designer', name: 'Theme Designer', description: 'Making Ditto beautiful.', category: 'power-user', target: 1, verificationKind: 36767 },
  { dTag: 'badge-creator', name: 'Badge Creator', description: "Now you're a badge maker!", category: 'power-user', target: 1, verificationKind: 30009 },
  { dTag: 'badge-philanthropist', name: 'Badge Philanthropist', description: 'Spreading recognition everywhere.', category: 'power-user', target: 10, verificationKind: 8 },

  // ── Treasures & Exploration ──
  { dTag: 'treasure-hunter', name: 'Treasure Hunter', description: 'X marks the spot!', category: 'treasures', target: 1, verificationKind: 7516 },
  { dTag: 'explorer-bronze', name: 'Explorer', description: 'The adventure begins.', category: 'treasures', tier: 'bronze', target: 5, verificationKind: 7516 },
  { dTag: 'explorer-silver', name: 'Explorer', description: 'A seasoned explorer.', category: 'treasures', tier: 'silver', target: 25, verificationKind: 7516 },
  { dTag: 'explorer-gold', name: 'Explorer', description: 'Legend of the trail.', category: 'treasures', tier: 'gold', target: 100, verificationKind: 7516 },
  { dTag: 'treasure-hider', name: 'Treasure Hider', description: "You've hidden something for the world to find.", category: 'treasures', target: 1, verificationKind: 37516 },
  { dTag: 'cartographer-bronze', name: 'Cartographer', description: 'Mapping the Nostr world.', category: 'treasures', tier: 'bronze', target: 5, verificationKind: 37516 },
  { dTag: 'cartographer-gold', name: 'Cartographer', description: 'Master cartographer.', category: 'treasures', tier: 'gold', target: 25, verificationKind: 37516 },

  // ── Ditto Specials ──
  { dTag: 'welcome-to-ditto', name: 'Welcome to Ditto', description: "You've arrived. Welcome home.", category: 'ditto-specials', target: 1 },
  { dTag: 'vibe-check', name: 'Vibe Check', description: 'You set the vibe.', category: 'ditto-specials', target: 1, verificationKind: 36767 },
  { dTag: 'badge-collector-bronze', name: 'Badge Collector', description: 'Starting your collection.', category: 'ditto-specials', tier: 'bronze', target: 5, verificationKind: 30008 },
  { dTag: 'badge-collector-silver', name: 'Badge Collector', description: 'Quite the collection.', category: 'ditto-specials', tier: 'silver', target: 15, verificationKind: 30008 },
  { dTag: 'badge-collector-gold', name: 'Badge Collector', description: 'Badge hoarder extraordinaire.', category: 'ditto-specials', tier: 'gold', target: 50, verificationKind: 30008 },
  { dTag: 'webxdc-gamer', name: 'Webxdc Gamer', description: 'Gaming on the protocol.', category: 'ditto-specials', target: 1 },
  { dTag: 'ai-conversationalist', name: 'AI Conversationalist', description: 'Chatting with the machines.', category: 'ditto-specials', target: 1 },
  { dTag: 'streaker-bronze', name: 'Streaker', description: 'A week of consistency!', category: 'ditto-specials', tier: 'bronze', target: 7 },
  { dTag: 'streaker-gold', name: 'Streaker', description: 'An entire month. Unstoppable.', category: 'ditto-specials', tier: 'gold', target: 30 },
  { dTag: 'book-club', name: 'Book Club', description: 'A literary critic of Nostr.', category: 'ditto-specials', target: 1 },
  { dTag: 'music-lover', name: 'Music Lover', description: 'Sharing the soundtrack of your life.', category: 'ditto-specials', target: 1, verificationKind: 36787 },
  { dTag: 'deck-builder', name: 'Deck Builder', description: 'Building your hand.', category: 'ditto-specials', target: 1, verificationKind: 37381 },
  { dTag: 'color-moment', name: 'Color Moment', description: 'Painting with data.', category: 'ditto-specials', target: 1, verificationKind: 3367 },
];

/** Get achievements grouped by category in the order of ACHIEVEMENT_CATEGORY_LABELS. */
export function getAchievementsByCategory(): Map<AchievementCategory, AchievementDef[]> {
  const map = new Map<AchievementCategory, AchievementDef[]>();
  for (const key of Object.keys(ACHIEVEMENT_CATEGORY_LABELS) as AchievementCategory[]) {
    map.set(key, ACHIEVEMENT_CATALOG.filter((a) => a.category === key));
  }
  return map;
}
