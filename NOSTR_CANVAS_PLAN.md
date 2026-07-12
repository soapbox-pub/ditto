# Nostr Canvas v0.11.0 Integration Plan

> Delete this file when the branch is merged.

## Scope and Decisions

Integrate `@soapbox.pub/nostr-canvas@0.11.0` as an optional, sandboxed widget
platform. Tiles are kind `30207` addressable events using schema version `3` and
the `nostr-canvas-tile` `t` tag.

This work deliberately supports the tile marketplace, native tile-publication
cards in Ditto's social feeds, and installed tiles in the existing right-sidebar
widget system. It does not register installed tiles as arbitrary event renderers
in Ditto's feeds, does not instantiate third-party tiles in the `"event"`
placement, and does not add tile items to Ditto navigation. A tile's
`ctx.navigate()` request and `ui.Feed` output will be harmless no-ops with clear,
neutral UI rather than opening a route or issuing an unnecessary relay request.

The runtime remains an extension of Ditto, not a second Nostr stack:

- The adapter delegates queries and subscriptions to `useNostr` / Nostrify.
- Signing, publishing, NIP-44, profiles, notifications, and per-user state use
  Ditto's existing hooks and providers.
- The host renders every tile output node using Ditto components and Tailwind;
  tile code never touches the DOM.
- Marketplace event metadata is untrusted. Parse before use; sanitize every
  event-provided image URL, render markdown through the installed
  `react-markdown` + `rehype-sanitize`, and never render source or markdown with
  raw HTML.
- Tile capabilities require an explicit per-account install-time decision.
  Unapproved capabilities must remain unavailable without later prompts.

No new markdown or syntax-highlighting dependency is planned. Ditto already
ships sanitized markdown rendering. Lua source will initially use escaped,
read-only `<pre><code>` output; syntax highlighting is not needed to make the
marketplace useful and would expand the bundle.

## Persistence Model

Introduce narrowly scoped canvas configuration rather than changing native
widget semantics:

- `installedCanvasTiles`: installed kind-30207 `naddr` coordinates, synced with
  encrypted settings. A coordinate includes the event author, so a new device
  can re-fetch the exact addressable event without trusting a `d` tag alone.
- A locally cached, validated raw definition keyed by coordinate. Lua source is
  not copied into encrypted settings. If the cache is missing on another device,
  fetch the coordinate with its author constraint before registration.
- `canvasTileGrants`: per-account local grant records, keyed by tile identifier.
  Capabilities are intentionally local because they are security decisions,
  unlike an installed tile selection that can sync with the account.
- Existing `sidebarWidgets` stores canvas widgets as namespaced IDs (for example
  `canvas:<identifier>`). Native widget IDs remain unchanged.
- Tile settings persist in the runtime's per-user tile store. Their cross-device
  sync is deferred: the initial scope does not expose tile settings UI, so
  silently syncing an incomplete setting model would be misleading.

`AppContext`, `AppConfigSchema`, `EncryptedSettingsSchema`, and `TestApp` must
be updated together for the synced `installedCanvasTiles` config field. The raw
event is validated with the library parser before it is cached or registered.

## Reusable Prior Work

The historical `integrate-tiles` branch in `/tmp/ditto` is a styling reference,
not an implementation source: it targets an earlier Canvas runtime contract.
Reuse its presentation patterns where they still match v0.11.0:

- A compact `TilePublishCard`: thumbnail or `LayoutGrid` fallback, title,
  version, two-line summary, and marketplace call to action.
- Marketplace cards with a responsive feature strip, install status, accessible
  verification state, image fallback, and restrained hover motion.
- Declarative output rendering mapped to Ditto primitives: `Card` surfaces,
  `Button`, `Input`, `Separator`, `Collapsible`, `Badge`, `Skeleton`, Tailwind
  flex layouts, and sanitized markdown.

Do not reuse its patch-based rendering, legacy script lifecycle, old schema
assumptions, dynamic feed renderer takeover, automatic navigation entries, or
raw event persistence model.

## Phase 1: Marketplace Foundation

### Red tests

