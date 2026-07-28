# PLAN: Tiles → Widgets — nostr-canvas 0.12, frame redesign, feeds, marketplace, builtin ports, AI creation

> Living plan. Delete when the effort ships. Supersedes `NOSTR_CANVAS_PLAN.md`
> (0.11 integration, complete — summary in Phase 0).

## Vision

nostr-canvas tiles become **Ditto's widget system**. User-facing name is
**"Widgets"**; internal code keeps the `tile` / `src/tiles/` vocabulary that
mirrors the `@soapbox.pub/nostr-canvas` library and the kind-30207 spec.
Native builtin sidebar widgets are progressively ported to Lua tiles published
under a Ditto curator key; AI chat gains a widget-creation mode.

## Decision record (from scoping interview)

- **Everything planned first; no implementation until the plan is approved.**
- **Rename is user-facing only**: labels, nav, page titles, kind-label maps,
  notification nouns say "Widget". Routes become `/widgets/*` **with
  `/tiles/*` redirects** (URLs are user-visible). Internal identifiers,
  AppConfig fields (`feedIncludeTiles`, `installedCanvasTiles`, …),
  localStorage prefixes (`ditto:canvas-tile-*`), and NIP-78 setting names are
  **not** migrated.
- **Feeds**: kinds claimed via `k` + `render:in_feed=true` by *installed*
  tiles join the user's feed queries, rendered as **native generic cards**
  (no Lua execution in feeds). Ditto's own kind renderers take precedence on
  conflict; an **advanced setting** can show both or let the generic card
  override. Kind-30207 publishes keep the existing `TilePublishCard`.
- **Frame redesign**: Ditto renders a thin frame with a top handle
  (drag/icons). Canvas tiles get **no rendered title** (tiles self-title in
  their output); native builtins get a **small title inside the handle bar**
  until ported. Frame accent color = **hash(tile identifier) → hue**, passed
  through the theme derivation (`coreToTokens` conventions) so it pops yet
  adapts to light/dark/custom themes. No retro/pixel styling.
- **Marketplace TLC**: visual redesign, install-from-list with consent
  dialog, installed/update badges, sort + search (**no category filters**),
  social signals (reactions/zaps/comments), detail-page upgrades. Syntax
  highlighting only if a tiny dependency suffices — otherwise omit. The
  Rust **wasm engine must be lazy-loaded** (never at app boot).
- **Output nodes**: implement `feed` (native mini cards, ~12 events split
  across 3 pages) and `nevent` (card / deck of cards) in `TileOutputView`.
  `comments` stays unsupported for now.
- **Builtin porting scope**: trends, hot-posts, wikipedia, bluesky,
  nostr-clients, blobbi, status → Lua tiles. **AI chat and the four feed
  widgets stay native.** Distribution: Lua sources in-repo + a
  `publish-tile`-style script, **parameterized curator key/NIP-05 (identity
  deferred)**. Curator-signed tiles get **auto-granted capabilities except
  bitcoin signing and event publishing**, which always prompt. Existing
  users' sidebar configs migrate builtin id → `canvas:` id.
- **Marketplace first-open nag**: a "New: Widget marketplace" hover nag over
  the marketplace view the first time it's opened (localStorage-tracked),
  expandable to explain that user-contributed widgets can now be installed
  and that they are **not part of Ditto nor made by Soapbox — exercise
  caution**. Sidebar nav entry is called **"Widgets"**.
- **Zaps**: widgets are zappable — the zap attaches to the kind-30207 event
  (author receives sats; receipts count toward marketplace social proof).
- **AI widget creation**: extend the existing AI chat sidebar widget. First
  open shows a "New: Create with Ditto" toast (localStorage-tracked). Cheap
  model; TIP spec docs (0.12 ships `tips/*` subpath + `TIPS` index export)
  fed as context. Live preview embedded in the chat pane; on satisfaction,
  AI generates event metadata (+image if possible) and the user publishes —
  gated on having a NIP-05 (identifiers are `nip05:slug`).
- **nostr-canvas 0.12 upgrade**: implement `RuntimeAdapter.uploadImage` via
  the Blossom pipeline (capability-gated).
- **Verification bar**: every ticket passes `npm run test`; UI tickets carry
  a specific manual dev-server check performed before close.

## Carried-forward security posture (from 0.11 integration)

