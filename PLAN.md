# AI Chat TLC — extensible, tool-calling, tab-based AI chat with tile vibecoding

**Branch:** `ai-chat-tlc` (Ditto), branched from `origin/main` @ `c979b21f`, independent of
`tiles-v3-widgetonly`. Intent (user, 2026-07-28): this branch/MR merges to `main` **before**
the Tiles work. Once merged, the Tiles MR gets rebased to start from the new `main` so both
efforts land cleanly without one blocking the other in review.

This effort spans three repos. This is the single tracking doc for all of them (matching the
precedent set by the Tiles plan's wikipedia-tile subsection) — each ticket below states which
repo it touches.

- `~/repos/nostr-canvas` (`@soapbox.pub/nostr-canvas`, currently 0.12.4) — gains a new
  `devkit` sub-export: a host-agnostic library for building AI agents that write/edit/preview
  nostr-canvas Lua tiles.
- `~/repos/tile-studio` — its AI-authoring IDE gets rewritten to consume `devkit` instead of
  its own local `src/lib/*` implementation, proving the extraction actually works before Ditto
  touches it.
- `~/repos/ditto` (this repo, branch `ai-chat-tlc`) — the existing `/ai-chat` page (currently a
  single ephemeral conversation with one hardcoded tool) is evolved in place into a tabbed,
  multi-session, tool-extensible chat, with tile-vibecoding (via `devkit`) as the first real
  "someone else added a tool" example.

## Decision record (grilled 2026-07-28)

- **Sequencing is intentional**: build `devkit` in nostr-canvas first → rewrite tile-studio's
  client to use it (validates the extraction in a real, already-working app) → *then* bring
  the proven library into Ditto. Do not skip straight to Ditto integration.
- **AI backend in Ditto**: both Shakespeare (Ditto's existing NIP-98 proxy, no user API keys)
  **and** user-supplied OpenAI-compatible providers (own API key, like tile-studio's settings
  panel today). Needs new settings UI in Ditto; provider configs + keys are small/bounded, held
  in `localStorage` (no encryption, matching tile-studio's own posture — see open question below).
- **Library home**: a new `./devkit` subpath export of the existing main `@soapbox.pub/nostr-canvas`
  package (not a separate `packages/devkit` workspace package, not a new repo, not its own
  `package.json`/version) — always in lockstep with the main package's version. Published as
  part of nostr-canvas's normal release (same pipeline exercised for 0.12.3/0.12.4 — bump
  version, `npm publish`).
- **React hook**: devkit ships **no** React hook. It's a plain, framework-agnostic TS library —
  no `react` peer dependency, no `./devkit/react` subpath. Each consuming host (tile-studio,
  Ditto) writes its own thin hook around the core class, adapted to that app's own state model.
  This makes devkit a pluggable piece usable by any host, React or not.
- **devkit v1 tool list**: all 11 of tile-studio's tools minus the 2 already cut (lint,
  capability-nudge) — `read_code`, `write_code`, `edit_code`, `read_spec`, `read_examples`,
  `search_nips`, `fetch_nip`, `set_tile`, `get_tile`, `preview_tile`, `set_notes`. Confirmed, no
  further scoping needed for T1.3.
- **Live preview**: yes, in v1 (tile-studio's live-updating preview-as-you-edit experience,
  not deferred).
- **Preview runtime isolation**: the chat's preview mounts its **own separate**
  `NostrCanvasProvider` tree (own worker, own wasm load) — never shares Ditto's app-wide
  `CanvasRuntimeProvider` that hosts the user's real installed tiles. Costs a second wasm
  worker while a preview tab is open; a broken/malicious draft can never touch real installed
  tiles' state.
- **Preview adapter identity**: **stub adapter** (tile-studio's own `StubAdapter` pattern) —
  fake all-zeros pubkey, no-op/fake signing and encryption, real relay reads, real `ctx.fetch`.
  An AI-authored draft can never trigger real signing, publishing, or encryption against the
  user's actual key during preview. Trade-off accepted: identity-dependent tile behavior (e.g.
  "show my own profile") previews as inert/fake.
- **Chat history**: **local-only**, no cross-device Nostr sync for v1 (explicitly *not* reusing
  the `useEncryptedSettings` kind-30078 pattern — that single-blob-rewritten-on-every-write model
  doesn't fit growing transcripts anyway). Sessions/tabs and messages persist in `localStorage`.
- **Chat surface**: **evolve `/ai-chat` (`AIChatPage.tsx`) in place** — no new parallel page.
  Tabs = sessions; every session can use any registered tool (existing `set_theme` plus the new
  `devkit` tile-authoring toolset); one system-prompt/tool-registry framework for both.
- **Static analysis**: **skip for v1.** No luacheck-via-wasmoon port, no capability-detection
  nudging. The live preview runtime itself is the only correctness signal (same as how a broken
  tile fails today). Revisit later if AI-authored Lua quality proves to be a real problem.
- **Tabs UI**: horizontal (chat column is narrow), closable, scrollable on overflow. Exact
  interaction details (new-tab affordance, auto-title-from-first-message, rename, max tabs) are
  proposed per-ticket below, not separately grilled — low-risk UI defaults, correct on review.
- **Extension mechanism** (working assumption, not explicitly grilled — flag if wrong): "easy
  for others to add tools" means a clean **source-level** extension point for Ditto contributors
  (a `Tool` implementation + one line in a central registry file), not a runtime/dynamic plugin
  loader. Ditto is a compiled SPA; there's no live third-party plugin surface today.

## Open questions (not yet resolved — surface before the relevant ticket starts)

- Provider API keys in `localStorage`: plaintext, matching tile-studio's own posture (a pure
  client-side dev tool). Ditto is a browser extension target with `nsec` already in
  `localStorage` under the same threat model (nostr-security skill) — is a third-party LLM API
  key at the same risk tier acceptable, or does it need something better (still local-only, but
  e.g. gated behind a "these are stored in plaintext" warning)? Confirm before T3.1.

## Working conventions for this effort

Everything else in the root `AGENTS.md`/skills applies as normal (dispatch to `coder`/`tester`/
`researcher`, `npm run test` gate in Ditto, commit per ticket, independent verification before
closing a ticket). Phase 1/2 work happens in the other two repos directly (not through Ditto's
`npm run test`) — each of those tickets' eval criteria should specify that repo's own test/build
command once nailed down.

**TDD is the standing workflow for every ticket in every phase** (grilled 2026-07-28): before any
implementation, grill the specific test scope for that ticket with the user; write the failing
tests first (red); implement until green; close with a manual review checklist. Each ticket's
own `*Eval:*` line names what the tests must cover — it does not restate this process.

**Three-agent split per ticket**, so the primary session's own verification burden stays small
(read the test diff + the tester's report, rather than re-running everything by hand):
1. **Test-writer** (`coder`, dispatched with only the ticket spec + grilled test scope, no
   implementation to peek at) writes the failing test file(s). Confirmed red via a `tester` run
   before moving on — a test suite that's green before any implementation exists is a bug in the
   tests themselves.
2. **Implementer** (`coder`, given the ticket spec + the now-frozen test files, forbidden from
   editing the tests) writes code until the suite is green.
3. **Verifier** (`tester`) runs the full relevant suite/build/lint (not just the new tests) and
   reports pass/fail with any failure detail.

The primary session's own independent-verification duty (per root `AGENTS.md`) is satisfied by
reading the test-writer's actual test file (a concrete artifact, not a self-report) and the
verifier's real run output — not by re-deriving either from scratch.

Goal: a host-agnostic library (no React required for the core, React bindings as an optional
subpath) providing everything an AI agent needs to write/edit/preview a nostr-canvas Lua tile,
extracted and generalized from tile-studio's already-mostly-pure `src/lib/*`.

- [ ] **T1.1 Workspace scaffolding.** Add `packages/devkit` to `pnpm-workspace.yaml`; new
      `package.json` (name TBD — propose `@soapbox.pub/nostr-canvas-devkit` or a subpath of the
      main package, confirm naming with user) depending on the existing nostr-canvas package via
      `workspace:*`; `openai`, `zod`, `zod-to-json-schema` as deps. Empty `src/index.ts` +
      build/test wiring matching the main package's conventions (tsc, vitest).
      *Eval:* TBD with user before dispatch — proposed: `pnpm -w build` succeeds, new package
      produces output, existing main-package tests still pass.
- [ ] **T1.2 Port the AI-provider layer.** `AIProvider`/`AIModel` types, default-providers list,
      `createAIClient`, `fetchModels`, `isAnthropicModel`, the reactive settings store — generalized
      to not assume tile-studio's own settings shape (host provides its own persistence).
      *Eval:* TBD — proposed: unit tests for `createAIClient`/`fetchModels`/`isAnthropicModel`
      ported/adapted from tile-studio's own (if any), no React import in this module.
- [ ] **T1.3 Port the `Tool` framework + tile-authoring toolset.** `Tool` interface,
      `toolToOpenAI`, hashline utilities, and the 11 in-scope tools (see open question above for
      the exact list) — `read_spec`/`read_examples` re-sourced from nostr-canvas's own bundled
      `./tips/*` export (matching the installed version) instead of tile-studio's separate
      bundling step.
      *Eval:* TBD — proposed: unit test per tool's `execute()` against a fixture tile state;
      `read_spec` test confirms it reads the *installed* package's TIP files, not a copy.
- [ ] **T1.4 Port the agent loop.** Generalize `useAISession`'s 700-line `runTurns` logic into a
      framework-agnostic class/function (event-driven, no `useState`/`useCallback`), with token
      pruning/dedup logic retained (compaction still matters even without static analysis).
      Ship a React hook wrapper if T1's open question resolves that way.
      *Eval:* TBD — proposed: unit tests simulating a multi-turn tool-calling exchange with a
      mocked OpenAI client (no real API calls in CI).
- [ ] **T1.5 Port the preview/runtime driver.** `StubAdapter` + "build tile-def event from
      source, register into a fresh isolated runtime, get output, tear down on next edit" as a
      headless function, independent of tile-studio's `TilePreviewCard` React component.
      *Eval:* TBD — proposed: a test that builds a trivial tile from Lua source, drives the
      preview function, and asserts an output node comes back; manual smoke-test once T2 wires
      it into tile-studio's client.
- [ ] **T1.6 Release.** Version bump + `npm publish`, matching the 0.12.3/0.12.4 pipeline exercised
      today.
      *Eval:* package installable from the registry; `npm view` shows the new version.

## Phase 2 — `tile-studio`: rewrite the client on `devkit` — `pending`

Goal: prove the extraction by making tile-studio itself a `devkit` consumer, deleting the local
code it replaces (no parallel implementations left behind).

- [ ] **T2.1 Swap the provider layer.** `ai-client.ts` usages → `devkit`'s equivalents; delete
      the local copy once nothing references it.
      *Eval:* TBD — proposed: tile-studio's own existing test suite (if any — confirm during
      ticket) still passes; manual: model selector still lists providers/models.
- [ ] **T2.2 Swap the tool framework + agent loop.** `useAISession` → the `devkit` agent loop
      (+ React hook if shipped); the 11 ported tools replace tile-studio's local
      `src/lib/tools/*`; delete the local copies.
      *Eval:* TBD — proposed: manual end-to-end session in tile-studio's editor: ask the AI to
      write a trivial tile, confirm tool calls execute and code updates.
- [ ] **T2.3 Swap the preview driver.** `TilePreview.tsx`'s bespoke `StubAdapter` +
      fresh-runtime-per-edit logic → `devkit`'s headless preview function, keeping
      `TilePreviewCard`'s React rendering but driven by the shared function.
      *Eval:* TBD — proposed: manual: live preview still updates as the AI edits code in
      tile-studio, matching pre-rewrite behavior.
- [ ] **T2.4 Cleanup.** Remove now-dead local files; confirm no leftover duplicate
      implementations; update tile-studio's own package.json deps.
      *Eval:* `git diff --stat` shows net deletions in `src/lib/`; build passes.

## Phase 3 — `ditto`: evolve `/ai-chat` into tabbed, extensible, tile-capable chat — `pending`

Goal: on this branch, using the now-proven `devkit`. Sub-tickets TBD in detail (each needs its
own short grilling pass on eval criteria before dispatch, per the plan skill) — placeholder
breakdown below, to be refined into full tickets before Phase 3 starts:

- [ ] **T3.0 Experimental gate + AI settings entry.** New "Experimental" collapsible in
      `AdvancedSettings.tsx` (same Collapsible pattern as System/Language/Currency/Sentry) with a
      "Custom AI" toggle → `config.experimentalCustomAI: boolean` (AppConfig triple: interface +
      Zod + default `false`). New `settingsSections` entry (`id: 'ai'`, `path: '/settings/ai'`,
      illustration `/ai-intro.png` — placeholder curled from an MDI robot icon via Iconify +
      ImageMagick, `31151932`-style intro image, user will replace with real art later), filtered
      into `visibleSections` only when `config.experimentalCustomAI` is true (same gating pattern
      as `magicMouse`/the Magic section).
- [ ] **T3.1 AI provider profiles CRUD (`/settings/ai`).** List UI (RelayListManager's add/
      remove-list pattern) of provider profiles. Each profile: type = **OpenRouter** / **OpenAI-
      compatible** (generic, user supplies base URL) / **DeepSeek** — the first and third are
      presets with a fixed base URL, only the API key is entered; "OpenAI-compatible" is fully
      generic (base URL + key). Multiple profiles of any type allowed. Each profile has a
      **"Sync via encrypted settings" checkbox**: when on, the profile (including its API key)
      is folded into the existing `EncryptedSettings` blob (`useEncryptedSettings`, kind 30078,
      NIP-44-to-self) as a new bounded field — fine for this data since profiles are small,
      unlike chat transcripts; when off, the profile lives in `localStorage` only. Resolves the
      earlier open question about key-storage risk tier: sync is opt-in per profile, not
      all-or-nothing.
- [ ] **T3.1b Mid-session provider/model switcher.** Dropdown near/below the chat textarea in
      `AIChatPage.tsx`, listing Shakespeare (always available, zero-config) plus every configured
      profile (synced + local, merged). Selectable mid-session — switching does not reset the
      conversation; the next turn just calls the newly selected provider/model. Depends on T3.1
      (profiles must exist) and `devkit`'s provider abstraction supporting a live client swap.
- [ ] **T3.2 Tool registry framework.** Generalize `AIChatPage.tsx`'s single hardcoded
      `set_theme` tool into a registry others can append to; wire `devkit`'s `Tool` interface as
      the shape; port `set_theme` itself onto the new framework as the first non-tile example.
- [ ] **T3.3 Tabs + local history.** Horizontal, closable, scrollable session tabs; `localStorage`
      persistence; auto-title from first message.
- [ ] **T3.4 Tile-authoring toolset wired in.** `devkit`'s 11 tools registered as an available
      tool bundle for chat sessions — the concrete "vibecoding" capability.
- [ ] **T3.5 Isolated preview panel.** `devkit`'s preview driver mounted in its own
      `NostrCanvasProvider` tree inside the chat UI, per the isolation decision above.
- [ ] **T3.6 Publish flow.** Once an AI-authored tile looks right in preview, a path to actually
      publish it as a real kind 30207 event (presumably reusing existing marketplace
      publish/install plumbing) — needs its own scoping pass.

## Phase 4 — Merge, then rebase `tiles-v3-widgetonly` — `pending`

Goal: land this effort on `main`, then bring the Tiles branch/MR forward onto it, ending with a
single living plan doc again (this one — the Tiles branch's own `PLAN.md`, tracking Phases 1–8
of the Tiles/Widgets effort, does not carry forward as a second file).

- [ ] **T4.1 Merge `ai-chat-tlc` to `main`.** Standard MR review/merge once Phases 1–3 are done
      and this repo's `npm run test` is green.
      *Eval:* merged; `main` contains this work.
- [ ] **T4.2 Combine the two plan docs.** First step of the rebase, before touching any code:
      starting from `tiles-v3-widgetonly`'s current `PLAN.md` (Phases 1–8 of the Tiles/Widgets
      effort, several already `done`), fold in whatever is still relevant from this file (this
      PLAN.md's own effort will be fully `done` by this point, so it collapses to a short
      historical summary per the plan skill's compaction rule, appended as a new
      already-`done` phase in the Tiles doc — not kept as a separate file). Commit the combined
      `PLAN.md` as the first commit of the rebase.
      *Eval:* exactly one `PLAN.md` exists after this ticket; it reads as self-contained per the
      plan skill's own bar (someone with no other context can follow it).
- [ ] **T4.3 Rebase `tiles-v3-widgetonly` onto the new `main`.** Standard rebase (or a fresh
      branch cut from the new `main` with the Tiles commits reapplied, whichever produces a
      cleaner history — decide at the time) so the Tiles MR is based on top of this work instead
      of the old, now-stale `main`.
      *Eval:* `git merge-base main tiles-v3-widgetonly` (or its successor branch) equals the new
      `main` tip; `npm run test` still green post-rebase.

## Working conventions for this effort

Everything else in the root `AGENTS.md`/skills applies as normal (dispatch to `coder`/`tester`/
`researcher`, `npm run test` gate in Ditto, commit per ticket, independent verification before
closing a ticket). Phase 1/2 work happens in the other two repos directly (not through Ditto's
`npm run test`) — each of those tickets' eval criteria should specify that repo's own test/build
command once nailed down.
