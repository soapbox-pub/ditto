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

## Phase 1.5 — Follow-up fixes (user-reported) — `done` (pending manual check)

- [x] **T1.6 Spoiler node styling.** Root cause: the trigger never rendered a
      chevron at all. Now: bordered `rounded-lg` container, full-width
      trigger with a rotating `ChevronDown` (closed → -90°,
      `motion-reduce`-safe), padded content. Commit `e340da35`.
- [x] **T1.7 `bitcoin-sign-psbt` never permanently grantable.** New exported
      `ALWAYS_PROMPT_CAPABILITIES: ReadonlySet<Capability>` in
      `src/tiles/installations.ts`; filtered in `writeGrants` (covers
      `install()` + `setGrantedCapabilities()`) and defensively in
      `getStoredGrants` (legacy/hand-crafted localStorage grants can't reach
      the runtime grantBackend). Install dialog (`TileDetailPage`) and
      settings page (`TileSettingsPage`) render it as a muted "Always asks"
      row instead of checkbox/switch; install path also filters it from
      `approvedPermissions`. 2 new unit tests (418 total green). Commits
      `aceec3e8`, `0e3cfce6`.
- [x] **T1.8 Install-dialog overflow (user-reported).** Raw author pubkey
      hex overflowed the dialog description. Now a truncated npub
      (`npub1…` head/tail, full value in `title`) via `tryNpubEncode`, with
      `break-all` on the description. Commit `0e3cfce6`.
- **⚠ Manual check outstanding (user):** spoiler renders with visible
  arrow + border in light/dark; install dialog for a tile declaring
  `bitcoin-sign-psbt` shows "Always asks" and no overflow.

## Phase 2 — Widget frame redesign & double-title fix — `done` (pending manual check)

- [x] **T2.1 Thin frame.** `WidgetCard` reworked (commit `398b3d94`): slim
      always-visible `h-7` handle bar — icon, builtin-only `text-xs` muted
      title (still a `<Link>` when `href`), flex-1 drag button (grip icon,
      `dragHandleProps` spread, keyboard reorder intact), compact remove
      button. Canvas widgets (`hideTitle` prop from the `canvas:` id prefix)
      render no title; **hovering the drag region shows a tooltip with the
      widget name** (global `TooltipProvider` already in App.tsx). All ARIA
      contracts preserved (remove/reorder labels, resize separator slider
      semantics, both fillHeight/ScrollArea content modes).
- [x] **T2.2 Accent frame colors.** New `src/lib/widgetAccent.ts`: djb2
      `hashWidgetId` → `widgetAccentHue` (0-359) → `widgetAccentVars` inline
      `--widget-accent` HSL triple (ScopedTheme pattern). S/L per mode:
      dark 55%/55%, light 70%/45% (brightened per user feedback). Frame =
      `border-2` at `/0.65` alpha; handle bar tint `/0.12`. WidgetCard
      subscribes to `config.theme` via `useAppContext` so the accent
      re-derives on theme switches despite the memoized `SortableWidget`.
      10 unit tests in `widgetAccent.test.ts` (428 total green).
- [x] **T2.3 Detail-page double title.** `PageHeader` now static "Tile"
      (renamed in Phase 3); the in-card name demoted to `<h2>` so the page
      keeps a single `h1` (commit `67fc03dc`).
- **⚠ Manual check outstanding (user):** frames in light/dark/custom —
  distinct, thicker/brighter borders look right; canvas tile shows no Ditto
  title + hover tooltip shows name; builtin shows small handle title;
  drag/resize via pointer *and* keyboard; single title on `/tiles/:naddr`.

## Phase 3 — User-facing rename to "Widgets" — `done` (pending manual check)

All in commit `7bb2da20` (plus `fc92763d` picker flattening, a user
mid-flow request).

- [x] **T3.1 Routes.** `/widgets`, `/widgets/:naddr`, `/settings/widgets`
      canonical in `AppRouter.tsx`; `<Navigate replace>` redirects from all
      three old `/tiles*` paths (`TilesRedirect` wrapper forwards `:naddr`,
      mirroring `ProfileRedirect`). All internal links updated: sidebar
      nav, marketplace cards, detail `backTo`, settings links,
      `TilePublishCard` href, recovery card, `nounRoute` in
      `KIND_HEADER_MAP`, `/settings/tiles` entry in SettingsPage.