- The runtime is an extension of Ditto, not a second Nostr stack: adapter
  delegates to Nostrify/`useNostr`, signing/NIP-44/profiles/toasts use Ditto
  hooks; tile code never touches the DOM.
- All tile/event metadata is untrusted: `sanitizeUrl()` for every image URL,
  sanitized markdown (`react-markdown` + `rehype-sanitize`), Lua source only
  as escaped text.
- Capability grants are explicit, per-account, device-local; never derived
  from synced data. (Curator tier in Phase 7 carves a *documented* exception,
  excluding bitcoin/publish.)
- Safe fetch: HTTPS-only through the CORS proxy, credentials and sensitive
  headers stripped.
- Tile execution remains browser-only (`canUseCanvasTiles()`) until the
  native WebView path is verified.

---

## Phase 0 — 0.11 integration (done)

Marketplace (`/tiles`), detail page, install/permissions/persistence
(encrypted-settings coordinates + local grants), runtime host
(`CanvasRuntimeProvider` + adapter + `TileOutputView`), sidebar widget
integration (`canvas:` ids, recovery states), feed `TilePublishCard`,
settings page, browser gating, a11y pass. Commits `c32a2a3e`…`43c875f0`.
`feed`/`comments`/`nevent` nodes fail closed; `ctx.navigate()` no-op.

## Phase 1 — nostr-canvas 0.12 upgrade — `done` (pending manual check)

Bumped to **0.12.1** (0.12.1 = 0.12.0 + wasm bundled in the package).
Commits `2d8cffaa` (core port), `8459e6a3` (QR handles / password inputs /
uploadImage via Blossom + `image_upload` nodes), `8721a34a` (lazy runtime),
plus the NIP.md link refresh.

- T1.1 Core port: RustWorkerPool removed; `NostrAdapter`→`RuntimeAdapter`;
  `onGrantDecision`→`grantBackend` (raw stored grants; worker clamps to
  declared — verified in worker source); runtime is now `TileRuntime | null`
  (constructed in a mount effect), all consumers null-guarded.
- T1.2/T1.3: QR handles render via existing `QRCodeCanvas` (corrupt handles
  render nothing, never fetch); `input_type` hints honored; `uploadImage`
  adapter method = file picker (native `cancel` event, abort-signal aware) +
  `useUploadFile`; `image_upload` nodes with in-flight disable and
  sanitizeUrl-gated preview. Review findings (dropped AbortSignal, missing
  loading state, focus-heuristic race) fixed.
- T1.4: activation gate in `CanvasRuntimeProvider` — worker+wasm boot only
  when tiles are installed or a tile page mounts (`RequireCanvas`); new
  `useCanvasActivation` / `useOptionalCanvasRuntime` /
  `useOptionalCanvasTileInstallations`; explicit `wasmUrl` resolved from
  node_modules (prod build otherwise 404s the wasm — emitted as hashed
  asset, verified in dist). Fixed T1.1 regression: installations closures
  captured first-render null runtime (registration permanent no-op).
- **⚠ Manual check outstanding (user):** dev server — (1) no
  `nc-worker`/wasm network fetch on `/` with no tiles installed; (2) visit a
  tile detail page → runtime boots, tile installs/renders and responds to
  input; (3) sidebar tile of an already-installed account still renders;
  (4) image-upload button in a tile uploads via Blossom; (5) prod
  `vite preview` — wasm loads (no 404) when a tile page opens.

## Phase 2 — Widget frame redesign & double-title fix — `pending`

- [ ] **T2.1 Thin frame.** Rework `WidgetCard`: slim top handle bar carrying
      drag grip, icon, remove, resize affordances. Canvas tiles: no label
      text (label stays as `aria-label`/picker name). Builtins: small
      muted-foreground title inside the handle bar. Keep keyboard drag/resize
      and reduced-motion behavior. *Eval:* `npm run test`; manual: tile shows
      no Ditto title (self-titles only), builtin shows small handle title,
      drag/resize work via pointer and keyboard.
- [ ] **T2.2 Accent frame colors.** Deterministic hash(identifier) → hue;
      build border/handle tint via theme-token conventions (saturation/
      lightness from the active theme, à la `coreToTokens`) so frames pop in
      light, dark, and custom themes. Apply to widget frames (and reuse in
      marketplace cards, Phase 4). *Eval:* unit test for stable hash→hue;
      manual: distinct frame colors per widget, legible in light/dark/custom
      theme, WCAG ≥3:1 for UI chrome.
