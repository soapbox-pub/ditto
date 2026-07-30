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
  panel today). Needs new settings UI in Ditto; provider configs + keys are small/bounded. Storage
  risk-tier question resolved in T3.1: sync is opt-in per profile via the existing NIP-44
  encrypted-settings blob, plaintext `localStorage` otherwise (matching tile-studio's own posture
  for the non-synced case).
- **Library home**: a new `./devkit` subpath export of the existing main `@soapbox.pub/nostr-canvas`
  package (not a separate `packages/devkit` workspace package, not a new repo, not its own
  `package.json`/version) — always in lockstep with the main package's version. Published as
  part of nostr-canvas's normal release (same pipeline exercised for 0.12.3/0.12.4 — bump
  version, `npm publish`).
- **React hook**: devkit ships **no** React hook. It's a plain, framework-agnostic TS library —
  no `react` peer dependency, no `./devkit/react` subpath. Each consuming host (tile-studio,
  Ditto) writes its own thin hook around the core class, adapted to that app's own state model.
  This makes devkit a pluggable piece usable by any host, React or not.
- **Transport-agnostic guardrail** (grilled 2026-07-28): beyond tile-studio/Ditto, the user
  intends to build other bots on devkit later — concretely, a bot for Armada/Concord (Soapbox's
  E2E-encrypted, serverless Nostr community-chat protocol), which would feed decrypted channel
  messages into `AgentSession` and publish its output as gift-wrapped events, with no browser UI
  at all. The current `getSnapshot()`/`subscribe()`-driven design (no assumed UI, no assumed
  request/response timing) already accommodates this — confirmed no design change needed. Kept
  as a standing constraint during T1.3/T1.4 implementation: no tool or agent-loop output should
  assume a rendered chat UI is consuming it (e.g. hashline diffs/markdown formatting are a
  presentation concern for the *host* to apply, not baked into what devkit returns).
- **devkit v1 tool list**: all 11 of tile-studio's tools minus the 2 already cut (lint,
  capability-nudge) — `read_code`, `write_code`, `edit_code`, `read_spec`, `read_examples`,
  `search_nips`, `fetch_nip`, `set_tile`, `get_tile`, `preview_tile`, `set_notes`. Confirmed, no
  further scoping needed for T1.3. Plus a 12th tool added later (grilled 2026-07-30): see
  `ask_questions` below.
- **`ask_questions` tool + requirements-gathering workflow** (grilled 2026-07-30): the tile-
  authoring toolset gains a 12th tool, `ask_questions` — the AI calls it with a small batch
  (3-5) of short, plain-English clarifying questions (optionally with a few suggested
  multiple-choice-style answers, matching this environment's own `question` tool UX) to pause
  the turn and collect structured answers before writing any code. Single blocking call
  carrying the whole batch, not one call per question. This requires `AgentSession` (T1.4) to
  expose a generic "pending host input" tool-result state (not hardcoded to this one tool) —
  a tool's `execute()` can pause a turn, surface structured data via `getSnapshot()` for the
  host UI to render, and resume once the host supplies an answer. Refined 2026-07-30 to be
  persistence-safe: since chat sessions are `localStorage`-persisted and reloadable mid-
  conversation (see the "chat history" decision above), and OpenAI's tool-calling protocol
  requires every `tool_calls` entry get a matching `tool`-role result before the model can be
  called again, the pending state cannot be an in-memory-only suspended `Promise` (that would
  orphan the tool call permanently on reload) — it must be plain, serializable data included
  in whatever gets persisted, so a reload restores the outstanding question. See Ticket D4 in
  `nostr-canvas`'s `PLAN.md` for the exact API shape. Ditto's tool-registry framework (T3.2)
  and chat surface need UI support for rendering this pending-question state (exact UI TBD,
  needs its own grilling pass alongside the rest of Phase 3). Shipped alongside
  a shared, devkit-exported widget-creation system prompt (`getWidgetCreationSystemPrompt()` or
  similar) so both tile-studio (Phase 2) and Ditto (Phase 3) get the same battle-tested
  requirements-gathering workflow rather than each writing their own: ask 3-5 scoping questions
  in plain English (via `ask_questions`) to turn a vague user request into concrete
  requirements — most users driving this won't be engineers — → read relevant TIPs
  (`read_spec`/`read_examples`) → explain in plain English what the tile will do → write the
  code (`write_code`/`edit_code`) and iterate against `preview_tile`. Ships with one fully
  worked example session embedded as a few-shot (vague widget request → clarifying questions →
  TIP lookups → plain-English explanation → resulting code). Tracked as Ticket D5 in
  `nostr-canvas`'s own `PLAN.md` (Phase 6), shifting that repo's former D5/D6 to D6/D7.
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

## Phase 1 — `nostr-canvas`: extract `./devkit` subpath export — `pending`

Goal: a host-agnostic library (no React dependency at all — see decision record) providing
everything an AI agent needs to write/edit/preview a nostr-canvas Lua tile, extracted and
generalized from tile-studio's already-mostly-pure `src/lib/*`.

- [ ] **T1.1 Subpath scaffolding.** New `./devkit` export entry in the main package's
      `package.json` `exports` map (types + import conditions) pointing at a new `src/devkit/`
      source tree, built by the existing build pipeline (no separate `package.json`, no
      `pnpm-workspace.yaml` entry — see decision record). `openai`, `zod`, `zod-to-json-schema`
      added as deps of the main package if not already present. Empty `src/devkit/index.ts` to
      start.
      *Eval:* a test importing from the package's own `./devkit` export condition (subpath
      resolution, not a relative path into `src/`) asserts the module loads without error; the
      main package's existing test suite still passes unmodified.
