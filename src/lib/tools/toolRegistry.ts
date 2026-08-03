import {
  SearchNIPsTool,
  FetchNIPTool,
  AskQuestionsTool,
} from '@soapbox.pub/nostr-canvas/devkit';
import type { Tool } from '@soapbox.pub/nostr-canvas/devkit';
import type { NPool } from '@nostrify/nostrify';

import type { Ability } from '@/lib/abilities';
import type { ThemeConfig } from '@/themes';
import { createNakTool } from './nakTool';
import { createSetThemeTool } from './setThemeTool';

/** A named tool ready for AgentSession dispatch. */
export interface ToolBundleEntry {
  name: string;
  tool: Tool;
}

// ─── Bundles ────────────────────────────────────────────────────────────────

/**
 * The always-on tools, present in every session regardless of abilities:
 * theme control, NIP lookups (community NIPs via search_nips, official
 * specs via fetch_nip), and ask_questions (the pending-input tool that
 * pauses a turn until the user answers clarifying questions — it needs no
 * ability, so it lives in the base bundle). `nak` is not here: it pulls
 * attacker-controlled Nostr content into the model's context, so it lives
 * behind the opt-in 'nostr-lookup' ability instead.
 */
export function createBaseToolBundle(opts: {
  applyCustomTheme: (config: ThemeConfig) => void;
}): ToolBundleEntry[] {
  return [
    { name: 'set_theme', tool: createSetThemeTool(opts.applyCustomTheme) },
    { name: 'search_nips', tool: new SearchNIPsTool() },
    { name: 'fetch_nip', tool: new FetchNIPTool() },
    { name: 'ask_questions', tool: new AskQuestionsTool() },
  ];
}

/**
 * Build the "nostr-lookup" ability's tool bundle — nak, a read-only Nostr
 * client wired to Ditto's live relay pool from `useNostr()`. Opt-in only,
 * because its results put attacker-controlled event content into the
 * model's context.
 */
export function createNostrLookupToolBundle(opts: { nostr: NPool }): ToolBundleEntry[] {
  return [
    { name: 'nak', tool: createNakTool(opts.nostr) },
  ];
}

// ─── Ability → bundle mapping ───────────────────────────────────────────────

export type AbilityBundleBuilder = (opts: { nostr?: NPool }) => ToolBundleEntry[];

/**
 * One bundle builder per ability, keyed by the canonical `ABILITIES` registry
 * in `@/lib/abilities`. The Record<Ability, ...> type forces a builder for
 * every registered ability, so a new ability shows up in the popover, the
 * system-prompt manifest, and here from that single registration point.
 * `nostr` is optional for bundles that need a relay pool; the 'nostr-lookup'
 * builder throws when a session without one is built.
 */
export const ABILITY_BUNDLES: Record<Ability, AbilityBundleBuilder> = {
  'nostr-lookup': (opts) => {
    if (!opts.nostr) {
      throw new Error('The nostr-lookup ability requires a nostr relay pool; callers must pass one to buildSessionToolBundle.');
    }
    return createNostrLookupToolBundle({ nostr: opts.nostr });
  },
};

/** A session's final tools = base bundle + each selected ability's bundle. */
export function buildSessionToolBundle(opts: {
  base: ToolBundleEntry[];
  abilities: Ability[];
  nostr?: NPool;
}): ToolBundleEntry[] {
  return [
    ...opts.base,
    ...opts.abilities.flatMap((ability) =>
      ABILITY_BUNDLES[ability]({ nostr: opts.nostr }),
    ),
  ];
}