- [ ] **T2.3 Detail-page double title.** `TileDetailPage` renders
      `PageHeader title={tile.name}` *and* an in-card `<h1>` — keep one.
      *Eval:* manual: single title on `/widgets/:naddr`; `npm run test`.

## Phase 3 — User-facing rename to "Widgets" — `pending`

- [ ] **T3.1 Routes.** `/widgets`, `/widgets/:naddr`, `/settings/widgets`
      canonical; `/tiles/*` 301-style client redirects. Update internal
      `Link`s, `nounRoute` in `KIND_HEADER_MAP`, recovery-card links.
      *Eval:* manual: old `/tiles/:naddr` URL lands on `/widgets/:naddr`;
      `npm run test`.
- [ ] **T3.2 Strings & maps.** Nav item (sidebar entry reads **"Widgets"**),
      page titles/headers, buttons, settings section, `KIND_HEADER_MAP`
      noun, `NOTIFICATION_KIND_NOUNS`, `CommentContext` labels,
      `KIND_SPECIFIC_LABELS`, feed-settings toggle label — all say
      "widget". Add the missing 30207 entry to `src/lib/kindLabels.ts`
      (currently falls back to "Kind 30207").
      *Eval:* `rg -i '\btile' src/` review shows only internal identifiers /
      library API remain; manual: nav + notifications + comment context read
      "widget"; `npm run test`.

## Phase 4 — Marketplace TLC — `pending`

- [ ] **T4.1 List redesign.** Rework `/widgets` grid cards: accent-colored
      frames (T2.2), hero/header polish, loading skeletons, dashed-card
      empty state, ~360px-wide mobile layout. *Eval:* manual across mobile/
      desktop widths; `npm run test`.
- [ ] **T4.2 Install UX on the list.** Installed / update-available badges
      per card (via `installations` cache vs marketplace event timestamps);
      install directly from the list through the existing capability-consent
      dialog. *Eval:* manual: fresh tile installs from list w/ consent
      dialog; updated tile shows badge; `npm run test`.
- [ ] **T4.3 Sort + search.** Sort control (newest / recently updated /
      name); keep search; **no category filters**. Clean up or remove the
      unused `getMarketplaceTiles`/`getMarketplaceTileStatus` helpers in
      `src/tiles/marketplace.ts` as part of wiring real status logic.
      *Eval:* unit tests for sort orders; manual sanity; `npm run test`.
- [ ] **T4.4 Social signals + zaps.** Reaction/zap/comment counts on cards
      and detail page via existing stats hooks (NIP-85 where available);
      comments section on detail page (nostr-comments pattern). Zap action
      on the detail page (and card, if it fits the redesign) targeting the
      30207 event via `useZaps`, so zap totals feed the same counts.
      *Eval:* manual: counts render for a tile with known engagement; zap
      flow reaches invoice for an author with lightning configured;
      `npm run test`.
- [ ] **T4.5 Detail-page upgrades.** Image/gallery from `image` tag(s),
      version history of the 30207 coordinate (prior events), collapsible
      escaped source viewer (tiny highlighter only if ~zero-cost, else
      plain), clearer per-permission explanation copy. *Eval:* manual on a
      real marketplace tile; `npm run test`.
- [ ] **T4.6 First-open marketplace nag.** "New: Widget marketplace" hover
      nag over the `/widgets` view on first open, localStorage-tracked,
      expandable to a caution note: widgets are user-contributed, not part
      of Ditto nor made by Soapbox — exercise caution. Dismissible,
      accessible (focusable, `aria-live` polite). *Eval:* manual: appears
      once, expand shows caution copy, never returns after dismissal;
      `npm run test`.

## Phase 5 — Tile-claimed kinds in feeds (native generic cards) — `pending`

- [ ] **T5.1 Kind collection + settings.** Gather `k` kinds from installed
      definitions carrying `render:in_feed=true`; feed them into
      `getEnabledFeedKinds` consumers behind a feed toggle. Conflict rule:
      kinds Ditto already renders natively are excluded by default; advanced
      setting (AppConfig triple: interface + Zod schema + default) chooses
      native-only / show-both / generic-overrides. *Eval:* unit tests for
      collection + conflict logic; `npm run test`.