- [x] **T3.2 Strings & maps.** Every user-visible string on
      TilesPage / TileDetailPage / TileSettingsPage / TilePublishCard /
      CanvasTileWidget / CanvasWidgetRecovery says widget; sidebar +
      settings labels read "Widgets"; `NOTIFICATION_KIND_NOUNS`,
      `CommentContext`, `KIND_HEADER_MAP` noun, `KIND_SPECIFIC_LABELS`,
      feed-toggle label + description updated. Added missing
      `30207: 'Widget'` to `KIND_LABELS` (numeric order). Added
      `useSeoMeta` to TilesPage ("Widgets | appName") and TileDetailPage
      (tile name | Widgets | appName). Three stale test assertions
      updated. `rg` audit: only internal identifiers remain. Internal
      code (`src/tiles/`, component/type names, localStorage keys,
      `feedIncludeTiles`, ids) untouched. 428 tests green.
- [x] **T3.3 Picker flattening (user request).** `WidgetPickerDialog`
      renders one flat list — widgets still grouped by category order but
      no heading separators; dead `WIDGET_CATEGORIES` removed
      (`fc92763d`).
- **⚠ Manual check outstanding (user):** old `/tiles`, `/tiles/:naddr`,
  `/settings/tiles` URLs redirect; nav/settings/notifications/comment
  context read "widget"; add-widget modal shows flat list, grouped order
  intact.

## Phase 4 — Marketplace TLC — `in_progress`