1. Add parser tests for valid schema-3 kind-30207 events and rejection of
   malformed, unsupported-language, unsupported-schema, missing-tag, and unsafe
   image cases.
2. Add marketplace reducer/hook tests proving that the newest valid definition
   wins per identifier and that discovered tiles require a NIP-05 identifier
   matching the author before they are eligible for installation.
3. Add tests for the marketplace presentation model: deterministic search,
   installed/update state, capability labels, and no raw HTML rendering path.
4. Add red component tests for kind-30207 feed dispatch: valid tiles render the
   native publication card, malformed definitions are hidden, the event content
   is never treated as a text note, and card navigation uses the tile detail
   route.

### Implementation

1. Install the exact `@soapbox.pub/nostr-canvas@0.11.0` package using npm.
2. Add a small `src/canvas/` boundary for tile parsing, marketplace state, and
   safe presentation helpers. Keep library types inside that boundary where
   possible.
3. Query kind `30207` with `#t=nostr-canvas-tile` and `#s=3` through Ditto's
   standard Nostrify query layer. Deduplicate by full `d` identifier and newest
   `created_at`; do not trust a tile only because it shares an identifier.
4. Verify the identifier's NIP-05 namespace resolves to the tile event pubkey
   before displaying an entry as installable. Unverified results may be shown
   only as explicitly unverified discovery entries and cannot be installed in
   this initial release.
5. Create a responsive `/tiles` marketplace route using existing dialog/card,
   input, skeleton, badge, and button primitives. It provides search, loading,
   empty/error states, thumbnails with safe fallbacks, author identity,
   permissions/placement badges, a detail view, sanitized description, and
   escaped Lua source. Do not add a separate global navigation item yet.
6. Add a native `TilePublishCard` for kind `30207`, modeled visually on the
   earlier branch's compact card. Register it through the existing kind-rendering
   dispatch points needed for home/follow feeds, post detail, embedded previews,
   kind labels, header grammar, comment context, and feed filtering. This is a
   friend publishing a tile, not the runtime executing it.
7. Add the minimal feed registration needed to surface tile publications from
   follows. Default it on for the social feed only if it matches the prior
   branch's `feedIncludeTiles: true` behavior; otherwise make the default an
   explicit review decision before implementation. Do not add notifications:
   publishing a tile does not target another user's content.
8. Add kind 30207 and the upstream tiles NIP link to this repository's
   `NIP.md`; do not duplicate the upstream specification.

### Review checkpoint

Stop with the tests red, review their assertions and the planned public data
shape, then implement. Run focused tests while iterating and `npm run test`
before committing this phase.

## Phase 2: Runtime Host and Safe Tile Rendering

### Red tests

1. Test adapter behavior for subscription cleanup, authenticated publishing,
   profile lookup, NIP-44 delegation, HTTPS-only fetches with credentials and
   sensitive headers stripped, and user-visible notifications.
2. Test the output renderer for the supported layout, text, image, markdown,
   form, and button nodes. Assert unsupported `feed`, `comments`, and `nevent`
   nodes fail closed with neutral placeholders.
3. Test that `navigate` calls are rejected/no-op and never alter the current
   React Router location.

### Implementation

1. Add a long-lived `NostrCanvasProvider` below the existing providers, with a
   Vite-compatible worker pool and strict cleanup for workers, tile instances,
   abort signals, timers, and relay subscriptions.
2. Implement a thin adapter using Ditto services. It must not create a second
   relay pool or independently retain signer credentials.
3. Implement only the capabilities required for widgets: subscriptions,
   identity, profile data, safe HTTPS fetch, publish, NIP-44, and notifications.
   A missing user or denied capability returns the library's graceful failure,
   not an exception.
4. Implement a recursive, typed `TileOutputView` using existing Ditto UI
   primitives. Event-provided URLs are sanitized before image rendering;
   markdown uses `react-markdown` plus `rehype-sanitize`; text and source remain
   React text nodes.
5. Render `ui.Feed`, `ui.Comments`, and `ui.NEvent` as intentionally unsupported
   placeholders in this phase. Do not subscribe, fetch, or route from them.

### Review checkpoint