- [ ] **T5.2 Generic widget-interaction card.** Native feed card for such
      events: "@author used <Widget name>" with widget icon/accent color,
      best-effort content/alt summary, link to `/widgets/:naddr`. No Lua in
      feeds. Registered in `NoteCard` dispatch + `EmbeddedNote`.
      *Eval:* manual: publish a test event of a claimed kind, see the card
      in feed; `npm run test`.

## Phase 6 — `feed` and `nevent` output nodes — `pending`

- [ ] **T6.1 `feed` node.** Render TIP-16 feed nodes as native mini info
      cards: ~12 events, paginated 3 pages (4/page), author avatar + name +
      snippet, subscription owned by the host (adapter), lifetime tied to
      the tile instance. *Eval:* renderer test with mock events; manual with
      a feed-declaring tile; `npm run test`.
- [ ] **T6.2 `nevent` node.** Render TIP-20 event references as a native
      card (single) or deck (multiple/stacked), reusing `EmbeddedNote`
      machinery where possible. *Eval:* renderer test; manual; `npm run test`.

## Phase 7 — Port builtin widgets to Lua tiles — `pending`

Ordering: after Phases 1–6 (needs 0.12 runtime, frames, feed nodes).

- [ ] **T7.1 Publish script.** `scripts/publish-widget-tile` modeled on
      nostr-canvas's `publish-tile.js`: takes Lua path, metadata, identifier
      (`<nip05>:<slug>`), key (nsec/bunker) as parameters. Curator identity
      itself **deferred**. *Eval:* dry-run signs + prints a valid 30207
      (parses via `parseTileDefEvent`); publishes to a test relay.
- [ ] **T7.2 Curator trust tier.** Config knob for curator pubkey; tiles
      signed by it are auto-installed (defaults: trends, hot-posts,
      wikipedia) and auto-granted declared capabilities **except**
      bitcoin/PSBT signing and event publishing, which always prompt.
      *Eval:* unit tests: auto-grant set excludes sign/publish; consent
      dialog still fires for those; `npm run test`.
- [ ] **T7.3–T7.9 Port seven widgets** (one ticket each): trends,
      hot-posts, wikipedia, bluesky, nostr-clients, blobbi, status. Each:
      Lua source in-repo, parity with the React widget's data + layout via
      output nodes / safe fetch, widget tag for sidebar placement.
      *Eval per tile:* side-by-side manual comparison against the native
      widget; `npm run test`.
- [ ] **T7.10 Migration + retirement.** Sidebar config migration builtin-id
      → `canvas:` id for ported widgets; remove retired React widget code;
      fresh-install defaults point at curator tiles. AI chat + feed widgets
      remain native. *Eval:* migration unit test (old config → new ids, no
      dupes); manual: existing sidebar survives upgrade; `npm run test`.

## Phase 8 — AI chat widget creation — `pending`

- [ ] **T8.1 Discovery toast.** "New: Create with Ditto" overlay on the AI
      chat widget's first open, dismissed state in localStorage.
      *Eval:* manual: shows once, never again after dismiss; `npm run test`.
- [ ] **T8.2 Creation mode.** AI chat mode that drafts tile Lua + metadata:
      cheap model; system context assembled from the 0.12 `TIPS` index +
      selected `tips/*` docs (subpath exports). *Eval:* manual: prompt →
      syntactically valid Lua tile source; `npm run test`.
- [ ] **T8.3 Embedded preview.** Render the drafted tile live inside the
      chat pane via the runtime (sandboxed, ungranted capabilities fail
      gracefully); iterate on feedback. Requires a local/unpublished
      definition path (draft not yet a signed event). *Eval:* manual:
      preview renders and updates across iterations; `npm run test`.
- [ ] **T8.4 Publish flow.** AI generates name/summary/description
      (+image via generation/upload if feasible); user reviews code +
      requested capabilities; publish as kind 30207 via `useNostrPublish`
      with d-tag collision check — **gated on the user having a NIP-05**
      (identifier embeds it). *Eval:* manual: end-to-end create → publish →
      visible in marketplace → installable; `npm run test`.

---

## Working agreement

- Tickets dispatched to `coder`; verification to `tester`; risky diffs get a
  `researcher` review pass. Every ticket: `npm run test` green + its listed
  manual check before close. Commit per completed ticket/phase per
  `git-workflow` conventions.
