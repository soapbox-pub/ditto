/**
 * The canonical registry of chat abilities.
 *
 * One source of truth for "what abilities exist". Everything else reads from
 * here: the abilities popover (AIChatPage), the base system prompt's ability
 * manifest (buildAbilityManifest), and the tool-bundle concatenation
 * (ABILITY_BUNDLES in toolRegistry — its Record<Ability, ...> type forces a
 * bundle builder for every key in ABILITIES at compile time).
 */

/** Display metadata for a registered chat ability. */
export interface AbilityInfo {
  /** Stable ability key, used in session state and tool-bundle lookups. */
  key: string;
  /** Human-readable name for the abilities popover and the system prompt manifest. */
  label: string;
  /** One-line description for the abilities popover and the system prompt manifest. */
  description: string;
}

/** The registered abilities. Adding one here makes it show up in the popover, the manifest, and the tool bundles. */
export const ABILITIES = [
  {
    key: 'tiles',
    label: 'Tiles',
    description: 'Build a sidebar widget (a tile) that runs inside the app, with code, settings, and publishing.',
  },
] as const satisfies readonly AbilityInfo[];

/** The set of registered ability keys. */
export type Ability = (typeof ABILITIES)[number]['key'];

/**
 * The base system prompt's ability manifest: one line per registered ability,
 * name + description, so the AI can mention abilities the current session does
 * not have loaded.
 */
export function buildAbilityManifest(): string {
  return ABILITIES.map((ability) => `- ${ability.label}: ${ability.description}`).join('\n');
}