Stop with this phase's tests red before implementation. After approval, make
them green, run `npm run test`, inspect the diff for security-boundary mistakes,
and commit the isolated runtime-host change.

## Phase 3: Installation, Permissions, and Persistence

### Red tests

1. Test that install persists a validated coordinate plus local raw definition,
   grants only the explicitly approved declared capabilities, registers the
   tile, restores from an author-constrained coordinate fetch, and survives a
   provider remount.
2. Test cancellation, denial, uninstall, updates, duplicate identifiers, and
   account switches. In particular, no previously approved capability may bleed
   into another account or an anonymous session.
3. Test all AppConfig/encrypted-settings schema handling for malformed synced
   records and backward compatibility with accounts that have no canvas data.

### Implementation

1. Add the `installedCanvasTiles` config triple and synchronise it using the
   existing encrypted-settings flow. Persist full raw definitions only in a
   local cache; on another device, restore them by fetching the coordinate with
   the addressable event's author constraint.
2. Add an install permission dialog that lists all declared capabilities in
   clear language, defaults to no selection, and allows per-capability approval.
   Show the verified author and the exact tile identifier in the dialog.
3. Store grants locally, scoped to the current pubkey. Re-prompt on a new device
   or account rather than assuming synced installation means consent.
4. Add install, remove, and update controls to the tile detail view. Updating
   re-evaluates declared capabilities and prompts again when the requested set
   grows.
5. Forward login/logout and scope changes to the runtime; restore only validated
   installed definitions and destroy them on removal.

### Review checkpoint

Stop with red tests for permission and account-scope behavior. Review before
implementation, then validate with the full suite and commit this phase.

## Phase 4: Existing Sidebar Widget Integration

### Red tests

1. Test that only installed tiles declaring a valid `widget` tag appear in the
   existing widget picker, alongside all native widgets.
2. Test add, remove, resize, reordering, reload, account sync, install/remove,
   and unknown/stale tile states without regressing native widgets.
3. Test widget lifecycle: the runtime gets `placement: "widget"`, receives a
   fresh instance when the widget mounts, and always tears it down when removed
   or unmounted.

### Implementation

1. Add a dynamic canvas-widget source beside the static native registry rather
   than rewriting `WIDGET_DEFINITIONS`. The picker merges both sources and keeps
   its existing category and interaction behavior.
2. Resolve namespaced canvas widget IDs in `WidgetSidebar`, use the existing
   `WidgetCard` chrome/resizing/dragging/error boundary, and render the tile in
   its body with widget placement.
3. Keep native widget defaults unchanged. Canvas widgets are never silently
   added to fresh accounts and are removed from the selectable catalog when
   uninstalled.
4. Add a compact empty/error state for an installed tile whose local definition
   is unavailable, including a link to `/tiles` to repair it.

### Review checkpoint

Stop at red tests, review native-widget regression coverage, then implement,
run `npm run test`, and commit.

## Phase 5: Polish and Deferred Follow-ups

1. Perform keyboard, screen-reader, mobile, and reduced-motion checks on the
   marketplace, permission dialog, detail view, and sidebar widgets.
2. Re-check bundle output and worker loading in Vite and Capacitor webviews.
3. Consider a future AI-chat tool that drafts and publishes kind-30207 tiles.
   This is explicitly out of the initial integration: it needs a separate tile
   authoring UX, source validation, collision handling for the `d` identifier,
   user review of code and permissions, and `useNostrPublish`-based publishing.
4. Future arbitrary tile event-renderers, navigation, `ui.Feed`, `ui.NEvent`,
   and comments support must each be separately designed, tested, and
   security-reviewed before their no-op host behavior is replaced. The native
   kind-30207 publication card delivered in Phase 1 is intentionally separate
   from this deferred renderer capability.

## Commit Discipline

Each implementation phase follows this exact loop:

1. Re-read this plan and select the next unfinished phase.
2. Write the phase's tests so they fail for the intended missing behavior.
3. Pause for review before production implementation.
4. Implement the smallest cohesive change that makes those tests pass.
5. Run focused tests and then `npm run test`.
6. Review `git status`, `git diff`, and recent commits; commit only the completed
   phase with a focused message.
7. Return to step 1 for the next phase.
