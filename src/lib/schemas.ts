import { z } from 'zod';

import type { Theme, ContentWarningPolicy } from '@/contexts/AppContext';
import type { CoreThemeColors, ThemeConfig, ThemesConfig } from '@/themes';

// ─── Theme Schemas ───────────────────────────────────────────────────

/** Zod schema for Theme validation */
export const ThemeSchema = z.enum(['dark', 'light', 'system', 'custom']) satisfies z.ZodType<Theme>;


/** HSL value string like "258 70% 55%" */
const HslValue = z.string().regex(/^\d/);

/** Zod schema for CoreThemeColors (the 3 core colors) */
export const CoreThemeColorsSchema = z.object({
  background: HslValue,
  text: HslValue,
  primary: HslValue,
}) satisfies z.ZodType<CoreThemeColors>;

/**
 * Legacy schema that accepts the old 19-token ThemeTokens format.
 * Used for backward compatibility when reading old configs/events.
 * Extracts core colors from legacy format.
 */
export const LegacyThemeTokensSchema = z.object({
  background: HslValue,
  foreground: HslValue,
  primary: HslValue,
}).passthrough();

/**
 * Legacy schema that accepts the old 4-color format (with secondary).
 * Strips the secondary field and normalizes to CoreThemeColors.
 */
export const LegacyFourColorSchema = z.object({
  background: HslValue,
  text: HslValue,
  primary: HslValue,
  secondary: HslValue,
}).transform(({ background, text, primary }): CoreThemeColors => ({
  background,
  text,
  primary,
}));

/**
 * Schema that accepts CoreThemeColors, legacy 4-color, or legacy ThemeTokens,
 * always normalizing to CoreThemeColors.
 */
export const ThemeColorsCompatSchema = z.union([
  CoreThemeColorsSchema,
  LegacyFourColorSchema,
  LegacyThemeTokensSchema.transform((legacy): CoreThemeColors => ({
    background: legacy.background,
    text: legacy.foreground,
    primary: legacy.primary,
  })),
]);

// ─── ThemeConfig Schemas ──────────────────────────────────────────────

/** Zod schema for ThemeFont */
export const ThemeFontSchema = z.object({
  family: z.string(),
  url: z.string().optional(),
});

/** Zod schema for ThemeBackground */
export const ThemeBackgroundSchema = z.object({
  url: z.string(),
  mode: z.enum(['cover', 'tile']).optional(),
  dimensions: z.string().optional(),
  mimeType: z.string().optional(),
  blurhash: z.string().optional(),
});

/** Zod schema for the full ThemeConfig */
export const ThemeConfigSchema = z.object({
  title: z.string().optional(),
  colors: CoreThemeColorsSchema,
  font: ThemeFontSchema.optional(),
  titleFont: ThemeFontSchema.optional(),
  background: ThemeBackgroundSchema.optional(),
});

/** Zod schema for ThemesConfig (light + dark theme configs) */
export const ThemesConfigSchema = z.object({
  light: z.lazy(() => ThemeConfigSchema),
  dark: z.lazy(() => ThemeConfigSchema),
}) satisfies z.ZodType<ThemesConfig>;

/**
 * Compat schema that accepts either the new ThemeConfig format or the old
 * bare CoreThemeColors format (and all legacy color variants), normalizing
 * to ThemeConfig.
 */
export const ThemeConfigCompatSchema = z.union([
  ThemeConfigSchema,
  // Bare CoreThemeColors (old format) → wrap in ThemeConfig
  ThemeColorsCompatSchema.transform((colors): ThemeConfig => ({ colors })),
]);

/** Zod schema for ContentWarningPolicy validation */
export const ContentWarningPolicySchema = z.enum(['blur', 'hide', 'show']) satisfies z.ZodType<ContentWarningPolicy>;

// ─── Feed & Relay Schemas ────────────────────────────────────────────

export const RelayMetadataSchema = z.object({
  relays: z.array(z.object({
    url: z.string().url(),
    read: z.boolean(),
    write: z.boolean(),
  })),
  updatedAt: z.number(),
});

/** Zod schema for BlossomServerMetadata (BUD-03 kind 10063 server list). */
export const BlossomServerMetadataSchema = z.object({
  servers: z.array(z.string().url()),
  updatedAt: z.number(),
});

/**
 * Zod schema for FeedSettings validation.
 * All fields use .optional() so data with missing keys
 * (from older encrypted settings) doesn't reject the whole object.
 * Uses looseObject to preserve extra keys from newer encrypted settings.
 * Missing fields get filled in by the defaultConfig merge downstream.
 */
