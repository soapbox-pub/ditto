import {
  ReadCodeTool,
  WriteCodeTool,
  EditCodeTool,
  SearchNIPsTool,
  FetchNIPTool,
  SetTileTool,
  GetTileTool,
  AskQuestionsTool,
  SetNotesTool,
  ReadSpecTool,
  ReadExamplesTool,
  createGitLabTipFetcher,
  getTileState,
} from '@soapbox.pub/nostr-canvas/devkit';
import type { Tool } from '@soapbox.pub/nostr-canvas/devkit';
import type { NPool } from '@nostrify/nostrify';

import type { Ability } from '@/lib/abilities';
import type { ThemeConfig } from '@/themes';
import { createCorsFriendlyGitLabFetch } from './gitlabCorsFetch';
import { createNakTool } from './nakTool';
import { createSetThemeTool } from './setThemeTool';

/** A named tool ready for AgentSession dispatch. */
export interface ToolBundleEntry {
  name: string;
  tool: Tool;
}

// ─── Tile-authoring draft state ─────────────────────────────────────────────
//
// Per-project scratch state for a tile-authoring session: the in-progress
// source code (seeded from the session's seedCode) and the model's working
// notes. Module-scoped, like devkit's own tile-state store, so the closures
// the tools capture stay live for the whole session regardless of AgentSession
// rebuilds. Tile draft code/notes are session-lifetime only and do not
// survive a page reload; full persistence is deferred to the widget branch
// where the Tiles feature actually ships.

export interface TileDraftStore {
  getCode(projectId: string): string;
  setCode(projectId: string, code: string): void;
  getNotes(projectId: string): string;
  setNotes(projectId: string, notes: string): void;
  /** Seed the draft from a session's starting code, without clobbering an existing draft. */
  seedCode(projectId: string, seed?: string): void;
}

const draftCode = new Map<string, string>();
const draftNotes = new Map<string, string>();

export const tileDraftStore: TileDraftStore = {
  getCode: (projectId) => draftCode.get(projectId) ?? '',
  setCode: (projectId, code) => {
    draftCode.set(projectId, code);
  },
  getNotes: (projectId) => draftNotes.get(projectId) ?? '',
  setNotes: (projectId, notes) => {
    draftNotes.set(projectId, notes);
  },
  seedCode: (projectId, seed) => {
    if (seed && !draftCode.has(projectId)) draftCode.set(projectId, seed);
  },
};

// ─── Bundles ────────────────────────────────────────────────────────────────

/**
 * The always-on tools, present in every session regardless of abilities:
 * theme control, NIP lookups (community NIPs via search_nips, official
 * specs via fetch_nip), and ask_questions (the pending-input tool that
 * pauses a turn until the user answers clarifying questions — it needs no
 * ability, so it lives in the base bundle rather than behind the 'tiles'
 * ability). `nak` is not here: it pulls attacker-controlled Nostr content
 * into the model's context, so it lives behind the opt-in 'nostr-lookup'
 * ability instead.
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

/**
 * Build the "tiles" ability's tool bundle — devkit's 9 tile-authoring
 * tools wired to this session's draft state. `preview_tile` is a stub:
 * live preview needs a RuntimeAdapter that does not exist in Ditto yet
 * (deferred to the widget branch). `ask_questions` is not here: it ships
 * in the base bundle, so a Tiles session does not get it registered twice
 * (base + tiles bundles are concatenated for a session's final tool list).
 */
export function createTilesToolBundle(opts: { projectId: string; seedCode?: string; store?: TileDraftStore }): ToolBundleEntry[] {
  const store = opts.store ?? tileDraftStore;
  const projectId = opts.projectId;
  store.seedCode(projectId, opts.seedCode);

  const getCode = () => store.getCode(projectId);
  const setCode = (code: string) => store.setCode(projectId, code);
  const tipFetcher = createGitLabTipFetcher({ fetchImpl: createCorsFriendlyGitLabFetch() });

  return [
    { name: 'read_code', tool: new ReadCodeTool(getCode) },
    { name: 'write_code', tool: new WriteCodeTool(setCode) },
    { name: 'edit_code', tool: new EditCodeTool(getCode, setCode) },
    { name: 'set_tile', tool: new SetTileTool(projectId, getCode) },
    { name: 'get_tile', tool: new GetTileTool(projectId) },
    { name: 'preview_tile', tool: createPreviewTileStub(projectId) },
    { name: 'set_notes', tool: new SetNotesTool((notes) => store.setNotes(projectId, notes)) },
    { name: 'read_spec', tool: new ReadSpecTool(tipFetcher) },
    { name: 'read_examples', tool: new ReadExamplesTool(tipFetcher) },
  ];
}

/**
 * preview_tile placeholder: there is no RuntimeAdapter to render a live
 * preview with in Ditto yet, so the model gets an honest "not available"
 * message instead of devkit's snapshot that nothing would render.
 */
function createPreviewTileStub(projectId: string): Tool {
  return {
    description:
      'Show a live preview of the current tile in the chat. Takes no arguments — call set_tile first to register the tile state, then call this to render the preview.',
    async execute() {
      const state = getTileState(projectId);
      if (!state) {
        return { content: 'No tile state set. Call set_tile first.' };
      }
      return {
        content:
          'Live preview is not available yet in Ditto. Your tile state is registered; preview rendering arrives in a future update.',
      };
    },
  };
}

// ─── Ability → bundle mapping ───────────────────────────────────────────────

export type AbilityBundleBuilder = (opts: { projectId: string; seedCode?: string; nostr?: NPool }) => ToolBundleEntry[];

/**
 * One bundle builder per ability, keyed by the canonical `ABILITIES` registry
 * in `@/lib/abilities`. The Record<Ability, ...> type forces a builder for
 * every registered ability, so a new ability shows up in the popover, the
 * system-prompt manifest, and here from that single registration point.
 * `nostr` is optional for bundles that need a relay pool; the 'tiles'
 * builder ignores it.
 */
export const ABILITY_BUNDLES: Record<Ability, AbilityBundleBuilder> = {
  tiles: (opts) => createTilesToolBundle(opts),
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
  projectId: string;
  seedCode?: string;
  nostr?: NPool;
}): ToolBundleEntry[] {
  return [
    ...opts.base,
    ...opts.abilities.flatMap((ability) =>
      ABILITY_BUNDLES[ability]({ projectId: opts.projectId, seedCode: opts.seedCode, nostr: opts.nostr }),
    ),
  ];
}
