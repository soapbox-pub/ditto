import { z } from 'zod';

import type { Theme, ContentWarningPolicy } from '@/contexts/AppContext';

/** Zod schema for Theme validation */
export const ThemeSchema = z.enum(['dark', 'light', 'black', 'pink', 'custom']) satisfies z.ZodType<Theme>;

/** Zod schema for a single HSL token value (e.g. "228 20% 10%") */
const HslTokenSchema = z.string().refine(
  (val) => /^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%$/.test(val.trim()),
  { message: 'Must be an HSL value like "228 20% 10%"' }
);

/** Zod schema for custom theme tokens (all 28 HSL color tokens) */
export const CustomThemeSchema = z.object({
  background: HslTokenSchema,
  foreground: HslTokenSchema,
  card: HslTokenSchema,
  cardForeground: HslTokenSchema,
  popover: HslTokenSchema,
  popoverForeground: HslTokenSchema,
  primary: HslTokenSchema,
  primaryForeground: HslTokenSchema,
  secondary: HslTokenSchema,
  secondaryForeground: HslTokenSchema,
  muted: HslTokenSchema,
  mutedForeground: HslTokenSchema,
  accent: HslTokenSchema,
  accentForeground: HslTokenSchema,
  destructive: HslTokenSchema,
  destructiveForeground: HslTokenSchema,
  border: HslTokenSchema,
  input: HslTokenSchema,
  ring: HslTokenSchema,
  sidebarBackground: HslTokenSchema,
  sidebarForeground: HslTokenSchema,
  sidebarPrimary: HslTokenSchema,
  sidebarPrimaryForeground: HslTokenSchema,
  sidebarAccent: HslTokenSchema,
  sidebarAccentForeground: HslTokenSchema,
  sidebarBorder: HslTokenSchema,
  sidebarRing: HslTokenSchema,
});

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
  showProfileThemes: z.boolean().optional(),
  feedIncludeProfileThemes: z.boolean().optional(),
  showCustomProfileThemes: z.boolean().optional(),
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
  theme: ThemeSchema.optional(),
  customTheme: CustomThemeSchema.optional(),
  useAppRelays: z.boolean().optional(),
  feedSettings: FeedSettingsSchema.optional(),
  contentFilters: z.array(ContentFilterSchema).optional(),
  contentWarningPolicy: ContentWarningPolicySchema.optional(),
  notificationsCursor: z.number().optional(),
  lastSync: z.number().optional(),
});