- [ ] **T1.2 Port the AI-provider layer (pure functions only).** `AIProvider`/`AIModel` types,
      `DEFAULT_PROVIDERS`, `createAIClient`, `fetchModels`, `isAnthropicModel`,
      `parseSelectedModel` — ported as-is with no storage/persistence code (settings/backfill/
      reactive-store logic found in tile-studio's `ai-client.ts` stays 100% host-side, per
      decision record). `createAIClient`/`fetchModels` take an explicit `{ referer, title }`
      param for the OpenRouter attribution headers (currently hardcoded to tile-studio's own
      identity) instead of a hardcoded app name; headers omitted if not supplied. Also export a
      minimal `KvStore` interface type (`get`/`set` shape only, no implementation) as a shared
      convention other devkit modules (e.g. T1.4's agent state) may optionally reuse — T1.2
      itself performs no storage.
      *Eval:* `isAnthropicModel` — table of model-id → boolean cases. `parseSelectedModel` —
      table of `"providerId/modelId"` → parts, including no-slash and slash-inside-modelId edge
      cases. `createAIClient` — mocked fetch asserts baseURL/apiKey wiring and that referer/title
      headers appear on the outgoing request only when supplied, absent otherwise. `fetchModels`
      — mocked fetch with a fixture `/models` response asserts the tool-calling filter, both
      field-mapping variants (`context_length` vs `max_context_window`), and an error-path test
      for a non-OK response. No real network calls in any test.
- [ ] **T1.3 Port the `Tool` framework + tile-authoring toolset.** `Tool` interface, `toolToOpenAI`,
      hashline utilities, and all 11 in-scope tools (`read_code`, `write_code`, `edit_code`,
      `read_spec`, `read_examples`, `search_nips`, `fetch_nip`, `set_tile`, `get_tile`,
      `preview_tile`, `set_notes`). A 12th tool, `ask_questions`, is added later as its own
      ticket (T1.5, once T1.4's pending-host-input mechanism exists — see decision record).
      Notable deltas from tile-studio's originals:
      - `write_code`/`edit_code` **drop** their inline `luaLint()`/`capabilityNudge()` calls and
        appended diagnostics entirely — consistent with the "skip static analysis for v1"
        decision applying to embedded diagnostics too, not just the two already-cut standalone
        lint/capability-nudge tools.
      - `read_spec`: bundles only the existing lightweight `TIPS` metadata array (already
        generated at nostr-canvas build time) directly in devkit. Full per-TIP markdown and
        PHILOSOPHY.md content are **not** bundled — fetched on-demand, once per section actually
        requested, via a new shipped `createGitLabTipFetcher()` (pluggable — accepts a `fetch`
        implementation, defaults to global `fetch`) pointed at nostr-canvas's own GitLab repo,
        pinned to the ref matching the installed package version.
      - `read_examples`: the 10 example `.lua` files move from tile-studio's
        `src/lib/tool_examples/` into nostr-canvas (new `examples/` dir alongside `tips/`), with
        a small bundled metadata index (name + description, mirroring `TIPS`) generated the same
        way; full `.lua` content fetched on-demand via the same GitLab fetcher.
      - `search_nips`/`fetch_nip`: ported as-is — already self-contained (hardcoded relay list +
        `SimplePool`, hardcoded `raw.githubusercontent.com` URL respectively), no host injection
        needed.
      - `set_tile`/`get_tile`/`preview_tile`: their in-memory `Map`-by-`projectId` state pattern
        ports as-is (runtime session state, not persisted config — doesn't implicate the
        host-persistence decision from T1.2).
      *Eval:* one unit test per tool's `execute()` against a fixture tile-state/mocked
      dependency — no real network anywhere (`search_nips`, `fetch_nip`, the GitLab fetcher all
      mocked). Plus: a hashline round-trip test (parse → apply ops → result matches expected); a
      test asserting `write_code`/`edit_code` output contains no lint/capability-nudge text at
      all; a test confirming `read_spec`/`read_examples` table-of-contents comes from the bundled
      index while full section content only appears after the (mocked) fetcher resolves.
- [ ] **T1.4 Port the agent loop.** Generalize `useAISession`'s 700-line `runTurns`/`send`/
      `compact` logic into a framework-agnostic `AgentSession` class — no `useState`/
      `useCallback`/React imports at all. Exposes state via `getSnapshot()` + `subscribe(listener)`
      (the shape `useSyncExternalStore` expects), matching the convention already used by
      `SetTileTool`'s tile-state store and tile-studio's AI-settings store — any host can poll or
      subscribe without devkit importing `react`; a React host gets a one-line
      `useSyncExternalStore` wrapper for free (no hook shipped from devkit itself, per the
      earlier decision). Token pruning/dedup and compaction logic ports as-is (still matters
      independent of the static-analysis-skip decision).
      *Eval:* unit tests simulating a multi-turn tool-calling exchange against a mocked OpenAI
      client (no real API calls). Cover: a single tool-call round-trip resolves correctly;
      compaction triggers and `getSnapshot()` reflects the compacted history; `stop()` aborts an
      in-flight turn; a context-length error triggers pruning rather than surfacing as a hard
      failure; `subscribe`'s listener fires on every state transition (streaming delta, tool
      call, completion, error). Also introduces the generic, persistence-safe pending-host-
      input tool-result state (see decision record) — a test that a tool requesting
      pending-host-input pauses the turn (assistant `tool_calls` message already in history,
      no further model call), surfaces via `getSnapshot()`, and resumes correctly once the
      host resolves it; a serialize/deserialize round-trip test confirming a snapshot taken
      while `pendingInput` is set survives being written to and restored from a plain JSON
      store, and that a freshly restored session can still be resolved from that state.
- [ ] **T1.5 `ask_questions` tool + widget-creation system prompt.** (grilled 2026-07-30) The
      12th devkit tool: the AI calls `ask_questions` with a batch of 3-5 short, plain-English
      clarifying questions (optionally with suggested multiple-choice-style answers) to pause
      the turn via T1.4's pending-host-input state and collect structured answers before
      writing any code — single blocking call for the whole batch, not one call per question.
      Alongside it, a shared `getWidgetCreationSystemPrompt()` (or similar) export describing
      the requirements-gathering workflow any host wires up: ask scoping questions → read
      relevant TIPs (`read_spec`/`read_examples`) → explain in plain English what the tile will
      do → write the code and iterate against `preview_tile`. Includes one fully worked example
      session as a few-shot. Tracked in detail as Ticket D5 in `nostr-canvas`'s own `PLAN.md`.
      *Eval:* proposed — unit tests against a mocked `AgentSession` asserting the turn pauses
      with the given questions, resolves once answers are supplied, and validates malformed
      input (empty array, more than 5 questions, missing text); a snapshot/golden test that the
      exported prompt contains all four workflow stages plus the embedded example session; no
      live-model test (Phase 2/3's own manual smoke tests cover that).
- [ ] **T1.6 Port the preview/runtime driver.** `StubAdapter` + "build tile-def event from
      source, register into a fresh isolated runtime, get output, tear down on next edit" as a
      headless function, independent of tile-studio's `TilePreviewCard` React component.
      *Eval:* a test that builds a trivial tile from Lua source, drives the preview function, and
      asserts an output node comes back; a second test confirming the stub adapter never calls
      real signing/publishing/encryption (spy assertions); a third confirming a second
      preview call tears down the prior runtime instance before starting the next (no leaked
      workers). Manual smoke-test once T2 wires it into tile-studio's client.
- [ ] **T1.7 Release.** Version bump + `npm publish`, matching the 0.12.3/0.12.4 pipeline exercised
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

**Sequencing refinement** (grilled 2026-07-28, urgency: user wants Tiles MR-ready this week):
don't wait for `ai-chat-tlc` to actually land in `main` before touching Tiles. As soon as
`ai-chat-tlc`'s own work is done (Phases 1–3 complete, its own MR opened against `main`),
rebase `tiles-v3-widgetonly` onto the *tip of the `ai-chat-tlc` branch* (not the new `main` —
that branch won't have merged yet) so the Tiles MR can be opened and reviewed in parallel
rather than blocking on `ai-chat-tlc`'s review cycle. Whichever of the two merges to `main`
first, the other gets a quick rebase to follow — small, mechanical, not a repeat of this
combine-and-rebase ticket. Explicit goal: avoid one "PR monster" — keep the two MRs reviewable
and mergeable independently, each scoped to its own effort, rather than force-serializing them.

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
- [ ] **T4.3 Rebase `tiles-v3-widgetonly` onto `ai-chat-tlc` (don't wait for `main`).** Once
      `ai-chat-tlc`'s Phases 1–3 are done and its own MR is opened (not necessarily merged yet),
      rebase Tiles onto that branch's tip — standard rebase, or a fresh branch cut from
      `ai-chat-tlc`'s tip with the Tiles commits reapplied, whichever produces cleaner history.
      This unblocks opening the Tiles MR (targeting `main`, based on `ai-chat-tlc`) the same
      week, without waiting on `ai-chat-tlc`'s own review/merge latency. If `ai-chat-tlc` merges
      to `main` first, Tiles' MR base updates automatically (nothing to redo — GitLab tracks the
      new common ancestor); if Tiles merges first, `ai-chat-tlc` gets a short follow-up rebase
      before its own merge.
      *Eval:* `git merge-base ai-chat-tlc tiles-v3-widgetonly` (or its successor branch) equals
      `ai-chat-tlc`'s tip; `npm run test` still green post-rebase; Tiles MR opened in GitLab.
