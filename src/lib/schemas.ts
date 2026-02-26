import { z } from 'zod';

import type { Theme, ContentWarningPolicy } from '@/contexts/AppContext';
import type { CoreThemeColors } from '@/themes';

/** Zod schema for Theme validation */
export const ThemeSchema = z.enum(['dark', 'light', 'system', 'custom']) satisfies z.ZodType<Theme>;

/**
 * Accepts current theme values as well as legacy values ("black", "pink")
 * from older configs. Consumers should migrate legacy values to "custom".
 */
export const ThemeSchemaCompat = z.enum(['dark', 'light', 'system', 'custom', 'black', 'pink']);

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
  theme: ThemeSchemaCompat.optional(),
  customTheme: ThemeColorsCompatSchema.optional(),
  useAppRelays: z.boolean().optional(),
  feedSettings: FeedSettingsSchema.optional(),
  contentFilters: z.array(ContentFilterSchema).optional(),
  contentWarningPolicy: ContentWarningPolicySchema.optional(),
  notificationsEnabled: z.boolean().optional(),
  notificationsCursor: z.number().optional(),
  lastSync: z.number().optional(),
});
