# PLAN: Tiles → Widgets + AI Chat TLC — unified

> Living plan. Delete when the effort ships. Supersedes `TILES_PLAN.md` (`tiles-v3-widgetonly`
> branch) and this branch's own former `PLAN.md`, consolidated 2026-07-31 rather than waiting
> for the merge-then-rebase dance those two docs had planned for each other. Lives on
> `ai-chat-tlc` while Phases 8-10 (below) are in progress; moves to `tiles-v3-widgetonly` once
> this branch's work is done, folding in that branch's real-time Phase 0-7 progress at the move
> — so this copy's Phase 0-7 section reflects the plan as scoped, not necessarily
> `tiles-v3-widgetonly`'s live status in the meantime. Deleted before this branch's MR reaches
> `main` (per the plan skill's normal finishing step), not carried into the merged diff.
>
> **Phase 10 (this branch's own scope) is now fully done** — see its compacted summary below.
> The Human review queue is now fully confirmed (2026-08-03 QA pass, including a fresh
> `--mode ghpages` build check). What remains is the MR-split restructuring (Dirk's review
> suggestion): bugfix issues cut onto their own branches off `main`, `ai-chat-tlc` cleaned down to
> the AI-chat-modernization diff Dirk actually reviewed, the Tiles-authoring tool bundle extracted
> onto its own stacked branch, and `tiles-v3-widgetonly` retargeted onto that stack with its own
> internal Phase 4 → 6 → 7 sub-split. Tracked in detail in `tiles-v3-widgetonly`'s plan doc once
> this file moves there (see Sequencing below).

## Vision

nostr-canvas tiles become **Ditto's widget system**. User-facing name is **"Widgets"**;
internal code keeps the `tile` / `src/tiles/` vocabulary that mirrors the
`@soapbox.pub/nostr-canvas` library and the kind-30207 spec. Native builtin sidebar widgets are
progressively ported to Lua tiles published under a Ditto curator key. AI chat gains a
widget-creation ability, built on a new host-agnostic `devkit` library extracted from
tile-studio's existing AI-authoring code — proven by rewriting tile-studio itself on top of it
before Ditto ever touches it.

This effort spans three repos. This is the single tracking doc for all of them:

- `~/repos/nostr-canvas` (`@soapbox.pub/nostr-canvas`) — gains a `./devkit` sub-export: a
  host-agnostic library for building AI agents that write/edit/preview nostr-canvas Lua tiles.
  Its own tickets (D1-D7) are tracked in **that repo's own `PLAN.md`**, referenced here by ID —
  not duplicated in full.
- `~/repos/tile-studio` — its AI-authoring IDE gets rewritten to consume `devkit` instead of its
  own local `src/lib/*` implementation, proving the extraction works in a real, already-working
  app before Ditto touches it.
- `~/repos/ditto` — Tiles→Widgets rename/marketplace/builtin-porting (Phases 0-7 below, tracked
  day-to-day on branch `tiles-v3-widgetonly` while this doc lives here), plus the AI chat
  "Tiles" ability (Phases 8-10, this branch's own scope).

## Sequencing

`ai-chat-tlc` (this branch) merges to `main` **before** the Tiles work. Once merged, the Tiles
MR (`tiles-v3-widgetonly`) gets rebased to start from the new `main`, and this plan doc moves
over to continue tracking Phase 0-7 (by then possibly further along than the snapshot recorded
below) alongside Phases 8-10's now-`done` summary.

## Decision record

### Tiles → Widgets (from the original scoping interview)

- **Everything planned first; no implementation until the plan is approved.**
- **Rename is user-facing only**: labels, nav, page titles, kind-label maps, notification nouns
  say "Widget". Routes are `/widgets/*` with `/tiles/*` redirects. Internal identifiers, AppConfig
  fields, localStorage prefixes, NIP-78 setting names are **not** migrated.
- **Feeds**: kinds claimed via `k` + `render:in_feed=true` by installed tiles join the user's feed
  queries as **native generic cards** (no Lua execution in feeds). Ditto's own kind renderers take
  precedence on conflict; an advanced setting can show both or let the generic card override.
- **Frame redesign**: thin frame, top handle bar, no rendered title for canvas tiles (native
  builtins get a small handle-bar title until ported). Accent color = hash(identifier) → hue.
- **Marketplace TLC**: visual redesign, install-from-list with consent dialog, sort + search (no
  category filters), social signals (detail-page only), detail-page upgrades. Wasm engine lazy-
  loaded, never at app boot.
- **Output nodes**: `feed` (native mini cards) and `nevent` (card/deck) in `TileOutputView`.
  `comments` stays unsupported.
- **Builtin porting scope**: trends, hot-posts, wikipedia, bluesky, nostr-clients, blobbi, status
  → Lua tiles. AI chat and the four feed widgets stay native. Curator-signed tiles auto-grant all
  declared capabilities except bitcoin signing and event publishing, which always prompt.
- **Zaps**: widgets are zappable via the kind-30207 event.
- **Verification bar**: every ticket passes `npm run test`; UI tickets carry a manual dev-server
  check before close.

### AI Chat TLC (grilled 2026-07-28/30, revised 2026-07-31 — see superseded note)

- **Sequencing**: `devkit` in nostr-canvas → tile-studio rewrite on `devkit` (validates the
  extraction in a real app) → Ditto integration. Do not skip straight to Ditto.
- **AI backend in Ditto**: both Shakespeare (existing NIP-98 proxy, no user API keys) **and**
  user-supplied provider profiles (OpenRouter / OpenAI-compatible generic / DeepSeek preset, own
  API key). New settings UI (`/settings/ai`). Sync is opt-in per profile via the existing
  NIP-44 encrypted-settings blob; plaintext `localStorage` otherwise.
- **Library home**: `./devkit` subpath of the existing `@soapbox.pub/nostr-canvas` package, no
  separate package/repo/version, always in lockstep with the main package.
- **No React hook shipped from devkit.** Plain framework-agnostic TS, no `react` peer dependency.
  Each host writes its own thin `useSyncExternalStore` wrapper.
- **Transport-agnostic guardrail**: devkit's design must also work for non-browser hosts (e.g. a
  future Armada/Concord bot with no rendered UI) — no tool or agent-loop output assumes a chat
  UI is consuming it.
- **devkit tool list (v1)**: 11 tile-authoring tools (`read_code`, `write_code`, `edit_code`,
  `read_spec`, `read_examples`, `search_nips`, `fetch_nip`, `set_tile`, `get_tile`,
  `preview_tile`, `set_notes`) + a 12th, `ask_questions` (Ticket D5). Static analysis (lint/
  capability-nudge) skipped for v1 — the live preview runtime is the only correctness signal.
- **Chat history**: local-only, `localStorage`, no cross-device Nostr sync for v1.
- **Preview isolation**: the chat's preview mounts its own separate `NostrCanvasProvider` tree —
  never shares Ditto's app-wide `CanvasRuntimeProvider` that hosts the user's real installed
  tiles. A broken/malicious draft can never touch real installed tiles' state.
- **Chat surface**: evolve `/ai-chat` (`AIChatPage.tsx` / `AIChatWidget.tsx`) in place — no new
  parallel page. A hamburger/"Abilities" menu near the chat textarea toggles which abilities are
  active for a session; enabling an ability **starts a fresh session** (its own conversation
  history, its own system prompt/tools) rather than mutating the current thread. "Tiles: Create
  widgets for your Ditto sidebar" is the first ability.
- **Ditto's Tiles ability is widget-placement only.** Even though the underlying devkit tools and
  tile-studio support full tiles (`main`/`event`/`widget` placement), Ditto's widget-creation
  system prompt constrains the AI to `placement: "widget"` only — Ditto has no other UI surface
  to put a tile today.
- **Extension mechanism**: source-level only (a `Tool` implementation + one registry line), not a
  runtime plugin loader.
- **Image generation** is planned as its own devkit tool/skill using `gpt-image-1`, for Phase
  10's publish flow (AI-generated tile image) — not yet scoped in detail (see Phase 10 open
  items).

> **Superseded 2026-07-28 decision, corrected 2026-07-31**: the original decision record called
> for a **stub adapter** during preview (fake all-zeros pubkey, no-op/fake signing and
> encryption, real relay reads/fetch only) so an AI-authored draft could never trigger real
> signing/publishing/encryption. Re-grilled 2026-07-31 alongside nostr-canvas's own Ticket D6 and
> **replaced**: preview now uses a **real** `RuntimeAdapter` (the host's own, real signer/login),
> wrapped by a new `PreviewAdapter` that permission-gates capabilities the same way installed
> tiles are gated, keyed by `computePreviewGrantKey(slug, declaredCaps, version)` rather than a
> published tile's `(kind:pubkey:d)`. See Ticket D6 in nostr-canvas's `PLAN.md` for the full
> design and why (mainly: letting the AI actually exercise real capabilities like `fetch`,
> `nip44-encrypt/decrypt`, `get_profile` during preview, with `publish_event` specifically
> sign-for-real-then-review-before-broadcast rather than fully faked).

> **Superseded 2026-07-31 decision**: the original Phase 9 text called for D7 (nostr-canvas
> 0.13.0 npm publish) to gate the start of Phase 9, with the whole migration landing as one
> coherent diff rather than piece-by-piece. Re-grilled 2026-07-31 and **replaced**: D7 now runs
> *first and immediately* (not deferred) specifically to unblock Phase 9 against a real registry
> version instead of a local `file:`/`link:` workaround, and Phase 9 itself is split into four
> separately-dispatched, separately-verified tickets (T9.0-T9.3) — same granularity D4-D6 used in
> nostr-canvas, rather than one big migration. Driver: tile-studio has zero test infrastructure
> today, so a new T9.0 ticket stands up vitest + baseline tests against current pre-migration
> behavior before T9.1/T9.2 can use the same TDD dispatch pattern as D4-D6.

## Carried-forward security posture (from 0.11 integration)

- The runtime is an extension of Ditto, not a second Nostr stack: adapter delegates to
  Nostrify/`useNostr`; signing/NIP-44/profiles/toasts use Ditto hooks; tile code never touches
  the DOM.
- All tile/event metadata is untrusted: `sanitizeUrl()` for every image URL, sanitized markdown,
  Lua source only as escaped text.
- Capability grants are explicit, per-account, device-local; never derived from synced data
  (curator tier in Phase 7 carves a documented exception, excluding bitcoin/publish).
- Safe fetch: HTTPS-only through the CORS proxy, credentials and sensitive headers stripped.
- Tile execution remains browser-only (`canUseCanvasTiles()`) until the native WebView path is
  verified.

---

## Phase 0 — 0.11 integration (done)

Marketplace, detail page, install/permissions/persistence, runtime host, sidebar widget
integration, feed `TilePublishCard`, settings page, browser gating, a11y pass.

## Phase 1 — nostr-canvas 0.12 upgrade (done, human-verified 2026-07-28)

Core adapter port, QR/upload_image/lazy-runtime activation gate. See commit range
`2d8cffaa`…`8721a34a`.

## Phase 1.5 — Follow-up fixes (done, human-verified 2026-07-28)

Spoiler chevron, `bitcoin-sign-psbt` always-prompt, install-dialog overflow fix.

## Phase 2 — Widget frame redesign & double-title fix (done, human-verified 2026-07-28)

Thin frame, accent hue via `hashWidgetId`, single-`h1` detail page.

## Phase 3 — User-facing rename to "Widgets" (done, human-verified 2026-07-28)

Routes, strings/maps, picker flattening. Commit `7bb2da20` + `fc92763d`.

## Pending work — remaining `tiles-v3-widgetonly` scope

Everything below (Phase 4's remainder, Phase 6, Phase 7) is not yet started or not yet finished.
Per the 2026-08-03 MR-split restructuring decision, each becomes its own stacked sub-MR/tracking
issue within `tiles-v3-widgetonly`'s own sub-stack, in execution order **Phase 4 → Phase 6 →
Phase 7** — this is what has to land before `tiles-v3-widgetonly` (tier 4 of the overall MR
stack) is merge-ready. Phase 5 is **not** part of that sequence; it's shelved separately below.

## Phase 4 — Marketplace TLC — `in_progress` (on `tiles-v3-widgetonly`)

Icon-first cards, accent colors, consent dialog, click-to-expand, sort + search, unified detail
page, social signals (detail-page only), detail-page gallery/history, first-open nag. All
human-verified through T4.6 (2026-07-28). Remaining (scoped here 2026-07-31; confirmed still
fully pending as of 2026-08-03 — no T4.7/T4.8/T4.9 code exists yet on `tiles-v3-widgetonly`):

- [ ] **T4.7 Tile state sync bug + re-prompt on drift** (user, 2026-07-30; re-grilled
      2026-07-31). Two independent problems:
      - **Live grant refresh (confirmed real bug in Ditto).** Changing a tile's granted
        capabilities in `/settings/widgets` already calls `installations.setGrantedCapabilities()`
        → `runtime.registerFromEvent()`, and this **does** work for settings changes — but not
        for permission grants on an **already-running** tile instance. Root cause found in
        nostr-canvas's Rust engine (`lib/crates/nostr-canvas-core/src/engine.rs`): each tile
        instance's Lua sandbox gets a frozen `granted_capabilities: Vec<String>` snapshot at
        creation time (`EngineConfig`), and capability calls (`fetch`/`publish_event`/
        `encrypt_nip44`/`decrypt_nip44`) are gated **locally inside the sandbox** against that
        frozen snapshot before ever reaching `Runtime::is_granted()`'s live `HashMap` lookup —
        so revoking may correctly deny at the live-runtime layer, but **granting a new
        capability to an already-open tile silently fails** until the tile instance is
        recreated. Decided: fix this properly in the nostr-canvas engine (not a Ditto-side
        remount workaround) — needs its own ticket in nostr-canvas's `PLAN.md` (new Rust/wasm
        work: let an already-running engine instance receive a live grant update, e.g. via a new
        `WorkerCommand` that pushes fresh `granted_capabilities` to an existing tile's engine).
        *Eval:* TBD once scoped in nostr-canvas's own PLAN.md — proposed: a Rust test asserting
        an engine instance's capability gate reflects a grant update pushed after creation,
        without recreating the instance; Ditto-side manual check: open a sidebar widget, grant
        it a new permission in settings without reloading, confirm the capability call succeeds
        on the next use.
      - **Re-prompt on declared-vs-granted drift.** When installed tiles are re-synced (app
        load/login), if a tile's currently-declared perms exceed what's been granted (e.g. the
        author added a new declared capability in an update), re-prompt **once per app
        load/login, batched into one dialog** listing every such tile — not per-tile-open, not
        a background silent degrade. *Eval:* unit test simulating a `restore()` pass with one
        tile whose declared perms exceed stored grants, asserting the batched prompt data is
        produced; manual: update-published-tile scenario shows the batched dialog once at
        login, not repeated on every widget open.
- [ ] **T4.8 Sidebar "Add widget" → marketplace discovery** (user, 2026-07-30; re-grilled
      2026-07-31). Inside `WidgetPickerDialog`'s existing list (opened by the sidebar's
      unchanged "Add widget" button), add one new row **at the top**, visually differentiated
      from the regular widget rows (e.g. accent styling/badge), labeled something like **"NEW:
      Get more widgets"**, navigating to `/widgets` on click. Rest of the dialog (builtin
      widgets + already-installed marketplace tiles once Phase 7/T4.9 make that meaningful) is
      unchanged. No attempt to unify builtin/marketplace listings in this dialog yet — that
      waits on Phase 7. *Eval:* manual: dialog opens, new row is visually distinct and at the
      top, clicking it navigates to `/widgets`; `npm run test`.
- [ ] **T4.9 Auto-add installed widgets to sidebar** (user, 2026-07-30; re-grilled 2026-07-31).
      Installing a tile from the marketplace auto-adds it to the sidebar by default. A global
      toggle in `/settings/widgets` disables this for future installs (existing sidebar
      contents untouched when toggled off; removal from the sidebar is still just the existing
      remove flow). *Eval:* unit test: install with the toggle on → tile appears in sidebar
      config; toggle off → new installs don't touch sidebar config; manual: install a real
      marketplace tile, confirm it appears in the sidebar without a separate "Add widget" step.
- [ ] **Addendum for T7.10** (surfaced 2026-07-31, not yet scoped): once Phase 7 ports a builtin
      widget to its Lua-tile equivalent, a user with that builtin already configured should get
      auto-swapped to the tile version — without breaking the widget for users on older Ditto
      builds or forks that don't understand tiles. Needs its own scoping pass when Phase 7 is
      reached; noted here so it isn't lost.

## Phase 6 — `feed` and `nevent` output nodes — `deferred` (not urgent; after Phase 7's wikipedia demo)

- [ ] **T6.1 `feed` node.** Native mini info cards (~12 events, paginated). *Eval:* renderer
      test + manual; `npm run test`.
- [ ] **T6.2 `nevent` node.** Native card/deck reusing `EmbeddedNote`. *Eval:* renderer test +
      manual; `npm run test`.

## Phase 7 — Port builtin widgets to Lua tiles — `pending`

Ordering: after Phases 1-6.

- [ ] **T7.1 Publish script.** Builtin widget Lua sources live in `~/repos/nostr-canvas`,
      published with its own `publish-tile.js`, curator-signed, tagged
      `["t", "ditto-builtin-tile"]`. *Eval:* published event parses via `parseTileDefEvent`,
      carries the tag, lands on the test relay.
- [ ] **T7.2 Curator trust tier.** `widgetCuratorPubkey` AppConfig field. "Builtin/curated" =
      `event.pubkey === curator` (authors-filtered query) **and** the `t: ditto-builtin-tile`
      tag — the tag alone grants nothing. Curated tiles auto-install (trends, hot-posts,
      wikipedia defaults) and auto-grant everything except bitcoin/publish. *Eval:* unit tests:
      curated-detection requires pubkey+tag; auto-grant excludes sign/publish; consent dialog
      still fires for those; `npm run test`.
- [ ] **T7.3-T7.9 Port seven widgets** (one ticket each): trends, hot-posts, wikipedia, bluesky,
      nostr-clients, blobbi, status. *Eval per tile:* side-by-side manual comparison against the
      native widget; `npm run test`.
      - **Wikipedia demo done + working** (human-verified 2026-07-28), published to
        `wss://bruh.samt.st`. Required nostr-canvas 0.12.3 (`os.date`/`os.time` wasm fix) and
        0.12.4 (`NavigateTarget` `{ url }` variant). Ditto side: `adapter.navigate` implements
        `url` (sanitizeUrl → internal browser) and NIP-19 pointer targets.
- [ ] **T7.10 Migration + retirement.** Sidebar config migration builtin-id → `canvas:` id;
      remove retired React widget code; fresh installs default to curator tiles. AI chat + feed
      widgets remain native. See the T4.7 addendum above for the auto-swap-on-port nuance.
      *Eval:* migration unit test (old config → new ids, no dupes); manual: existing sidebar
      survives upgrade; `npm run test`.

---

## Phase 5 — Tile-claimed kinds in feeds (native generic cards) — `shelved indefinitely (2026-08-03)`

Not part of the Phase 4 → 6 → 7 pending sequence above and not a `tiles-v3-widgetonly`
merge-readiness gate. User's call, 2026-08-03: out of scope, may not happen in Ditto at all for
the foreseeable future. Kept here (not deleted) only because T5.1 already shipped and
`getTileFeedKinds`/`useTileFeedKinds` (wired through the feed/stream hooks and
`tileKindConflictMode`, `6b79a50e`) is live code, not a stub.

- [x] **T5.1 Kind collection + settings.** Done in `6b79a50e`.
- [ ] **T5.2 Generic widget-interaction card.** Native feed card: "@author used <Widget name>"
      with icon/accent, best-effort summary, link to detail page. No Lua in feeds. Shelved, not
      scheduled. *Eval (if ever picked back up):* manual: publish a test event of a claimed kind,
      see the card in feed; `npm run test`.

## Phase 8 — nostr-canvas: `./devkit` subpath export — tracked in nostr-canvas's own `PLAN.md`

Goal: a host-agnostic library (no React) providing everything an AI agent needs to write/edit/
preview a nostr-canvas Lua tile, extracted and generalized from tile-studio's `src/lib/*`. **Full
ticket text and eval criteria live in `~/repos/nostr-canvas/PLAN.md`** (branch
`devkit-extraction`) — this section is a status pointer only, so this doc doesn't duplicate and
drift from the source of truth. D1-D7 all done, including D7's release (nostr-canvas 0.13.0,
later bumped further to 0.14.6 during Phase 9's live-QA bug fixes — see Phase 9 below).

## Phase 9 — tile-studio: rewrite the client on `devkit` — `done`, pending final human click-through (see Human review queue)

Rewrote tile-studio's AI-authoring IDE onto devkit, deleting the local code it replaced. Landed
as four tickets (T9.0-T9.3), each separately dispatched/verified, committing directly to
tile-studio's `main` (its existing no-feature-branch convention).

- **T9.0** stood up vitest (`4398767`) — 14 files, 100 baseline tests; tile-studio had zero test
  infrastructure before this.
- **T9.1** swapped `useAISession.ts` → devkit's `AgentSession` via a new `useAgentSession.ts`
  hook; 9 of 11 local tool classes → devkit equivalents (`ReadSpecTool`/`ReadExamplesTool` stay
  local — pre-bundled Vite `?raw` content, no devkit equivalent); added the `ask_questions` tool
  + its pending-input UI. Landed as three sub-commits (`bb91830`, `b385164`, `cca8a83`) so no
  intermediate state ever let the AI call a tool the UI couldn't handle.
- **T9.2** swapped the preview driver: `StubAdapter` + `TilePreview.tsx`'s bespoke build/
  register/teardown logic → devkit's `PreviewSession`/`PreviewAdapter`, wrapped around
  tile-studio's real adapter via `usePreviewSession.ts` (`cf60023`, `507143e`).
- **T9.3** cleanup: removed `stub-adapter.ts` + its tests, net -309 lines (`175df92`).

Three real bugs surfaced only through live browser QA — structurally invisible to `vitest run`
regardless of test count, confirming the standing methodology note about Node-globals-in-browser
and cross-package schema-version bugs:

1. **fengari in a browser bundle** — raw `fengari`'s own files read `process`/`global` unguarded
   at module scope. Fixed in nostr-canvas (`fengari-web` swap + an `os.getenv` stdlib patch),
   released `0.13.2`.
2. **Zod v3/v4 schema mismatch** — devkit's `toolToOpenAI` calls the Zod-v4-only
   `z.toJSONSchema()` across every tool, including tile-studio's two kept-local tools still on
   Zod v3. Fixed by bumping tile-studio's `zod` to `^4.4.3`.
3. **Preview interactions dispatched to the wrong runtime** — the more structural of the three.
   `TilePreview.tsx` rendered preview output through the app's *ambient* `NostrCanvasProvider`
   instead of the `PreviewSession`'s own private runtime, so button clicks / form submits never
   reached the tile's Lua code at all — `deliverInputEvent` was posted to a worker that never
   owned the preview's `tileId`, silently swallowed. Root-caused and fixed in nostr-canvas
   (`TileView` gained a `runtime` override prop, `PreviewSession` gained `getRuntime()`; released
   `0.14.5`, alongside an unrelated `input_type`-coercion bug caught in the same pass), then
   wired through tile-studio (`usePreviewSession` → local `TileView` wrapper → `RunningPreview`;
   `a445ac5`, `59ca481`; tracked in tile-studio's own `PLAN.md` as its Phase 2).

Gate at final state: 104/104 `vitest run`, clean `tsc -b`, clean `eslint .`, clean `vite build`.
See Human review queue below for the two manual checks still outstanding (separate repo/deploy,
not this branch's own scope to close).

## Phase 10 — Ditto: AI chat "Tiles" ability — `done`

Built on the now-proven `devkit`. All of T10.0-T10.10 landed on `ai-chat-tlc`, confirmed via a
live manual QA walkthrough with the user (all 14 original human-review-queue items), plus a
follow-up bug-fix round in a later session (see below). One line each:

- **T10.0** Provider settings (`/settings/ai`): profile CRUD, per-profile NIP-44 sync toggle,
  model detection. `a979f0eb`/`8e93b337`.
- **T10.1** Abilities menu + mode-scoped sessions: toggling "Tiles" forks a new tab with its own
  system prompt/tools; provider/model switch mid-session preserves history. `9362b32a`/`f28992f0`.
- **T10.2** Tool registry framework: full migration onto `AgentSession` for every session
  (replaces the old hand-rolled `useToolExecutor` loop), `set_theme` ported as the base-bundle
  example. `4e123e55`/`be03a146`.
- **T10.3** Tabs + local history: per-tab `localStorage` via `serialize()`/`deserialize()`
  (round-trips a mid-flight `ask_questions` pause), 20-tab cap with a close-picker dialog, LLM
  auto-title. `2e2ff431`/`0348d7e6`.
- **T10.4** Auto-detect models on API key entry, debounced ~600-800ms; manual "Detect models"
  stays as a retry path. `e6207feb`/`28827e13`.
- **T10.5** @-mention autocomplete extended with abilities (plain-text token insert, no side
  effect) alongside the existing people mentions. `88799c8e`/`6855e4fe`.
- **T10.6** Ability/skill manifest folded into the base system prompt from the canonical
  `ABILITIES` registry — one source of truth for the popover, manifest, and mention list.
  `9f454776`/`2bedc404`.
- **T10.7** `search_nips`/`fetch_nip` promoted from Tiles-only to the base bundle.
  `0eeb53c6`/`eb4034d8`.
- **T10.8** `/settings/ai` design audit + polish: intro hero, accent-underlined section header,
  settings-menu illustration, matching every sibling settings page. `9af2ec32`/`70239560` +
  `dc9cd355` (duplicate-heading fix caught on review).
- **T10.9** `nak` read-only Nostr tool (`req`/`fetch`/`profile`/`decode`/`encode`), base bundle,
  built on Ditto's own `useNostr()` pool. `5b734737`/`4299d591`. QA found a real bug: the
  `z.discriminatedUnion` input schema serializes to a JSON Schema `oneOf` with no top-level
  `type`, which strict OpenAI-compatible providers reject with a 400 — fixed by flattening to one
  `z.object` with an `action` enum plus runtime per-action validation, `bb48cf67`.
- **T10.10** i18n coverage for this MR's own AI-chat surfaces (`AIChatPage.tsx`,
  `src/lib/abilities.ts` descriptors), scoped to what this branch itself introduced, not a
  codebase-wide sweep. `81a7531d`.

**Bug-fix round, found during the QA walkthrough and fixed in a follow-up session (not
separately ticketed above):**

- Tool-call history rendered every tool as a bare pill with just its name (or a raw error
  string) — `set_theme` was the one exception. `ask_questions` additionally had no answer UI at
  all, so a paused session showed nothing to answer. Rebuilt: every tool now gets a tailored
  summary + collapsible detail (`ask_questions` read-only Q&A reusing tile-studio's
  `PendingQuestionsCard` look, `nak` one-line outcomes per action, `read_spec`/`read_examples`/
  `fetch_nip`/`search_nips` real markdown rendering, `read_code`'s range read, `write_code`'s
  real `diffLines` diff against the prior code version, `edit_code`'s hashline operations
  listed, everything else a pretty-JSON fallback). `8338d8ea`, `26671b25`.
- The loading indicator (`DorkThinking`) disappeared mid-turn the moment the assistant emitted a
  tool-call-only (empty content) message, even though the turn was still running through the
  tool round-trip. Now shows for the whole turn, with a caption naming the in-flight tool.
  `26671b25`.
- `read_spec`/`read_examples` hit a CORS wall: GitLab's `-/raw/` file endpoint sends no
  `Access-Control-Allow-Origin` at all. Rewrote the fetcher to GitLab's API v4 raw-file endpoint
  (confirmed via curl to send `access-control-allow-origin: *`). `b60e5a67`.
- `WebxdcEmbed.tsx`'s cartridge tint mask hardcoded an unprefixed `/cartridge.png` path in an
  inline CSS mask instead of using `publicAssetUrl()` like the `<img>` right above it — broke
  under the `/ditto/` GH Pages base path. `c3937015`.
- AI chat header slid away on a scroll-past-bottom glitch: `useScrollDirection` tracks
  `window.scrollY` by default, but this page scrolls its own internal message list, so residual
  window-level scroll (e.g. from the on-screen keyboard opening) misfired the hide-on-scroll
  threshold. Added a `pinTopBar` layout option, scoped to just the top bar (not the bottom nav).
  `784f9d0c`.
- `parseQuestionsAnswerText` (parses a resolved `ask_questions` answer back into per-question
  text) split on blank lines, so a pasted multi-line or multi-paragraph answer broke the parse.
  Reworked to anchor on the `Q\d+:`/`A\d+:` markers themselves instead, folded into `26671b25`.

**Second bug-fix round, found during the 2026-08-03 final QA pass:**

- Markdown responses rendered GFM pipe-tables as literal `|`-delimited text instead of table
  markup — `react-markdown` had no `remark-gfm` plugin wired in. Added the dependency and the
  plugin to both the chat bubble and `ToolCallDetails`' markdown renderer. `07d021a0`.
- Wide tables and long code blocks inside a response could overflow the chat bubble instead of
  scrolling internally. Added `prose-pre:overflow-x-auto` and a `table` override component
  wrapping tables in their own `overflow-x-auto` div. `bff3a268`.
- The session-tab close button rendered as a second button bolted on next to the title pill
  instead of living inside it. Restructured into one pill container holding both the title
  button and the nested close button. `b0835458`.
- Follow-up polish on that same pill: the close button now only appears on hover for *inactive*
  tabs (previously always visible), the hover/active highlight covers the whole pill including
  the close button rather than just the title, and the title button's padding was tightened to
  match the close button's height so the pill reads as one consistent chip. `995e2672`.
- Switching tabs sometimes scrolled the whole browser window instead of just the message list —
  root cause of a lingering header-pin regression. `messagesEndRef.current.scrollIntoView()`
  walks every scrollable ancestor to bring its target into view; right after a tab switch
  remounts the message `ScrollArea` (its Radix-measured height hasn't settled on that first
  render), that walk can escape past the viewport and scroll the actual window, which also yanks
  the pinned mobile header through its scroll-direction listener. Fixed by scrolling the
  `ScrollArea`'s own viewport directly via `scrollTop`, matching the pattern already used by the
  sidebar `AIChatWidget`. `fa575ba6`.
- Added desktop-only left/right scroll-arrow affordances to the session tab bar for when there
  are more tabs than fit, matching the pattern already established by `SubHeaderBar`. `995e2672`.

Filed upstream (not Ditto's to fix): `nostr-canvas#2` — devkit's `edit_code` tool has the
identical `discriminatedUnion` schema bug T10.9's `nak` fix worked around.

**Tracked, not started — codebase-wide, deliberately deferred (noted 2026-08-02):** the rest of
Ditto's i18n sweep — every user-visible string wrapped in `FormattedMessage`/
`intl.formatMessage()` per AGENTS.md's i18n rule — is still needed across the whole codebase
beyond this MR's own AI-chat surfaces (T10.10 above only covers what this branch itself
introduced). User's call: do the rest as one dedicated pass later, not piecemeal per-ticket — do
not fix opportunistically inside AI-chat tickets going forward. Needs its own scoping/ticketing
pass (likely its own branch, given the blast radius) when picked up; not scoped further here.

**Tracked, not started — blocked on an external dependency (noted 2026-08-02):** the user is
porting `luacheck` to TypeScript, to eventually replace fengari-web entirely as devkit's Lua
lint engine — removing the CSP-sandboxing workaround. A sandboxed-iframe lint implementation
(`src/sandbox/luaLint/`, `useLuaLintSandbox.tsx`) was briefly added and then removed as dead code
(`6c0dfd29`) since nothing in this branch's UI ever wired it up. Once the `luacheck` port lands,
ticket the swap on `tiles-v3-widgetonly` (where Tiles UI actually lives) rather than resurrecting
the sandbox approach here — logged in that branch's `TILES_PLAN.md`. Not scoped further until
the port exists.

**Dropped, 2026-08-03:** inline `` `code` `` spans reportedly rendered the wrong text color on
certain custom themes. Investigated as far as confirming (via compiled CSS) that
`prose-code:text-foreground` wins on both specificity and source order over
`@tailwindcss/typography`'s own defaults, so the cascade story doesn't explain it — root cause
was never pinned down. User re-checked live after the second bug-fix round above and could no
longer reproduce it; not pursuing further.

---

## Human review queue

**Fully confirmed, 2026-08-03** — every item below has a live manual pass, including a
`--mode ghpages` build served under the `/ditto/` subpath for the asset-path checks:

- [x] T10.1 regression — ability toggle forks a new tab with the right system prompt/tools;
      provider switch mid-session preserves history and the next reply uses the new provider.
- [x] T10.2 — base (non-Tiles) session, dark purple theme applies end-to-end.
- [x] T10.2 regression — plain message with no tool call streams a normal reply, no console
      errors.
- [x] T10.3 — several tabs including reload; 20-tab cap close-picker dialog; auto-title resolves.
- [x] T10.3 — pause a Tiles session mid-`ask_questions`, reload, confirm it resumes and answering
      it works now that the read-only history UI + live answer UI both exist.
- [x] T10.4 — pasting a real API key auto-populates models; manual "Detect models" still works.
- [x] T10.5 — "@" dropdown shows people + "Tiles"; selecting a person inserts `nostr:npub1...`,
      selecting "Tiles" inserts plain text with no session fork.
- [x] T10.5/bugfix — short dropdown result list sits flush against the textarea both below the
      caret and flipped above it.
- [x] T10.6 — base session mentions Tiles/widget creation unprompted.
- [x] T10.7 — base session answers "what does NIP-57 define?" from a real fetched spec.
- [x] T10.8 — `/settings/ai` intro hero + accent-underlined section header (no duplicate text);
      `/settings` menu shows the AI row's illustration.
- [x] T10.9 — nak profile/hashtag lookup, confirmed working now that the schema bug is fixed.
- [x] New tool-call rendering — `set_theme`, `ask_questions`, `nak`, `read_spec`, `write_code`
      (diff view), and `edit_code` each render their tailored summary instead of a bare pill;
      unknown/fallback tools show collapsible pretty-JSON.
- [x] Loading indicator — stays visible through a full tool round-trip, caption names the
      in-flight tool.
- [x] Header-pin fix — AI chat header no longer slides away scrolling to the bottom of a long
      conversation (a lingering regression here turned out to be the tab-switch scroll-leak bug,
      not the pin logic itself — see Phase 10's second bug-fix round above).
- [x] Layout bugfix (`c5b77bb3`, predates this session) — at mobile (~390px) and desktop
      (≥900px) width, the page itself never scrolls: header, tab bar, provider/model row, and
      textarea stay pinned while only the message list scrolls underneath.
- [x] Asset-path bugfix (`0283fe23`, predates this session) — `IntroImage`s (`/settings/ai`,
      `/settings`), the letter-compose logo, and the webxdc cartridge image all load with no
      404s under a `--mode ghpages` build served at the `/ditto/` subpath.

Not this branch's scope (tile-studio, separate repo/deploy — carried over from Phase 9,
unresolved):

- [ ] Phase 9 / T9.1 — full manual AI-authoring session on tile-studio's deployed dev instance:
      ask the AI to write a trivial tile, confirm tool calls execute and code updates in the
      editor, confirm an `ask_questions` call pauses correctly and resumes on answer, with no new
      console errors.
- [ ] Phase 9 / T9.2 — click-through confirmation of the interaction-dispatch fix (`a445ac5`):
      edit a tile with a `Button`/`publish_event` handler, run the preview, confirm the click
      actually fires (the review dialog appears / the tile's own state updates) instead of doing
      nothing.

## Working agreement

- Tickets dispatched to `coder`; verification to `tester`; risky diffs get a `researcher` review
  pass. Every ticket: its repo's own test/build command green + its listed manual check before
  close.
- **TDD is the standing workflow for every ticket in Phases 8-10** (nostr-canvas/tile-studio/
  Ditto's AI-chat work): grill the specific test scope with the user before any implementation;
  write failing tests first (red, confirmed by an independent `tester` run); implement until
  green; independent verification before closing. Three-agent split (test-writer → implementer
  → verifier) per ticket, matching the pattern already exercised for nostr-canvas's Ticket D4.
- Commit per completed ticket/phase; push after each. Update this doc after every milestone —
  mark phases `done` and compact their checklists to a short summary in the same commit, per the
  plan skill's compaction rule.
