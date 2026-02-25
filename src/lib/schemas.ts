import { z } from 'zod';

import type { Theme, ContentWarningPolicy } from '@/contexts/AppContext';
import type { ThemeTokens } from '@/themes';

/** Zod schema for Theme validation */
export const ThemeSchema = z.enum(['dark', 'light', 'system', 'custom']) satisfies z.ZodType<Theme>;

/**
 * Accepts current theme values as well as legacy values ("black", "pink")
 * from older configs. Consumers should migrate legacy values to "custom".
 */
export const ThemeSchemaCompat = z.enum(['dark', 'light', 'system', 'custom', 'black', 'pink']);

/** HSL value string like "258 70% 55%" */
const HslValue = z.string().regex(/^\d/);

/** Zod schema for ThemeTokens (custom theme colors) */
export const ThemeTokensSchema = z.object({
  background: HslValue,
  foreground: HslValue,
  card: HslValue,
  cardForeground: HslValue,
  popover: HslValue,
  popoverForeground: HslValue,
  primary: HslValue,
  primaryForeground: HslValue,
  secondary: HslValue,
  secondaryForeground: HslValue,
  muted: HslValue,
  mutedForeground: HslValue,
  accent: HslValue,
  accentForeground: HslValue,
  destructive: HslValue,
  destructiveForeground: HslValue,
  border: HslValue,
  input: HslValue,
  ring: HslValue,
  sidebarBackground: HslValue,
  sidebarForeground: HslValue,
  sidebarPrimary: HslValue,
  sidebarPrimaryForeground: HslValue,
  sidebarAccent: HslValue,
  sidebarAccentForeground: HslValue,
  sidebarBorder: HslValue,
  sidebarRing: HslValue,
}) satisfies z.ZodType<ThemeTokens>;

/** Zod schema for ContentWarningPolicy validation */
export const ContentWarningPolicySchema = z.enum(['blur', 'hide', 'show']) satisfies z.ZodType<ContentWarningPolicy>;

/**
 * Zod schema for FeedSettings validation.
 * All fields use .optional() so data with missing keys
 * (from older encrypted settings) doesn't reject the whole object.
 * Uses looseObject to preserve extra keys from newer encrypted settings.
 * Missing fields get filled in by the defaultConfig merge downstream.
 */
export const FeedSettingsSchema = z.looseObject({
  feedIncludePosts: z.boolean().optional(),
  feedIncludeReposts: z.boolean().optional(),
  feedIncludeArticles: z.boolean().optional(),
  showArticles: z.boolean().optional(),
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
});

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

/**
 * Zod schema for EncryptedSettings validation.
 * All fields are optional since settings are incrementally synced.
 * Uses looseObject to preserve unknown keys from newer app versions.
 */
export const EncryptedSettingsSchema = z.looseObject({
  theme: ThemeSchemaCompat.optional(),
  customTheme: ThemeTokensSchema.optional(),
  useAppRelays: z.boolean().optional(),
  feedSettings: FeedSettingsSchema.optional(),
  contentFilters: z.array(ContentFilterSchema).optional(),
  contentWarningPolicy: ContentWarningPolicySchema.optional(),
  notificationsCursor: z.number().optional(),
  lastSync: z.number().optional(),
});