Done so far (T4.1 `d178c5d9`, T4.2 `c87e212e`, T4.2b+c `95904cae`):
icon-first list cards with the sidebar accent (`widgetAccentVars` keyed
by `canvasWidgetId(identifier)`; `border-2 /0.65` + `/0.06` tint;
`BadgeCheck` verified icon, `Sparkles` when `countTileViews(tile) > 1`,
top-2 perms by user-approved `CAPABILITY_RANK`
(`src/tiles/capabilities.ts`) + `+N` tooltip chip, greyed "No special
permissions" badge when empty). Shared `TileInstallDialog` (consent +
mobile dialogs; ALWAYS_PROMPT filtering preserved; author line resolves
`@name` → nip05 → truncated npub via `useAuthor`, never display_name).
Click-to-expand cards (no longer Links): one at a time, center
`scale-105` + `z-10` over siblings, fixed `h-9` footer rows so the grid
never shifts; collapsed = status text only (Installed / Update
available), expanded = translucent accent surface
(`--widget-accent-surface` `/0.9`, deeper S/L: dark 45/32, light 55/42,
`contrastForeground` now exported) with theme-inverted neutral
Install/Update/**View** buttons (dark: white/black, light: black/white);
Escape / outside-click collapses; Enter/Space + `aria-expanded`.
Detail page: actions right-aligned, description renders GFM tables
(`remark-gfm` added as a real dep); source code collapsed behind a
Collapsible "Source code" spoiler (`fa841e9d`, TileOutputView spoiler
pattern — pulls that item forward out of T4.5). 442 tests green.

**Manual checks (user, 2026-07-28):** detail page, sort control,
marketplace colors, detail view all checked OK. Found: short cards left
dead space in their grid row — fixed in `3a3c498b` (wrapper+CardContent
`h-full`, perms/footer pinned with `mt-auto pt-3`); needs a quick
re-look. Still unchecked: tooltips, sparkle on a multi-view tile,
install/update from list on a real tile, expand/collapse feel, GFM
table in a description, ~360px.

- [x] **T4.3c Detail-page back button + author chip + actions/comments
      (user, 2026-07-28 — this was the "other changes").** Done in
      `24e43547`. PageHeader `onBack` (history>1 ? -1 : `/widgets`) +
      `alwaysShowBack`; `ActorRow` (from NoteCard, label "published",
      NoteCard-style name derivation) in the header block;
      `PostActionBar` (raw 30207 event, replyLabel "Comments", onReply
      scrolls to comments, `NoteMoreMenu` wired) as its own hairline
      section inside the accent surface; comments below the surface via
      the standard `useComments`+mute-filter → `ComposeBox compact` +
      `FlatThreadedReplyList` recipe (BadgeDetailContent pattern) with
      skeleton/empty states. Stats/zaps handle addressable events
      automatically (`useEventStats`/`useZaps` addr-aware). *Manual
      check outstanding:* back nav, author hover card, action bar
      counts/zap, posting a comment.
- [x] **T4.3 Sort + search.** Done in `a5cb6eaa` + `3ce8345e`.
      `sortMarketplaceTiles(tiles, order)` /
      `MarketplaceSortOrder = 'newest' | 'recently-updated' | 'name'` in
      `src/tiles/marketplace.ts` (newest = `publishedAt ?? createdAt`
      desc — `TileDefinition.publishedAt` now parsed from the NIP-99
      `published_at` tag; recently-updated = `createdAt` desc; name =
      case-insensitive `localeCompare`); shadcn Select (w-160, default
      Newest) next to search, sorting the search-filtered set. Dead
      helpers removed (`getMarketplaceTiles`, `getMarketplaceTileStatus`,
      `InstalledTile`, `MarketplaceTileStatus`) and their tests replaced;
      5 sort tests added (443 total green). Same commit compacted the
      card perms row per user: single 11px muted text line — two perm
      names `·`-joined + dotted-underline `+N` tooltip span (Badge chips
      removed). *Manual check outstanding:* sort orders on real data,
      ~360px toolbar wrap, perms row fit.
- [x] **T4.3b Unified detail page (user direction, 2026-07-28).** Done in
      `28b2c56f`. Disparate Cards replaced by one accent-framed container
      (`border-2` `/0.65` + `/0.06` tint via `widgetAccentVars` keyed by
      `canvasWidgetId`, theme subscription like the marketplace cards);
      sections (header w/ actions, Description, Permissions, Source-code
      spoiler) flow inside with `--widget-accent /0.25` hairline dividers
      and `text-xs uppercase tracking-wide` micro-labels. All logic
      (install dialog, login gating, SEO meta) untouched. *Manual check
      outstanding:* light/dark + ~360px.
- [x] **T4.4 Social signals — resolved as detail-page-only (user,
      2026-07-28).** An action bar on the list cards was built then
      **rejected by the user** ("Actions row should only be in the
      detail page, not the main marketplace view") and reverted before
      commit. The PostActionBar + comments on the detail page (T4.3c,
      `24e43547`) fully covers this ticket. Don't re-add signals to
      list cards.
- [ ] **T4.5 Detail-page upgrades.** Image/gallery from `image` tag(s),
      version history of the 30207 coordinate (prior events), tiny
      source-code highlighter only if ~zero-cost (spoiler itself done in
      `fa841e9d`), clearer per-permission explanation copy. *Eval:*
      manual on a real marketplace tile; `npm run test`.
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

- [ ] **T7.1 Publish script.** Builtin widget Lua sources live in
      **`~/repos/nostr-canvas`** (not this repo) so other tile clients
      benefit; published with nostr-canvas's own tooling
      (`publish-tile.js`), signed by the curator key, each tagged
      `["t", "ditto-builtin-tile"]` (lowercase confirmed by user 2026-07-28). Ditto-side script only if something
      extra is needed. *Eval:* published 30207 parses via
      `parseTileDefEvent`, carries the `t` tag, and lands on the test
      relay.
- [ ] **T7.2 Curator trust tier.** Curator pubkey is a **dedicated
      AppConfig arg of its own** (e.g. `widgetCuratorPubkey`: real hex
      pubkey; interface + Zod schema + default — the usual AppConfig
      triple). Default for now: the canvas marketplace test pubkey
      `373afc3c69a920ba526292ac5f2b315c523631faefbf8a4706ea6f22ba0bd867`
      (`canvas-marketplace-test@shantaram.xyz`, `NSEC` in
      `~/repos/nostr-canvas/.env` — NIP-05 verified 2026-07-28). A tile is
      "builtin/curated" **only if** `event.pubkey === curator` (query
      filtered by `authors`, per nostr-security) **and** it has the
      `t: ditto-builtin-tile` tag — the tag alone grants nothing.
      Curated tiles are auto-installed (defaults: trends, hot-posts,
      wikipedia) and auto-granted declared capabilities **except**
      bitcoin/PSBT signing and event publishing, which always prompt.
      *Eval:* unit tests: curated-detection requires pubkey+tag; auto-grant
      set excludes sign/publish; consent dialog still fires for those;
      `npm run test`.
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
