# STACK_PLAN: Ditto AI-chat + Tiles→Widgets stack — full tracker

> Living plan. Delete when the effort ships. Supersedes `NOSTR_CANVAS_PLAN.md`
> (0.11 integration, complete — summary in Phase 0), this file's own former name
> `TILES_PLAN.md`, and `AI_CHAT_TILES_PLAN.md` (deleted 2026-08-03 — its only content not
> already folded into this file's Phase 8 was the Human Review Queue, merged in near the end).

## Cross-branch state (as of 2026-08-03)

This doc now tracks the whole stack across all four branches, not just this one.

**Branch/MR stack** (each targets the previous link, not `main`):

1. `fix/ghpages-asset-urls` — issue #317, MR !248 targets `main`. It is open and clean.
2. `fix/portal-dropdown-flip-anchor` — issue #318, MR !249 targets tier 1a. It is open and clean.
3. `ai-chat-tlc` — issue #319, MR !245 targets tier 1b. It is open. Dirk Rost's review labeled it
   `On Hold`. A point-by-point response went up on 2026-08-03
   (https://gitlab.com/soapbox-pub/ditto/-/merge_requests/245#note_3637938203). All four hard
   blockers and every smaller item from that review are now resolved. Two gates remain: Chad
   Curtis's formal review (requested), and Alex Gleason's answer on three questions — whether
   AI-chat provider API keys belong in the NIP-78 encrypted blob, whether Ditto should take a hard
   dependency on pre-1.0 `nostr-canvas`, and whether AI chat is where product attention belongs
   right now. A broader Ditto modernization and bugfixing initiative was proposed to address the
   third question.
4. Tiles-authoring-bundle (tier 3, not yet created) will target `ai-chat-tlc`. It reconstructs the
   9-tool Tiles ability that commit `2ef82d24` stripped from `ai-chat-tlc`. The blueprint is that
   commit's diff, reversed. Scope decided 2026-08-03:
   - Wire devkit's real `PreviewTileTool`. The pinned `@soapbox.pub/nostr-canvas@0.14.6` now ships
     one; the old hand-rolled stub predates it. This branch does not build the interactive
     preview-card UI — that is Phase 8/T8.1 below, which needs this branch's runtime and
     marketplace infrastructure.
   - Implement real tile-draft persistence into the serialized session blob. Dirk's review
     flagged the module-scoped-Map version as lost on reload, with a stale comment promising a
     future fix that never happened.
   - Get its own new issue and MR, targeting `ai-chat-tlc`.
   - Watch item, not a blocker yet: Lemon's `porygon` library may replace
     `@soapbox.pub/nostr-canvas/devkit` as the AI-chat tool-calling substrate, removing the hard
     `nostr-canvas` dependency from the AI-chat work while `nostr-canvas` itself matures. Building
     tier 3 against devkit now is still the right call — its tool surface here is mostly thin
     OpenAI-compatible glue, cheap to swap out later if `porygon` lands.
5. `tiles-v3-widgetonly` (this branch, tier 4) has MR !246, still draft, targeting `ai-chat-tlc`.
   It needs a retarget to tier 3 once tier 3 exists. Proposed 2026-08-03: split this branch's own
   MR into three, landing in this order — (a) the built-in widgets port and widget settings, (b)
   the marketplace, (c) the AI-chat widget-creation and remix work (Phase 8 below). This branch
   still has its own duplicate copies of tier-2-derived commits, which need dropping before a
   clean retarget.

Squash-merge is on for every MR in this stack. The commit counts visible during review collapse
to one commit each on `main`.

See `SESSION_HANDOFF.md` in this same branch for the full session context behind this state.

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

## Phase 1 — nostr-canvas 0.12 upgrade — `done` (human-verified 2026-07-28)

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
- **Manual check:** ✔ passed (user, 2026-07-28). Was: dev server — (1) no
  `nc-worker`/wasm network fetch on `/` with no tiles installed; (2) visit a
  tile detail page → runtime boots, tile installs/renders and responds to
  input; (3) sidebar tile of an already-installed account still renders;
  (4) image-upload button in a tile uploads via Blossom; (5) prod
  `vite preview` — wasm loads (no 404) when a tile page opens.

## Phase 1.5 — Follow-up fixes (user-reported) — `done` (human-verified 2026-07-28)

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
- **Manual check:** ✔ passed (user, 2026-07-28). Was: spoiler renders with visible
  arrow + border in light/dark; install dialog for a tile declaring
  `bitcoin-sign-psbt` shows "Always asks" and no overflow.

## Phase 2 — Widget frame redesign & double-title fix — `done` (human-verified 2026-07-28)

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
- **Manual check:** ✔ passed (user, 2026-07-28). Was: frames in light/dark/custom —
  distinct, thicker/brighter borders look right; canvas tile shows no Ditto
  title + hover tooltip shows name; builtin shows small handle title;
  drag/resize via pointer *and* keyboard; single title on `/tiles/:naddr`.

## Phase 3 — User-facing rename to "Widgets" — `done` (human-verified 2026-07-28)

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
- **Manual check:** ✔ passed (user, 2026-07-28). Was: old `/tiles`, `/tiles/:naddr`,
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

**Manual checks (user):** all Phase 4 work through T4.3c/T4.4 confirmed
good and human-tested 2026-07-28 (detail page, sort control, marketplace
colors, expand/collapse, grid stretch fix `3a3c498b`).

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
      automatically (`useEventStats`/`useZaps` addr-aware). *Manual check:* ✔ passed (user, 2026-07-28).
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
      removed). *Manual check:* ✔ passed (user, 2026-07-28). Was: sort orders on real data,
      ~360px toolbar wrap, perms row fit.
- [x] **T4.3b Unified detail page (user direction, 2026-07-28).** Done in
      `28b2c56f`. Disparate Cards replaced by one accent-framed container
      (`border-2` `/0.65` + `/0.06` tint via `widgetAccentVars` keyed by
      `canvasWidgetId`, theme subscription like the marketplace cards);
      sections (header w/ actions, Description, Permissions, Source-code
      spoiler) flow inside with `--widget-accent /0.25` hairline dividers
      and `text-xs uppercase tracking-wide` micro-labels. All logic
      (install dialog, login gating, SEO meta) untouched. *Manual check:* ✔ passed (user, 2026-07-28).
- [x] **T4.4 Social signals — resolved as detail-page-only (user,
      2026-07-28).** An action bar on the list cards was built then
      **rejected by the user** ("Actions row should only be in the
      detail page, not the main marketplace view") and reverted before
      commit. The PostActionBar + comments on the detail page (T4.3c,
      `24e43547`) fully covers this ticket. Don't re-add signals to
      list cards.
- [x] **T4.5 Detail-page upgrades.** Done in `15ce8070` + `31151932`.
      `TileDefinition.images` (all sanitized `image` tags); Screenshots
      section (h-40 thumbnail scroll row → Dialog lightbox); Version
      history section (`['tile-history', pubkey, identifier]` query,
      authors-filtered, v-tag + date rows, "current" marker);
      `CAPABILITY_DESCRIPTIONS` sentences per perm on the detail page
      and under each row in TileInstallDialog (ALWAYS_PROMPT rows
      intact). Source highlighter skipped (decided). 457 tests green.
      *Manual check outstanding:* gallery/lightbox + history on a real
      multi-image tile.
- [x] **T4.6 First-open marketplace nag.** Done in `8c0833d5`.
      `src/components/MarketplaceNag.tsx` rendered by TilesPage: fixed
      bottom overlay (max-w-md), Sparkles + "New: Widget marketplace",
      X dismiss (aria-label), "Learn more" expander (aria-expanded,
      grid-rows animation, motion-safe) revealing the user-contributed /
      not-Ditto / not-Soapbox caution copy; role="status" aria-live.
      localStorage key `ditto:marketplace-nag-dismissed`, but
      **`ALWAYS_SHOW_NAG = true` temporary flag per user — flip to
      false later to restore first-open-only gating.**
- [x] **NIP.md kind 30207 spec-link version drift fixed.** Dirk's review of
      `!245` flagged the link (`nostr-canvas@0.12.1`) as stale against the
      actual `^0.14.6` dependency. Bumped to `0.14.6` in `6e3da957`.

## Phase 5 — Tile-claimed kinds in feeds (native generic cards) — `pending`

- [x] **T5.1 Kind collection + settings.** Done in `6b79a50e`.
      `src/tiles/feedKinds.ts`: pure `getTileFeedKinds(defs, nativeKinds,
      mode)` (render.inFeed kinds, deduped; native kinds derived from
      EXTRA_KINDS incl. extraFeedKinds/subKinds) + `useTileFeedKinds()`
      (config.installedCanvasTiles →
      `useOptionalCanvasTileInstallations().getCachedDefinition` →
      parse), unit-tested (feedKinds.test.ts). New AppConfig triple
      `tileKindConflictMode: 'native-only' | 'show-both' |
      'generic-overrides'` (default native-only; type lives in
      AppContext.ts only). Wired via new optional `extraKinds` param on
      `getEnabledFeedKinds` (gated on `feedSettings.feedIncludeTiles`)
      through useFeed / useFeedStream / useProfileFeed / useStreamPosts /
      ClientFeedPage; TestApp config updated. *Note:* show-both vs
      generic-overrides only affect the render side — that's T5.2.
- [ ] **T5.2 Generic widget-interaction card.** Native feed card for such
      events: "@author used <Widget name>" with widget icon/accent color,
      best-effort content/alt summary, link to `/widgets/:naddr`. No Lua in
      feeds. Registered in `NoteCard` dispatch + `EmbeddedNote`.
      *Eval:* manual: publish a test event of a claimed kind, see the card
      in feed; `npm run test`.

## Phase 6 — `feed` and `nevent` output nodes — `deferred` (user, 2026-07-28: not urgent; do after Phase 7's wikipedia demo)

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
      - **Wikipedia demo DONE + WORKING (human-verified 2026-07-28).**
        `~/repos/nostr-canvas` `tiles/wikipedia/` v1.0.1, published to
        `wss://bruh.samt.st` as event `816a91b9…cf810` (perms fetch +
        navigate, t-tags `nostr-canvas-tile` + `ditto-builtin-tile` via
        new frontmatter `tags:` support in publish-tile.js). Required two
        nostr-canvas releases along the way:
        - **0.12.3** — engine fix: `os.date`/`os.time` errored on wasm
          ("current time not available in this host") because omnilua's
          `HostHooks::unix_time` was never installed; `new_tile_lua()` in
          engine.rs now installs a `js_sys::Date::now()`-backed hook
          (native mirrors the stdlib fallback).
        - **0.12.4** — `NavigateTarget` gains a `{ url: string }` variant
          (TIP-19 updated: https only, client MUST sanitize); wikipedia
          tile gains a ghost "Read article" button →
          `ctx.navigate({ url = article_url })`.
        Ditto side (`cbc336e3`): `adapter.navigate` implements `url`
        (sanitizeUrl → `/i/${encodeURIComponent(url)}` internal
        commentable browser, same as native WikipediaWidget) and
        NIP-19 `pointer` targets (nsec rejected); `identifier` targets
        still not_implemented. openPath = module-level navigate ref
        captured by `CanvasNavigateBridge` mounted inside BrowserRouter
        (CanvasRuntimeProvider sits outside the router). 8 new adapter
        tests. **Known upstream mismatch: wasm runtime forwards the Lua
        field `nostr` but the TS NavigateTarget says `pointer` — Ditto
        checks both; fix properly in nostr-canvas someday.**
- [ ] **T7.10 Migration + retirement.** Sidebar config migration builtin-id
      → `canvas:` id for ported widgets; remove retired React widget code;
      fresh-install defaults point at curator tiles. AI chat + feed widgets
      remain native. *Eval:* migration unit test (old config → new ids, no
      dupes); manual: existing sidebar survives upgrade; `npm run test`.

## Phase 8 — AI chat widget creation — `pending`

Replaces the original T8.1-T8.4 draft below with the far more detailed version grilled on
`ai-chat-tlc`'s `AI_CHAT_TILES_PLAN.md` (ported over 2026-08-02). Context: `ai-chat-tlc` ships a
standalone AI chat modernization PR first and merges to `main` on its own; this branch
(`tiles-v3-widgetonly`) then rebases onto it (see that repo's plan doc, or its own `PLAN.md`'s
T4.2/T4.3, for the full handoff). That effort split its own Phase 10 into two waves: Wave A
(provider settings, abilities menu, tool registry, tabs/history) ships in `ai-chat-tlc` itself;
Wave B is the part that can only be built once **this** branch's marketplace/
`CanvasRuntimeProvider` work exists — so it lands here instead, as this phase. Original ticket IDs
were T10.4-T10.7+; renumbered T8.1-T8.4 to match this doc's scheme. All four are now grilled to
dispatch-ready (T8.4 has one small item left open, the attribution question — see its own bullet).
Dispatch is still gated on this branch rebasing onto `ai-chat-tlc` first, per the branch-strategy
note above.

Devkit facts needed to read T8.1 (from `ai-chat-tlc`'s decision record, ticket D6, re-grilled
2026-07-31 — full detail in `nostr-canvas`'s own `PLAN.md`): `PreviewAdapter` wraps any real
`RuntimeAdapter` — `publish_event` signs for real, then blocks on a host-supplied review callback
(publish/discard) before actually broadcasting; `upload_image` never touches the real adapter,
returns a local blob URL; `navigate` never navigates, calls a host-supplied toast callback
instead; every other capability (`fetch`, `get_profile`, `subscribe`, `fetch_events`,
`get_public_key`, `get_contacts`, `nip44_encrypt`/`decrypt`) passes straight through unmodified.
`computePreviewGrantKey(slug, declaredCaps, version)` is a deterministic grant-store identifier;
`version` lets future scheme changes invalidate old stored grants. An ephemeral-identity helper
(`getOrCreateEphemeralIdentity(storage)`) generates/persists an nsec-backed signer via
`nostr-tools` for hosts with no logged-in user. `PreviewSession` is a headless, stateful class:
`new PreviewSession({ adapter, grantBackend, previewPubkey })` (adapter is the host's
already-`PreviewAdapter`-wrapped real adapter), `build(code, settings, metadata)` →
`{ ok: true, tileId } | { ok: false, error }`, `subscribe(cb)` (stable output subscription,
transparently re-wires across rebuilds), `destroy()`.

- [ ] **T8.1 Embedded preview cards — grilled 2026-08-02, ready to dispatch** *(was T10.4)*.
      Renamed from "isolated preview panel": the preview does **not** live in a separate side
      panel. It renders inline, embedded as a rich object directly in the chat transcript, at the
      point of each `preview_tile` tool call.

      Facts confirmed first (not guessed): `PreviewTileTool.execute()` (`devkit/tools/
      preview-tile.ts`) already embeds a hidden tag in its plain-text tool result —
      `<!--PREVIEW:snap_N-->` — with `parsePreviewSnapshotId(content)` to extract it and
      `getPreviewSnapshot(id)` to fetch the actual `{ code, settings, settingMeta, placement,
      metadata }` data by id. `write-code.ts`'s `CODE_VERSION_TAG` (`<!--CODE_VERSION:N-->`) uses
      the identical pattern for code versions. So devkit already has a generic "tag-in-content,
      look-up-rich-data-by-id" convention established twice — Ditto doesn't need to invent a rich-
      embed mechanism, just build **one host-side renderer** that scans tool-result message
      content for known devkit tags and dispatches to a per-tag renderer component.
      `PreviewAdapter.publishEvent`'s discard path (`preview-adapter.ts:85-86`) literally
      `throw`s `new Error("Publish discarded by review callback.")` back into the calling Lua code
      — confirmed against source, not assumed.

      Decisions:
      - **Rich-embed mechanism is generic from the start**: a tool-result-tag → renderer-component
        registry, keyed by tag type (today: `PREVIEW_SNAPSHOT_TAG` → the preview card component).
        `preview_tile` is the first and only consumer today, but a second rich tool later doesn't
        need a refactor.
      - **One card per `preview_tile` call**, not one live-updating card. Each call mints a new
        `snap_N` id (confirmed: `storeSnapshot` increments `nextSnapshotId` every call), so the
        chat transcript naturally accumulates a visible history of iterations rather than
        overwriting in place.
      - **Each card gets its own isolated `PreviewSession`** (built from that snapshot's `{ code,
        settings, metadata }` via `getPreviewSnapshot(id)`), not a single session shared across all
        cards in a tab. Cheap to construct (wraps an adapter + grantBackend + previewPubkey).
        Keeps every historical card independently interactive — clicking an older card's buttons
        never rebuilds or clobbers whatever the AI is currently iterating on.
      - **Cap of 5 live/interactive cards per tab.** Beyond the cap, the oldest live card
        auto-freezes to a static last-rendered screenshot instead of a running runtime, bounding
        worker/memory usage on long iteration sessions.
      - `previewPubkey` = logged-in user's pubkey, or devkit's ephemeral-identity helper if logged
        out, per D6's design above. Publish-review UI on a card: shows the AI's signed event, user
        chooses publish/discard; discard surfaces as a real thrown error the AI's tool-calling loop
        sees, not a silent no-op.
      *Eval:* automated — unit tests for the tag-registry renderer (unknown tags render as plain
      text, known tags dispatch correctly), the per-card isolated-session construction, and the
      5-card live cap (oldest freezes on the 6th). Manual (user will run before closing): ask the
      Tiles ability to iterate on a widget 6+ times, confirm each `preview_tile` call produces its
      own card, the oldest freezes once the cap is hit, and clicking an older still-live card's
      button doesn't affect the newest card's state.
- [ ] **T8.2 Publish flow — grilled 2026-08-02, ready to dispatch (one porting dependency, see
      below)** *(was T10.5)*. Once a drafted widget looks right in preview, publish it as a real
      kind 30207 event.

      Facts confirmed first (not guessed): this branch (`tiles-v3-widgetonly`) currently has
      **no** tile-authoring/publish code at all — `src/tiles/installations.ts` is install-only,
      and there's no existing "publish plumbing" to reuse as the original ticket text assumed.
      The real identifier-construction logic already exists, fully written, tested-in-spirit, and
      documented, but on the **`integrate-tiles` branch** at `src/lib/nostr-canvas/
      identifiers.ts` (confirmed via `git ls-tree` across branches — absent from `main`,
      `tiles-v3-widgetonly`, and its backup) — and `tile-studio` independently ported a copy of it
      (`tile-studio/src/lib/identifiers.ts`, docstring: "ported from Ditto's identifiers.ts").
      That file already provides exactly what T8.2 needs:
      - `buildLocalDraftIdentifier(pubkey, slug)` → `<pubkey12>@local:<slug>`, a placeholder
        identifier that passes `parseTileDefEvent`'s validation (requires `@` before the colon)
        but is syntactically unmistakable as non-publishable.
      - `buildPublishableIdentifier(nip05, slug)` → validates the NIP-05 regex + normalizes/
        validates the slug (`[a-z0-9-]`, ≤64 chars), returns `null` on invalid input.
      - `canPublishTile(metadata)` → true iff `metadata.nip05` is syntactically valid.
      - `verifyTileDTag`/`tileVerificationState` → three-state (`malformed`/`unverified`/
        `verified`) classification already used for marketplace trust display.

      Decisions:
      - **Porting dependency**: `src/lib/nostr-canvas/identifiers.ts` needs porting from
        `integrate-tiles` onto this branch before/as part of T8.2 — not written fresh. Check
        whether `integrate-tiles` has diverged in ways that make a straight port unsafe; if so,
        treat it as a reference implementation instead of a literal copy.
      - **NIP-05 gating timing, resolved by the ported code's own design**: gating is
        **publish-time only**, via `canPublishTile(metadata)`. A user without a NIP-05 can draft
        and preview freely using `buildLocalDraftIdentifier`'s placeholder scheme; only the final
        publish action is blocked, with a prompt to add a NIP-05 first. This also resolves T8.4's
        still-open "does remix require a NIP-05 before starting" question: no, same publish-time
        gate applies.
      - **D-tag collision check**: before publish, query `{ kinds: [30207], authors: [pubkey],
        '#d': [candidateIdentifier] }`. If a match already exists, **block** the publish action
        and surface it back to the AI/user so a different slug gets chosen — never silently
        replace an unrelated earlier tile the user forgot about.
      - The "slug" the AI settles on early in the conversation (needed anyway per D5's
        requirements-gathering flow — see `ai-chat-tlc`'s decision record) is the same value
        threaded into D6's `computePreviewGrantKey` during preview, so a tile's preview-time
        capability grants carry over cleanly once it's actually published.
      *Eval:* automated — unit tests for the collision check (blocks on match, passes on no
      match) and the publish-time-only gating (draft/preview succeeds with no NIP-05, publish
      button disabled until one exists). Manual (user will run before closing): draft a tile via
      Tiles ability with no NIP-05 set, confirm preview/iteration works and publish is blocked;
      add a NIP-05, confirm publish succeeds and the tile appears in the marketplace as
      `verified`.
- [ ] **T8.3 Discovery toast — grilled 2026-08-02, ready to dispatch** *(was T10.6)*. "New: Create
      with Ditto" overlay, shown once per user on the first AI chat open after this ships — a
      single `localStorage` flag checked on mount, so both brand-new users and existing users
      seeing the feature for the first time get it (neither has the flag set yet). Clicking the
      toast opens the abilities popover (T10.1) directly rather than just dismissing — a discovery
      aid pointing at "Tiles," not just a banner. Dismissing without clicking sets the flag too
      (shown once regardless of outcome).
      *Eval:* automated — unit test for the localStorage-flag gating (shows once, never again
      after dismiss or click). Manual (user will run before closing): fresh browser profile, open
      AI chat, confirm the toast shows; click it, confirm the abilities popover opens; reload,
      confirm it never shows again.
- [ ] **T8.4 Marketplace remix — grilled 2026-08-02 on `ai-chat-tlc`, mostly ready to dispatch
      (one item still open, see below)** *(was T10.7+)*. Depends on T8.2 (publish) already
      working.

      Entry point: a "Remix with AI" button on the tile's marketplace detail page, alongside the
      existing "Install" action. It opens the AI chat widget and forks a new "Tiles" session via
      `ai-chat-tlc`'s T10.1 pre-seed argument — same ability, same tool bundle, not a separate
      flow.

      Pre-seed mechanism: confirmed against the actual devkit tool source
      (`devkit/tools/read-code.ts`, `write-code.ts`) — `read_code`/`write_code` are backed by
      host-supplied `getCode`/`setCode` closures over wherever the session keeps its code state,
      not a chat-message injection. Remix initializes that state with the target tile's existing
      Lua source directly (so `read_code` returns it from turn one), plus one added line in the
      system/user prompt telling the AI to call `read_code` to see the current tile before making
      changes.

      Publish semantics: remix always forks. Publishing creates a **brand-new** kind 30207 event
      under the remixing user's own `nip05:slug` identifier — new slug, current user as author —
      regardless of who authored the original. No update-in-place option, no ownership check; this
      matches how T8.2 already treats any AI-drafted tile.

      NIP-05 gating, resolved by T8.2's grilling: **no**, remix does not require a NIP-05 to
      start. Same publish-time-only gate as any AI-drafted tile — `buildLocalDraftIdentifier`
      lets the user remix and iterate on a local draft freely; `canPublishTile` only blocks the
      final publish action.

      Still open (grill immediately before dispatch): whether the published remix carries any
      attribution/reference back to the original tile.

**Open items, not yet scoped in detail** *(carried over from `ai-chat-tlc`, surfaced 2026-07-31
while discussing this phase's scope)*:
- Image generation via `gpt-image-1` as its own devkit tool/skill, for T8.2's AI-generated tile
  image.
- A URL-scheme handler mechanism for tiles (e.g. a bitcoin tile handling `bitcoin:` URLs) as a
  special case of the `navigate`/`nav` capability — touches the same capability surface D6/T8.1
  rely on.
- A nostr-canvas spec (TIP) clarification: `render_event`-placement tiles must not render their
  own action buttons — that's the client's job (tile chrome and/or feed rendering).
- Lua linting for the Tiles ability. The user is porting `luacheck` to TypeScript to eventually
  serve as devkit's Lua lint engine, removing any need for a `fengari-web` CSP-sandboxing
  workaround. `ai-chat-tlc` briefly added a sandboxed-iframe lint implementation
  (`src/sandbox/luaLint/`, `useLuaLintSandbox.tsx`) but deleted it as dead code since nothing in
  that branch's UI ever wired it up — wait for the `luacheck` port and build lint support
  directly against it here, rather than resurrecting the sandbox approach. Not scoped further
  until the port exists.

---

## Tier 4 size and split findings (2026-08-03)

Measured against `ai-chat-tlc`: 111 files changed, 11,222 insertions, 577 deletions, 119 commits
ahead. Breakdown: 6,587 lines are production code, 3,650 are tests, 230 is the lockfile bump, and
1,332 are the two plan `.md` files (deleted before merge, so not real review surface).

Of the 6,587 production lines, about 3,554 (54%) are stale duplicates of files that already exist
correctly in `ai-chat-tlc` — the whole AI-chat surface, plus the dead Lua-lint sandbox this branch
never rebased away. This branch's `deploy.yml` also still has the exact unsafe branch-trigger
repoint Dirk flagged on !245 (`branches: ["tiles-v3-widgetonly"]` instead of `main`). Fix that and
rebase onto `ai-chat-tlc`'s real tip before anything else — this alone should roughly halve the
diff, with no feature loss.

The remaining ~2,962 lines are genuine Tiles/Widgets work, all Phase 0-7 — Phase 8 (AI-chat widget
creation and remix, T8.1-T8.4 above) has not been written on this branch yet, so today's diff
carries zero Phase 8 lines. Natural split, once rebased:

- **MR A — core runtime + frame redesign** (Phases 0-3 remainder, already `done`/human-verified):
  ~1,450 lines. `CanvasRuntimeProvider.tsx`, `installations.ts`, `adapter.ts`, `TileOutputView.tsx`,
  `WidgetCard.tsx`, `WidgetSidebar.tsx`, `widgetAccent.ts`, and related small files.
- **MR B — marketplace TLC + widget settings** (Phase 4): ~1,225 lines. `TilesPage.tsx`,
  `TileDetailPage.tsx`, `TileInstallDialog.tsx`, `WidgetPickerDialog.tsx`, `MarketplaceNag.tsx`,
  `marketplace.ts`, `TileSettingsPage.tsx`, `TilePublishCard.tsx`.
- **MR C — feed integration** (Phase 5): ~160 lines. `feedKinds.ts` and small feed-hook touches.
  Small enough to fold into MR B if a fourth MR feels like overkill.
- **MR D — AI-chat widget creation + remix** (Phase 8, T8.1-T8.4): not written yet, size unknown.
  This is the piece proposed to Dirk as landing last, once MR A-C exist and the marketplace/runtime
  infrastructure T8.1-T8.4 depend on is in place.

These file-count splits are approximate where a file is shared between the AI-chat and tile-4
surface (`App.tsx`, `AppRouter.tsx`, `schemas.ts`, `AppContext.ts`, `SettingsPage.tsx`), and do not
yet break test-line counts down per bucket.

## Human review queue (carried over from `AI_CHAT_TILES_PLAN.md`, 2026-08-03)

Most of the original queue duplicated `!245`'s own "How to Test" checklist for `ai-chat-tlc`'s
Wave A work (provider settings, tool registry, tabs, NIP lookups, composer autocomplete). That
MR's self-review checklist already confirms manual testing happened there, so those items are not
repeated here.

Two items are not covered anywhere else, because they live in a separate repo
(`~/repos/tile-studio`) with no plan doc tracked in this session:

- [ ] Phase 9 / T9.1 — Full manual AI-authoring session on tile-studio's deployed dev instance.
      Ask the AI to write a trivial tile. Confirm tool calls run and the code editor updates.
      Confirm an `ask_questions` call pauses correctly and resumes on answer. Confirm no new
      console errors appear.
- [ ] Phase 9 / T9.2 — Click-through confirmation of the interaction-dispatch fix (`a445ac5`).
      Edit a tile with a `Button`/`publish_event` handler. Run the preview. Confirm the click
      actually fires — the review dialog appears, or the tile's own state updates — instead of
      doing nothing.

---

## Working agreement

- Tickets dispatched to `coder`; verification to `tester`; risky diffs get a
  `researcher` review pass. Every ticket: `npm run test` green + its listed
  manual check before close. Commit per completed ticket/phase per
  `git-workflow` conventions.
