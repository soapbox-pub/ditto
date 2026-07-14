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
- `canvasTileSettings`: declared tile-setting values, keyed by the same
  author-bound coordinate and synced with encrypted settings. Values are
  validated against the installed definition before they hydrate the runtime.
  Capability grants remain local per device and must never be derived from this
  synced data.

`AppContext`, `AppConfigSchema`, `EncryptedSettingsSchema`, and `TestApp` must
be updated together for the synced `installedCanvasTiles` and
`canvasTileSettings` config fields. The raw event is validated with the library
parser before it is cached or registered.

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

## Phase 1: Marketplace Foundation (Complete)

Installed the exact `@soapbox.pub/nostr-canvas@0.11.0` dependency and added a
small `src/tiles/` boundary around the upstream parser. `parseTileDefinition()`
uses `parseTileDefEvent()` and sanitizes optional event-provided image URLs.

The `/tiles` marketplace now discovers schema-3, `nostr-canvas-tile` tagged
kind-30207 events through Nostrify, retains the newest valid definition per
identifier, and only displays tiles after their NIP-05 identifier namespace
verifies to the event author. It includes deterministic search and installation
status helpers. The `/tiles/:naddr` detail page fetches the exact author-bound
addressable event and safely renders sanitized markdown metadata plus escaped
Lua source.

Ditto now renders valid kind-30207 publications with a native
`TilePublishCard` in feeds and embedded previews. Invalid definitions are
hidden, and event Lua is never rendered as a text note. Kind labels, feed
registration, action-header grammar, comment context, the `feedIncludeTiles`
setting (default `true`), and the upstream NIP link in `NIP.md` were also
registered. Tile publishing does not create notifications.

Parser, marketplace, and publication-card coverage was added. Focused tests and
the complete `npm run test` suite passed before commit `c32a2a3e Add Nostr
Canvas tile marketplace foundation`.

## Phase 2: Runtime Host and Safe Tile Rendering (Complete)

Added `CanvasRuntimeProvider` with a stable Rust worker pool, a Ditto-owned
adapter for Nostrify queries, signing, profiles, NIP-44, notifications, and
safe HTTPS-only fetches. The adapter strips credentials and sensitive headers,
and `ctx.navigate()` remains an explicit no-op.

`TileOutputView` renders the supported declarative output nodes through Ditto
UI primitives, sanitizes event-provided URLs and markdown, and fails closed for
`feed`, `comments`, and `nevent` nodes without fetching or routing. Focused
adapter/output tests and the complete suite passed before commit `718335f7 Add
Nostr Canvas runtime host`.

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

## Phase 3: Installation, Permissions, and Persistence (Complete)

Added author-bound installed-tile coordinates and declared setting values to
the encrypted kind-30078 settings backup. Raw kind-30207 definitions remain in
local-only storage and are restored through author-constrained coordinate
queries when absent on a new device.

Installations now require an explicit per-capability decision, with grants kept
local to the active account and device. Tile detail pages support install,
update, and removal; invalid synced records and undeclared setting values are
discarded. Focused persistence/schema tests and the complete suite passed
before commit `b4e83445 Add Canvas tile installation persistence`.

### Red tests

1. Test that install persists a validated coordinate plus local raw definition,
   grants only the explicitly approved declared capabilities, registers the
   tile, restores from an author-constrained coordinate fetch, and survives a
   provider remount.
2. Test cancellation, denial, uninstall, updates, duplicate identifiers, and
   account switches. In particular, no previously approved capability may bleed
   into another account or an anonymous session.
3. Test all AppConfig/encrypted-settings schema handling for malformed synced
   coordinates and setting records, setting-field synchronization, and backward
   compatibility with accounts that have no canvas data.

### Implementation

1. Add the `installedCanvasTiles` and `canvasTileSettings` config triples and
   synchronise them using the existing encrypted-settings flow. Persist full raw
   definitions only in a local cache; on another device, restore them by
   fetching the coordinate with the addressable event's author constraint.
2. Add an install permission dialog that lists all declared capabilities in
   clear language, defaults to no selection, and allows per-capability approval.
   Show the verified author and the exact tile identifier in the dialog.
3. Store grants locally, scoped to the current pubkey. Re-prompt on a new device
   or account rather than assuming synced installation means consent.
4. Add install, remove, and update controls to the tile detail view. Updating
   re-evaluates declared capabilities and prompts again when the requested set
   grows.
5. Forward login/logout and scope changes to the runtime; restore only validated
   installed definitions and declared setting fields, and destroy them on
   removal. Capability grants stay device-local and scoped to the current
   pubkey.

### Review checkpoint

Stop with red tests for permission and account-scope behavior. Review before
implementation, then validate with the full suite and commit this phase.

## Phase 4: Existing Sidebar Widget Integration (Complete)

Canvas widgets will remain a runtime-derived catalog. `WIDGET_DEFINITIONS` and
`DEFAULT_SIDEBAR_WIDGETS` continue to describe native widgets only. The sidebar
will derive `canvas:<identifier>` definitions only from installed, registered
tiles that declare a `widget` tag, merge them with the native catalog for
lookup and picking, and render their output through `useTile(identifier,
{ placement: "widget" })` plus Ditto's `TileOutputView`. This hook owns the
per-mount tile lifecycle, including destruction on removal and unmount.

An installed coordinate whose definition cannot be resolved locally is kept as
an existing sidebar configuration so it remains removable, but renders a
compact recovery state rather than creating a runtime instance. It must not
appear in the selectable widget catalog until its definition is restored.

The widget picker now merges this runtime-derived Canvas catalog with the
unchanged native registry. `CanvasTileWidget` uses the upstream `useTile` hook
with `placement: "widget"`, sends interactions through Ditto's runtime, and
lets the hook tear down the fresh instance when its widget is removed or the
sidebar unmounts. Existing installed widgets with a missing local definition
render a `/tiles` recovery link; uninstalled or stale widget IDs remain hidden
using the existing unknown-widget behavior.

Focused catalog and widget-host coverage was added. The complete `npm run
test` suite passed before commit `ac3c5d38 Add Canvas sidebar widgets`.

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

Canvas discovery remains available in Capacitor apps, but tile installation and
Lua worker execution are browser-only until the native WebView path is verified.
Native install/update actions show a clear availability dialog, and native
sidebar widgets never mount a tile instance. Platform and execution-gate tests
plus the complete suite passed before commit `9d36d14c Gate Canvas tiles to
browsers`.

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
