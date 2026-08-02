import { defineMessage } from 'react-intl';

/**
 * The canonical registry of chat abilities.
 *
 * One source of truth for "what abilities exist". Everything else reads from
 * here: the abilities popover (AIChatPage), the base system prompt's ability
 * manifest (buildAbilityManifest), and the tool-bundle concatenation
 * (ABILITY_BUNDLES in toolRegistry — its Record<Ability, ...> type forces a
 * bundle builder for every key in ABILITIES at compile time).
 */

/**
 * A message descriptor whose defaultMessage is always a plain English string.
 * Narrower than react-intl's MessageDescriptor (which also permits ICU ASTs
 * and undefined), so consumers that read defaultMessage as text can do so
 * without union handling. Still assignable to MessageDescriptor, so UI
 * consumers can spread it into FormattedMessage.
 */
export interface AbilityMessageDescriptor {
  id: string;
  defaultMessage: string;
}

/** Display metadata for a registered chat ability. */
export interface AbilityInfo {
  /** Stable ability key, used in session state and tool-bundle lookups. */
  key: string;
  /** Human-readable name for the abilities popover and the system prompt manifest. */
  label: AbilityMessageDescriptor;
  /** One-line description for the abilities popover and the system prompt manifest. */
  description: AbilityMessageDescriptor;
}

/** The registered abilities. Adding one here makes it show up in the popover, the manifest, and the tool bundles. */
export const ABILITIES = [
  {
    key: 'tiles',
    label: defineMessage({ id: 'ai-chat.ability.tiles.label', defaultMessage: 'Tiles' }),
    description: defineMessage({
      id: 'ai-chat.ability.tiles.description',
      defaultMessage: 'Build a sidebar widget (a tile) that runs inside the app, with code, settings, and publishing.',
    }),
  },
  {
    key: 'nostr-lookup',
    label: defineMessage({ id: 'ai-chat.ability.nostrLookup.label', defaultMessage: 'Nostr Lookup' }),
    description: defineMessage({
      id: 'ai-chat.ability.nostrLookup.description',
      defaultMessage: 'Look up Nostr profiles and events, and search recent notes by tag or author, using nak.',
    }),
  },
] as const satisfies readonly AbilityInfo[];

/** The set of registered ability keys. */
export type Ability = (typeof ABILITIES)[number]['key'];

/**
 * The base system prompt's ability manifest: one line per registered ability,
 * name + description, so the AI can mention abilities the current session does
 * not have loaded.
 *
 * Resolves each descriptor's English defaultMessage directly — the model
 * always reads English regardless of the user's locale, so this consumer does
 * not localize (UI consumers render the descriptors via FormattedMessage).
 */
export function buildAbilityManifest(): string {
  return ABILITIES.map((ability) => `- ${ability.label.defaultMessage}: ${ability.description.defaultMessage}`).join('\n');
}