export const FeedSettingsSchema = z.looseObject({
  feedIncludePosts: z.boolean().optional(),
  feedIncludeComments: z.boolean().optional(),
  feedIncludeReposts: z.boolean().optional(),
  feedIncludeGenericReposts: z.boolean().optional(),
  feedIncludeArticles: z.boolean().optional(),
  showArticles: z.boolean().optional(),
  showEvents: z.boolean().optional(),
  feedIncludeEvents: z.boolean().optional(),
  showVines: z.boolean().optional(),
  showPolls: z.boolean().optional(),
  showTreasures: z.boolean().optional(),
  showTreasureGeocaches: z.boolean().optional(),
  showTreasureFoundLogs: z.boolean().optional(),
  showColors: z.boolean().optional(),
  showPacks: z.boolean().optional(),
  showStreams: z.boolean().optional(),
  feedIncludeVines: z.boolean().optional(),
  feedIncludePolls: z.boolean().optional(),
  feedIncludeTreasureGeocaches: z.boolean().optional(),
  feedIncludeTreasureFoundLogs: z.boolean().optional(),
  feedIncludeColors: z.boolean().optional(),
  feedIncludePacks: z.boolean().optional(),
  feedIncludeStreams: z.boolean().optional(),
  showDecks: z.boolean().optional(),
  feedIncludeDecks: z.boolean().optional(),
  showWebxdc: z.boolean().optional(),
  feedIncludeWebxdc: z.boolean().optional(),
  showProfileThemes: z.boolean().optional(),
  feedIncludeProfileThemes: z.boolean().optional(),
  showThemeDefinitions: z.boolean().optional(),
  feedIncludeThemeDefinitions: z.boolean().optional(),
  showProfileThemeUpdates: z.boolean().optional(),
  feedIncludeProfileThemeUpdates: z.boolean().optional(),
  showCustomProfileThemes: z.boolean().optional(),
  feedIncludeVoiceMessages: z.boolean().optional(),
  showEmojiPacks: z.boolean().optional(),
  feedIncludeEmojiPacks: z.boolean().optional(),
  showCustomEmojis: z.boolean().optional(),
  showUserStatuses: z.boolean().optional(),
  showMusic: z.boolean().optional(),
  feedIncludeMusicTracks: z.boolean().optional(),
  feedIncludeMusicPlaylists: z.boolean().optional(),
  showPodcasts: z.boolean().optional(),
  feedIncludePodcastEpisodes: z.boolean().optional(),
  feedIncludePodcastTrailers: z.boolean().optional(),
  showDevelopment: z.boolean().optional(),
  feedIncludeDevelopment: z.boolean().optional(),
  feedIncludeBlobbi: z.boolean().optional(),
});

/** Minimal schema for a signed Nostr event (used inside SavedFeed). */
const NostrEventSchema = z.object({
  id: z.string(),
  pubkey: z.string(),
  created_at: z.number(),
  kind: z.number(),
  tags: z.array(z.array(z.string())),
  content: z.string(),
  sig: z.string(),
});

export const SavedFeedSchema = z.object({
  id: z.string(),
  label: z.string(),
  spell: NostrEventSchema,
  createdAt: z.number(),
});

// ─── AppConfigSchema ─────────────────────────────────────────────────

/**
 * Zod schema for the full AppConfig stored in localStorage.
 *
 * Uses ThemeConfigCompatSchema for the customTheme field so legacy
 * 19-token color objects still parse successfully.
 */
