# PLAN: Tiles → Widgets + AI Chat TLC — unified

> Living plan. Delete when the effort ships. Supersedes `TILES_PLAN.md` (`tiles-v3-widgetonly`
> branch) and this branch's own former `PLAN.md`, consolidated 2026-07-31 rather than waiting
> for the merge-then-rebase dance those two docs had planned for each other. Lives on
> `ai-chat-tlc` while Phases 8-10 (below) are in progress; moves to `tiles-v3-widgetonly` once
> this branch's work is done, folding in that branch's real-time Phase 0-7 progress at the move
> — so this copy's Phase 0-7 section reflects the plan as scoped, not necessarily
> `tiles-v3-widgetonly`'s live status in the meantime. Deleted before this branch's MR reaches
> `main` (per the plan skill's normal finishing step), not carried into the merged diff.

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

## Phase 4 — Marketplace TLC — `in_progress` (on `tiles-v3-widgetonly`)

Icon-first cards, accent colors, consent dialog, click-to-expand, sort + search, unified detail
page, social signals (detail-page only), detail-page gallery/history, first-open nag. All
human-verified through T4.6 (2026-07-28). Remaining (scoped here 2026-07-31; may already be
further along on `tiles-v3-widgetonly` by the time this doc moves there):

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

## Phase 5 — Tile-claimed kinds in feeds (native generic cards) — `pending`

- [x] **T5.1 Kind collection + settings.** Done in `6b79a50e`.
- [ ] **T5.2 Generic widget-interaction card.** Native feed card: "@author used <Widget name>"
      with icon/accent, best-effort summary, link to detail page. No Lua in feeds. *Eval:*
      manual: publish a test event of a claimed kind, see the card in feed; `npm run test`.

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

## Phase 8 — nostr-canvas: `./devkit` subpath export — tracked in nostr-canvas's own `PLAN.md`

Goal: a host-agnostic library (no React) providing everything an AI agent needs to write/edit/
preview a nostr-canvas Lua tile, extracted and generalized from tile-studio's `src/lib/*`. **Full
ticket text and eval criteria live in `~/repos/nostr-canvas/PLAN.md`** (branch
`devkit-extraction`) — this section is a status pointer only, so this doc doesn't duplicate and
drift from the source of truth.

- [x] **D1 Subpath scaffolding.** Done.
- [x] **D2 AI-provider layer.** Done.
- [x] **D3 `Tool` framework + tile-authoring toolset (11 tools).** Done.
- [x] **D4 Agent loop (`AgentSession`).** Done, all 4 parts (core loop; token pruning/
      compaction; stop/abort + context-length retry; pending-host-input mechanism +
      persistence round-trip).
- [ ] **D5 `ask_questions` tool + widget-creation system prompt.** Grilled 2026-07-30, ready to
      implement. **Needs a widget-only-placement parameter/flag** added during implementation
      (grilled 2026-07-31, see Phase 10) so Ditto's copy of the shared prompt constrains the AI
      to `placement: "widget"` while tile-studio's copy stays unrestricted.
- [ ] **D6 Preview/runtime driver.** Re-grilled 2026-07-31 — **major revision from the original
      stub-adapter text**, see this doc's decision-record supersession note above. New shape:
      - `PreviewAdapter` — wraps any real `RuntimeAdapter`. `publish_event` signs for real, then
        blocks on a host-supplied review callback (publish/discard) before actually broadcasting;
        `upload_image` never touches the real adapter, returns a local blob URL; `navigate` never
        navigates, calls a host-supplied toast callback instead. Every other capability
        (`fetch`, `get_profile`, `subscribe`, `fetch_events`, `get_public_key`, `get_contacts`,
        `nip44_encrypt`/`decrypt`) passes straight through unmodified.
      - `computePreviewGrantKey(slug, declaredCaps, version)` — deterministic grant-store
        identifier; `version` lets future scheme changes invalidate old stored grants.
      - An ephemeral-identity helper (e.g. `getOrCreateEphemeralIdentity(storage)`) — generates/
        persists an nsec-backed signer via `nostr-tools` for hosts with no logged-in user.
      - `PreviewSession` — headless, stateful class. `new PreviewSession({ adapter,
        grantBackend, previewPubkey })` (adapter is the host's already-`PreviewAdapter`-wrapped
        real adapter — host wraps first, decoupled from `PreviewSession`). `build(code,
        settings, metadata)` → `{ ok: true, tileId } | { ok: false, error }`, single entrypoint,
        decides internally whether it's a full rebuild or a live settings-only update.
        `subscribe(cb)` — stable output subscription built on `TileRuntime.onTileOutput()`,
        transparently re-wires itself across rebuilds (new `tileId`). `destroy()` — full
        teardown.
      *Eval:* TBD, needs a full rewrite in nostr-canvas's own PLAN.md (the original "stub
      adapter never calls real signing" spy-assertion criteria no longer apply) — proposed:
      `PreviewAdapter` unit tests (publish blocks until review resolves; upload_image returns a
      blob URL not a real upload; navigate calls the toast callback not real navigation; every
      other capability passes through untouched); `computePreviewGrantKey` unit tests (same
      inputs → same key, different version → different key); `PreviewSession` unit tests
      (build() rebuild-vs-live-update decision; subscribe() surviving a rebuild; destroy() tears
      down cleanly).
- [ ] **D7 Release.** Grilled 2026-07-31 — **minor version bump to 0.13.0** (new devkit surface
      is substantial enough to warrant it, vs. the patch-bump pattern of 0.12.1-0.12.4).
      Otherwise unchanged: `package.json` bump + `CHANGELOG.md` entry + `chore(release): 0.13.0`
      commit + manual `npm publish` (no CI publish job exists in this repo's `.gitlab-ci.yml`).
      *Eval:* package installable from the registry; `npm view` shows 0.13.0.

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
See Human review queue below for the two manual checks still outstanding.

## Phase 10 — Ditto: AI chat "Tiles" ability — `pending`

Goal: on this branch, using the now-proven `devkit`. Gated on Phase 9 completing (validates the
library in a real app first). Each ticket below needs its own short grilling pass on exact eval
criteria immediately before dispatch, per the grilling skill and the working agreement below —
this is a scoping-level breakdown, not final ticket text.

**Branch strategy, confirmed 2026-08-02**: `ai-chat-tlc` is a small, self-contained PR that
modernizes Ditto's AI chat and merges to `main` on its own — it is not waiting on Phase 4's
marketplace work. Fact-checked before locking this in: `ai-chat-tlc` branched off
`tiles-v3-widgetonly` at `8fedcc94`, has since diverged with its own 16 commits, and
`tiles-v3-widgetonly` has moved 64 commits further past that same point (Phase 4 "Marketplace
TLC" work). `ai-chat-tlc`'s `package.json` has **no `@soapbox.pub/nostr-canvas` dependency at
all** — no `CanvasRuntimeProvider`, no marketplace tile-install/render code exists on this branch.
Once `ai-chat-tlc` merges to `main`, `tiles-v3-widgetonly` rebases on top of it, giving the
marketplace/widget work a direct path in.

This splits Phase 10 into two waves:
- **Wave A — ships in `ai-chat-tlc`, tracked below**: T10.0, T10.1, T10.2, T10.3. The "Tiles"
  ability's full tool bundle works (`read_code`/`write_code`/`ask_questions`/`read_spec`/
  `search_nips`/etc.) except live preview rendering — devkit's 12 tools only have one entry
  (`preview_tile`) that actually needs a real `RuntimeAdapter`. Genuinely useful and mergeable
  standalone.
- **Wave B — moved to `tiles-v3-widgetonly`'s own `TILES_PLAN.md`, Phase 8 (2026-08-02)**: what
  were T10.4 (preview panel), T10.5 (publish flow), T10.6 (discovery toast), and T10.7+
  (marketplace remix) now live there as T8.1-T8.4, since all four depend on infrastructure
  (`CanvasRuntimeProvider`, a real `RuntimeAdapter`, the marketplace detail page, install/publish
  plumbing) that only exists on that branch — no point tracking them here where they can't be
  dispatched. Not just deferred: fully relocated, including the grilled detail for T8.1/T8.4 and
  the inlined D6 devkit facts needed to read them without this doc. Any further grilling for those
  tickets (T8.2/T8.3 still need a pass) happens directly on `TILES_PLAN.md` going forward.

Ditto today: `useShakespeare.ts` is a raw NIP-98-authed fetch wrapper around Shakespeare's
OpenAI-compatible endpoint (no tool-calling loop of its own). `AgentSession` (devkit) takes an
already-constructed `OpenAI` client instance, not a bare API key — Ditto can hand it a client
built with a custom `fetch` that signs a fresh NIP-98 token per request, exactly like
`useShakespeare`'s existing `createNIP98Token` does, so no devkit changes are needed for
Shakespeare's per-request auth model. User-supplied providers (OpenRouter/OpenAI-compatible/
DeepSeek, own API key) use devkit's `ai-provider.ts` factory directly, as originally designed.

Execution order: T10.0 → T10.1 → T10.2 → T10.3, all of Phase 10 as tracked in this doc — Wave B
(what were T10.4-T10.7+) now lives on `tiles-v3-widgetonly`'s `TILES_PLAN.md` as T8.1-T8.4, see
the branch-strategy note above. Each ticket gets its own short grilling pass immediately before
dispatch, per the working agreement; all four below have gone through that pass and are ready to
dispatch.

- [ ] **T10.0 Provider settings (`/settings/ai`) — grilled 2026-08-02, ready to dispatch.**
      Facts confirmed first (not guessed): devkit's `AIProvider` type is `{ id, name, baseURL,
      apiKey, models }` with no persistence opinion of its own ("host apps bring their own
      settings" — `ai-provider.ts:3`); `createAIClient(provider)` returns a raw `OpenAI` client
      and special-cases OpenRouter attribution headers by checking `provider.id === "openrouter"`
      literally; devkit ships presets for `openrouter` and `openai-compatible` only, no DeepSeek
      preset (`DEFAULT_PROVIDERS`, `ai-provider.ts:32-53`); DeepSeek's own docs confirm
      `baseURL: https://api.deepseek.com`, standard OpenAI-SDK-compatible. Ditto's existing NIP-44
      blob (`useEncryptedSettings`, kind 30078) already merges per-field on write with a
      `lastSync` staleness guard, so per-profile opt-in sync is new field-level logic, not new
      sync infrastructure.

      Decisions:
      - **Storage: a new dedicated hook/store** (e.g. `useAIProviders()`), own `localStorage` key,
        reactive store mirroring tile-studio's `ai-client.ts` pattern — not an `AppConfig` field.
        Chosen over `AppConfig` specifically to keep API keys out of a broad, generally-read
        config object whose Zod schema also doubles as the build-time `ditto.json` validator.
      - **Per-profile sync toggle**: when on, that profile is included in the `useEncryptedSettings`
        NIP-44 blob as a new optional field/array entry; when off, it lives only in the new
        dedicated `localStorage` key. Toggling is per-profile, not global.
      - **Profile identity vs. devkit's `id`**: each stored profile gets its own stable UUID for
        CRUD identity (add/edit/delete/duplicate). Devkit's `AIProvider.id` (which
        `createAIClient` inspects for the literal string `"openrouter"`) is constructed separately
        at call time from the profile's `kind` field, not read from the stored UUID — otherwise
        two OpenRouter profiles couldn't have distinct CRUD identities.
      - **Model list**: a "Detect models" button (devkit's `fetchModels()`, which hits the
        provider's `/models` endpoint and filters to tool-calling-capable models) plus a manual
        text-entry fallback for providers whose `/models` endpoint is missing or unreliable.
      - **Security UX**: an inline warning next to the sync toggle when it's off — "stored
        unencrypted on this device only" (same exposure class as an unsynced `nsec`).
      - **Scope boundary**: T10.0 is profile CRUD only — no "default provider" selector on this
        page. Every chat session explicitly picks its provider/model in T10.1; there is no
        implicit default to keep in sync between two pages.
      - **Add-profile UX**: one "Add profile" button opening a form with a provider-kind dropdown
        (OpenRouter / OpenAI-compatible / DeepSeek); picking a kind pre-fills `baseURL` (and, for
        OpenRouter, the attribution-header behavior at client-construction time). Not three
        separate buttons.
      - **Shakespeare is out of scope for this page** — it's zero-config (auth via the logged-in
        user's NIP-98 signer, no API key, no profile to manage) and appears automatically as an
        always-available option in T10.1's session picker, not as a CRUD'd profile here.
      *Eval:* automated — unit tests for the new store (add/edit/delete/duplicate, per-profile
      sync-toggle behavior including the field-merge into the NIP-44 blob), component tests where
      reasonable. Manual (user will run before closing): add one profile of each kind (OpenRouter,
      generic, DeepSeek) with a real API key, use "Detect models" on each, save, reload the page,
      confirm all three persist with their models.
- [ ] **T10.1 Abilities menu + mode-scoped sessions — grilled 2026-08-02, ready to dispatch.**
      Icon button beside the chat textarea opens a popover with a checkbox list of toggleable
      abilities. Today the only real toggle is **Tiles**; base chat and `set_theme` stay
      always-on regardless of ability selection (T10.2 ports `set_theme` onto the new tool
      registry as the baseline non-tile example — it is not something the user can turn off).
      The popover is a multi-select from day one (checkboxes, not radio) so future abilities
      compose additively, even though only one is real right now.

      Checking "Tiles" immediately forks a **new session/tab** — no confirm step, no mutation of
      the current thread — with its own conversation, own system prompt (D5's widget-creation
      prompt constrained to `placement: "widget"`), and own tool bundle (devkit's 12 tools). An
      enabled ability set is **locked for that session's lifetime**: switching abilities always
      means starting a new session, never retoggling an existing one mid-thread.

      Provider/model selection is a **separate**, always-visible control — a small selector row
      near the textarea, not inside the abilities popover — listing Shakespeare (zero-config, the
      logged-in user's NIP-98 signer) plus any configured profile from T10.0. Mid-session
      provider/model switching is allowed and does not reset the conversation.

      Session creation takes an optional pre-seeded starting code/metadata argument from the
      start (not retrofitted later) — marketplace remix (T10.7+) reuses this exact "Tiles"
      ability with a target tile's existing code loaded instead of starting empty; see T10.7+ for
      the seeding mechanism.
      *Eval:* automated — component tests for the popover (toggle → fork behavior, ability-set
      lock, provider switch not resetting history). Manual (user will run before closing): toggle
      Tiles on, confirm a new tab forks with the right system prompt/tools, send a message, switch
      provider mid-session, confirm history is preserved and the next reply uses the new
      provider.
- [ ] **T10.2 Tool registry framework — grilled 2026-08-02, ready to dispatch.**
      Facts confirmed first: devkit's `Tool<TParams>` is `{ description, inputSchema?: ZodType,
      execute(args): Promise<ToolResult> }` (`devkit/tool.ts`), with a standalone
      `toolToOpenAI(name, tool)` that auto-derives the JSON-schema `parameters` object from the
      zod `inputSchema` — no more hand-written `parameters` blocks like today's `set_theme`.
      `AgentSession` takes `tools: { name: string; tool: Tool }[]` and dispatches incoming
      `tool_calls` by name (`agent-session.ts:214,447,558`). Today's `AIChatPage.tsx` runs its own
      hand-rolled loop (`useToolExecutor`, synchronous JSON-string returns) — it does not use
      `AgentSession` at all yet.

      Decisions:
      - **Tool construction**: factory functions returning devkit `Tool` objects (e.g.
        `createSetThemeTool(applyCustomTheme): Tool`), mirroring devkit's own pattern
        (`ReadCodeTool`/`WriteCodeTool` take closures in their constructor). A `useToolRegistry()`
        hook calls these factories with live values from hooks like `useTheme()` and assembles the
        final `{ name, tool }[]` bundles.
      - **Ability → bundle mapping**: a **base** bundle (always included — currently just
        `set_theme`) plus per-ability bundles, concatenated. A session's final `tools` array =
        base + (selected ability's bundle, if any). Devkit's 12 tools become the "tiles" ability's
        bundle. Matches T10.1's "set_theme always on regardless of ability" decision directly.
      - **Execution engine**: full migration onto `AgentSession` for *every* session, not just
        Tiles — base chat becomes an `AgentSession` with just the base bundle and no pause/resume
        tools, same code path as Tiles with a smaller bundle. Replaces `useToolExecutor` and the
        current hand-rolled loop entirely; one execution engine going forward instead of two.
      - **System-prompt cleanup**: drop the hand-written paragraph in `buildSystemPrompt()` that
        manually re-explains `set_theme`'s parameters — the tool's own `description` field (fed to
        the model via `toolToOpenAI`) is the single source of truth going forward, removing a
        duplication/drift risk between prompt text and tool schema.
      *Eval:* automated — unit tests for the registry (base + ability concatenation, factory
      construction) and for `set_theme`'s ported `Tool` implementation (same validation/behavior
      as today's `useToolExecutor` case). Manual (user will run before closing): ask base chat (no
      Tiles ability) to set a dark purple theme, confirm it still applies end-to-end through the
      new registry + `AgentSession` path.
- [ ] **T10.3 Tabs + local history — grilled 2026-08-02, ready to dispatch.**
      Facts confirmed first: `AgentSession` has a `serialize()`/`deserialize()` pair
      (`agent-session.ts:599-615`) capturing `messages` + `pendingInput` + `pendingToolCalls` —
      not just the message array — plus a lower-level `loadMessages()`/`getMessages()` pair. The
      former is the correct persistence primitive: it round-trips a mid-flight `ask_questions`
      pause, not just plain chat history.

      Decisions:
      - **Persistence**: one `localStorage` entry per tab holding that tab's `SerializedSession`
        blob, written on every message/state change.
      - **Tab switching model**: every open tab keeps a **live** `AgentSession` instance in
        memory. Switching tabs is a UI focus change only, no reconstruction — a background tab's
        in-flight streaming response keeps running and finishes even while another tab is active.
        A fresh page load reconstructs all open tabs' instances from their `localStorage` blobs
        via `deserialize()`.
      - **Tab bar**: horizontal, closable, scrollable, capped at **20 open tabs**. Hitting the cap
        while creating a 21st does **not** silently close anything — it prompts the user with a
        quick-select UI to choose which existing tab(s) to close to make room. Separately, any tab
        untouched for **30 days** is auto-deleted on next app load (silent, no prompt — this is
        housekeeping, not a "someone changed my thing" event the cap-hit prompt is protecting
        against).
      - **Close semantics**: hard delete — closing a tab removes its `localStorage` entry
        immediately. The tab bar is the only history surface for this ticket; no separate
        "recently closed" recovery UI.
      - **Auto-title**: LLM-generated, not truncation. A fixed, cheap/fast utility model on the
        Shakespeare endpoint, independent of whichever provider/model the session itself uses.
        **Exact model ID not yet confirmed** — verify against Shakespeare's live model list at
        implementation time rather than hardcoding a guess. Fires once after the first full
        exchange (user message + assistant reply) completes, runs in the background; the tab shows
        a placeholder/spinner title until it resolves.
      *Eval:* automated — unit tests for the persistence layer (serialize/deserialize round-trip
      including a pending-input state, cap-hit prompt trigger, 30-day pruning). Manual (user will
      run before closing): open several tabs including a Tiles session with a pending
      `ask_questions` pause, reload the browser, confirm every tab reappears with history intact
      and the paused Tiles session resumes correctly.
*(The original T10.4-T10.7+ and the Wave B "Open items" list used to be here — moved to*
*`tiles-v3-widgetonly`'s `TILES_PLAN.md`, Phase 8, as T8.1-T8.4, 2026-08-02. See the branch-*
*strategy note above. The T10.4-T10.8 below are new tickets added 2026-08-02, unrelated to and*
*renumbered independently of that relocated set.)*

**New tickets (grilled 2026-08-02), added after Wave A's initial four shipped.** Dependency
note: T10.6/T10.5/T10.7 all read from T10.2's tool-registry/ability-bundle machinery, so they
can't dispatch until T10.2 resumes (currently paused for user review). T10.4 and T10.8 have no
such dependency and can dispatch independently, any time.

- [ ] **T10.4 Provider profile: auto-detect models on API key entry.** Keeps T10.0's manual
      "Detect models" button; additionally auto-fires `fetchModels()`, debounced (~600-800ms
      after the last keystroke/paste), once both `apiKey` and `baseURL` are non-empty. A failed
      auto-attempt surfaces through the same inline status/error UI a manual click would use —
      not a silently swallowed failure — and never blocks a manual retry via the button.
      *Eval:* unit test for the debounce trigger (fires once N ms after the last change; doesn't
      fire on a `baseURL`-only or unrelated field change). Manual (user will run before
      closing): paste a real API key into a new profile form, confirm models populate without
      touching the button.
- [ ] **T10.5 @-mention autocomplete: people + abilities, in the AI chat textarea.** Facts
      confirmed: Ditto already has `MentionAutocomplete` (`src/components/MentionAutocomplete.tsx`,
      used by `ComposeBox.tsx`) — a self-contained, textarea-caret-aware `@`-trigger dropdown
      backed by `useSearchProfiles`, inserting `nostr:npub1...` on selection. No equivalent
      exists for abilities.
      - Extend `MentionAutocomplete` in place (don't fork it — its caret-position math in
        `getCaretCoordinates`/`MIRROR_PROPS` is nontrivial and shouldn't be duplicated) with an
        optional abilities list merged into the same query-filtered dropdown under the same "@"
        trigger.
      - Selecting an ability inserts a plain-text token (e.g. `@Tiles`) into the message — no
        side effect, no session fork, no ability actually toggling on. Same semantic weight as
        an inline @person mention: a reference, not an action. (This is the default I'm
        choosing; flag if you actually want selecting an ability to enable it.)
      - Ability list source: the same registry T10.6 reads for its system-prompt manifest — one
        source of truth for "what abilities exist," not two hardcoded lists.
      *Eval:* unit test extending `MentionAutocomplete`'s existing coverage for the merged-list
      case (abilities filtered by query, inserted as plain text, people mentions unaffected).
      Manual (user will run before closing): type "@" in the AI chat textarea, see both people
      and "Tiles" in the dropdown, selecting each inserts the right text.
- [ ] **T10.6 Ability/skill manifest for AI discoverability.** The base system prompt (every
      session, regardless of which abilities are enabled) includes a short manifest — name +
      one-line description — of every registered ability, so the AI can proactively mention e.g.
      "you can enable Tiles to build a sidebar widget" without that ability's tools being loaded.
      Single source of truth: the same registry the abilities popover (T10.1) and tool bundle
      concatenation (T10.2) already read from — adding a future ability automatically shows up
      in the popover, the manifest, and (via T10.5) the mention dropdown, from one registration
      point.
      *Eval:* unit test asserting the base system prompt string contains every registered
      ability's name + description. Manual (user will run before closing): in a base
      (non-Tiles) session, ask "what can you help me with in Ditto?", confirm the reply
      mentions Tiles/widget creation without the tool having been called.
- [ ] **T10.7 Promote NIP lookup tools to the base tool bundle.** Facts confirmed: devkit's
      `SearchNIPsTool` (kind 30817 community NIPs — the same kind NostrHub itself uses,
      `wss://relay.ditto.pub` among its relays) and `FetchNIPTool` (official NIPs from
      `nostr-protocol/nips` on GitHub — same source NostrHub uses for official specs) already
      exist and are already imported into `AIChatPage.tsx`'s `TILES_TOOLS`, but gated behind the
      Tiles ability only.
      Decision: move both into the **base** bundle (T10.2's "always included" set alongside
      `set_theme`) so NIP lookups work in any session, Tiles enabled or not — this is the whole
      of the "look up NIPs from NostrHub" ask; no new tool code needed, just a bundle move.
      *Eval:* unit test — base bundle includes both tools regardless of ability selection.
      Manual (user will run before closing): in a base (non-Tiles) session, ask "what does
      NIP-57 define?", confirm the AI calls `fetch_nip` and answers from the real spec text.
- [ ] **T10.8 `/settings/ai` design audit + polish.** Research-then-implement split (per the
      plan skill's "one cohesive unit, phased internally" carve-out — same screen, same
      mechanical design pass). First phase (this ticket): dispatch a `researcher` audit of
      `SettingsAIPage.tsx` against the Design Standards section of `AGENTS.md` (8px grid,
      typography hierarchy, empty/loading states, spacing/visual consistency with sibling
      settings pages like `/settings/network` or `/settings/magic`), returning a concrete punch
      list rather than vague "make it nicer" notes. The implementation pass is a follow-up
      ticket once the punch list exists — not written yet.
      *Eval:* the punch list itself is the deliverable — user reviews it and either approves it
      for an implementation ticket or redirects specific items.

- [ ] **T10.9 `nak` tool: general read-only Nostr network access, base bundle.** Facts
      confirmed: devkit's 12 tools have no generic query/profile-lookup tool — `search_nips`/
      `fetch_nip` are the only Nostr-touching tools, both single-purpose. Ditto's own
      `useNostr()` (`@nostrify/react`) exposes `nostr.query(filters, { signal })`, the standard
      pattern used by ~50 existing hooks; `nostr-tools@2.13.0` (already a dependency) provides
      NIP-19 encode/decode.
      Decision: one tool, `nak` (named after the real `nak` CLI), added to the **base** bundle
      (always available, same tier as `search_nips`/`fetch_nip`), built with a discriminated
      action parameter: `req` (query events by kinds/authors/tags/since/until/limit, capped
      result count + content-snippet truncation like `search_nips` already does), `fetch` (a
      single event by id, hex or `note1`/`nevent1`), `profile` (kind-0 metadata by pubkey/
      `npub1`), `decode`/`encode` (NIP-19 utilities). Built on Ditto's own `useNostr()` client
      (via `useToolRegistry()`'s existing live-hook-value pattern), not a bare `SimplePool` —
      reuses the app's real relay pool/session rather than a second one.
      **Explicitly excluded from v1: publish/sign.** An AI-invoked tool call has no per-call
      user confirmation surface today (unlike a tile's `publish_event`, which is a deliberate,
      visible action in the UI) — read-only queries only, this ticket does not add any way for
      the AI to publish events.
      *Eval:* unit tests for each action (req/fetch/profile/decode/encode) against a mocked
      `nostr.query`; base-bundle membership test alongside the existing NIP tools. Manual (user
      will run before closing): in a base session, ask "look up npub1... 's profile" or "find
      recent kind 1 notes tagging #nostr", confirm the AI calls `nak` and answers from real data.

**Tracked, not started — codebase-wide, deliberately deferred (noted 2026-08-02):** a full i18n
sweep — every user-visible string wrapped in `FormattedMessage`/`intl.formatMessage()` per
AGENTS.md's i18n rule — is needed across the whole Ditto codebase, not just this branch's AI
chat work. Surfaced because `AIChatPage.tsx` has zero `FormattedMessage` usage across its entire
T10.0-T10.3 history (pre-existing gap, not introduced by any single ticket here) and T10.3 added
a couple more plain strings on top of it. User's call: do this as one dedicated pass later, not
piecemeal per-ticket — do not fix opportunistically inside AI-chat tickets going forward. Needs
its own scoping/ticketing pass (likely its own branch, given the blast radius) when picked up;
not scoped further here.

**Tracked, not started — blocked on an external dependency (noted 2026-08-02):** the user is
porting `luacheck` to TypeScript, to eventually replace fengari-web entirely as devkit's Lua
lint engine — removing the CSP-sandboxing workaround (`src/sandbox/luaLint/`,
`useLuaLintSandbox.tsx`) added this session, not just papering over it. Once that port lands,
ticket the swap: point `lua-lint.ts`'s `overrideEngine` seam (added for exactly this kind of
pluggable-backend swap) at the new library, then retire the sandbox infra. Not scoped further
until the port exists.

---

## Human review queue

- [ ] Phase 9 / T9.1 — full manual AI-authoring session on tile-studio's deployed dev instance:
      ask the AI to write a trivial tile, confirm tool calls execute and code updates in the
      editor, confirm an `ask_questions` call pauses correctly and resumes on answer, with no new
      console errors.
- [ ] Phase 9 / T9.2 — click-through confirmation of the interaction-dispatch fix (`a445ac5`):
      edit a tile with a `Button`/`publish_event` handler, run the preview, confirm the click
      actually fires (the review dialog appears / the tile's own state updates) instead of doing
      nothing.
- [ ] T10.2 — base (non-Tiles) session, ask it to set a dark purple theme, confirm it applies
      end-to-end through the new registry + `AgentSession` path.
- [ ] T10.2 regression — general chat still works after the `useToolExecutor` deletion: send a
      plain message with no tool call, confirm a normal reply streams in with no console errors.
- [ ] T10.3 — open several tabs including a Tiles session paused mid-`ask_questions`, reload the
      browser, confirm every tab reappears with history intact and the paused session resumes
      correctly on answering.
- [ ] T10.3 — hit the 20-tab cap creating a 21st tab, confirm the close-picker dialog appears
      (nothing closes silently); confirm a tab's title goes from spinner/placeholder to a real
      LLM-generated title after the first exchange completes.
- [ ] T10.4 — paste a real API key into a new/existing provider form, confirm models populate
      without touching "Detect models"; confirm the manual button still works as a retry.
- [ ] T10.5 — type "@" in the AI chat textarea, confirm people and "Tiles" both appear in one
      dropdown; confirm selecting a person inserts `nostr:npub1...` and selecting "Tiles" inserts
      plain `@Tiles` text with no side effect (no session fork).
- [ ] T10.5/bugfix — with a short (1-3 item) dropdown result list, confirm it sits flush against
      the textarea with no gap, both when it renders below the caret and when it flips above
      (try near the top and bottom of the viewport).
- [ ] T10.6 — base (non-Tiles) session, ask "what can you help me with in Ditto?", confirm the
      reply mentions Tiles/widget creation without the tool having been called.
- [ ] T10.7 — base (non-Tiles) session, ask "what does NIP-57 define?", confirm the AI calls
      `fetch_nip` and answers from the real spec text.
- [ ] T10.9 — base session, ask it to look up a known npub's profile, and separately ask it to
      find recent kind-1 notes tagging a hashtag; confirm both answer from real relay data (not a
      hallucinated answer) via the `nak` tool.
- [ ] Layout bugfix (`c5b77bb3`) — at mobile width (~390px) and desktop width (≥900px), confirm
      the page itself never scrolls: header, tab bar, provider/model row, and textarea stay
      pinned while only the message list scrolls underneath. Check both the empty-chat state and
      a long conversation.
- [ ] Asset-path bugfix (`0283fe23`) — build with `--mode ghpages` (or check the deployed GitHub
      Pages preview) and confirm `IntroImage`s, the letter-compose logo, and the webxdc cartridge
      image all load instead of 404ing.
- [ ] T10.1 regression (re-check after T10.2's rewrite) — toggle an ability on, confirm a new
      tab forks with the right system prompt/tools; switch provider mid-session, confirm history
      is preserved and the next reply uses the new provider.

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