export const AppConfigSchema = z.object({
  appName: z.string().optional(),
  appId: z.string().optional(),
  homePage: z.string().optional(),
  clientName: z.string().optional(),
  /** NIP-19 naddr1 string for the kind 31990 handler event. */
  client: z.string().startsWith('naddr1').optional(),
  magicMouse: z.boolean().optional(),
  theme: ThemeSchema,
  customTheme: ThemeConfigCompatSchema.optional(),
  autoShareTheme: z.boolean(),
  themes: ThemesConfigSchema.optional(),
  relayMetadata: RelayMetadataSchema,
  useAppRelays: z.boolean(),
  feedSettings: FeedSettingsSchema,
  sidebarOrder: z.array(z.string()),
  nip85StatsPubkey: z.string().refine(
    (val) => val.length === 0 || (val.length === 64 && /^[0-9a-f]{64}$/i.test(val)),
    { message: 'Must be empty or a valid 64-character hex pubkey' }
  ),
  blossomServerMetadata: BlossomServerMetadataSchema,
  useAppBlossomServers: z.boolean(),
  faviconUrl: z.string(),
  linkPreviewUrl: z.string(),
  corsProxy: z.string(),
  contentWarningPolicy: ContentWarningPolicySchema,
  sentryDsn: z.string(),
  sentryEnabled: z.boolean(),
  plausibleDomain: z.string(),
  plausibleEndpoint: z.string(),
  savedFeeds: z.array(z.unknown()).transform((arr) =>
    arr.flatMap((item) => {
      if (typeof item !== 'object' || item === null) return [];
      if ((item as Record<string, unknown>).destination !== undefined) return [];
      const result = SavedFeedSchema.safeParse(item);
      return result.success ? [result.data] : [];
    })
  ).optional().default([]),
  imageQuality: z.enum(['compressed', 'original']),
  curatorPubkey: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
  sandboxDomain: z.string().optional(),
  sidebarWidgets: z.array(z.object({
    id: z.string(),
    height: z.number().optional(),
  })).optional(),
});

// ─── DittoConfigSchema (build-time ditto.json) ───────────────────────

/**
 * Schema for the build-time `ditto.json` configuration file.
 * Derived from AppConfigSchema with all fields made optional and strict
 * mode enabled so unknown keys are rejected.
 */
export const DittoConfigSchema = AppConfigSchema
  .partial()
  .strict();

/** Inferred type for the build-time configuration. */
export type DittoConfig = z.infer<typeof DittoConfigSchema>;

// ─── Content Filter Schemas ──────────────────────────────────────────

/** Zod schema for FilterRule validation */
export const FilterRuleSchema = z.object({
  type: z.enum(['kind', 'content-regex', 'tag', 'author-metadata']),
  field: z.string().optional(),
  operator: z.enum(['equals', 'contains', 'regex', 'not-equals', 'not-contains']),
  value: z.string(),
  caseSensitive: z.boolean().optional(),
});

/** Zod schema for ContentFilter validation */
export const ContentFilterSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  rules: z.array(FilterRuleSchema),
  createdAt: z.number(),
  updatedAt: z.number(),
});

// ─── SavedFeed Schema ────────────────────────────────────────────────

// ─── EncryptedSettings Schema ────────────────────────────────────────

/**
 * Zod schema for EncryptedSettings validation.
 * All fields are optional since settings are incrementally synced.
 * Uses looseObject to preserve unknown keys from newer app versions.
 */
export const EncryptedSettingsSchema = z.looseObject({
  theme: ThemeSchema.optional(),
  customTheme: ThemeConfigCompatSchema.optional(),
  autoShareTheme: z.boolean().optional(),
  useAppRelays: z.boolean().optional(),
  feedSettings: FeedSettingsSchema.optional(),
  contentFilters: z.array(ContentFilterSchema).optional(),
  contentWarningPolicy: ContentWarningPolicySchema.optional(),
  notificationsEnabled: z.boolean().optional(),
  notificationStyle: z.enum(['push', 'persistent']).optional(),
  notificationsCursor: z.number().optional(),
  notificationPreferences: z.object({
    reactions: z.boolean().optional(),
    reposts: z.boolean().optional(),
    zaps: z.boolean().optional(),
    mentions: z.boolean().optional(),
    comments: z.boolean().optional(),
    badges: z.boolean().optional(),
    letters: z.boolean().optional(),
    onlyFollowing: z.boolean().optional(),
  }).optional(),
  lastSync: z.number().optional(),
  sidebarOrder: z.array(z.string()).optional(),
  sidebarWidgets: z.array(z.object({
    id: z.string(),
    height: z.number().optional(),
  })).optional(),
  homePage: z.string().optional(),
  showGlobalFeed: z.boolean().optional(),
  showCommunityFeed: z.boolean().optional(),
  communityData: z.object({
    domain: z.string(),
    label: z.string(),
    userCount: z.number(),
    nip05: z.record(z.string(), z.unknown()),
  }).optional(),
  corsProxy: z.string().optional(),
  faviconUrl: z.string().optional(),
  linkPreviewUrl: z.string().optional(),
  sentryDsn: z.string().optional(),
  savedFeeds: z.array(z.unknown()).transform((arr) =>
    arr.flatMap((item) => {
      if (typeof item !== 'object' || item === null) return [];
      if ((item as Record<string, unknown>).destination !== undefined) return [];
      const result = SavedFeedSchema.safeParse(item);
      return result.success ? [result.data] : [];
    })
  ).optional(),
});
