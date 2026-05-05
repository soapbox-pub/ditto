---
name: nostr-kinds
description: Decide whether to reuse an existing NIP or mint a new kind, design tag structures that relays can index, choose what goes in content vs. tags, and register a new kind in Ditto's many UI touchpoints (feed cards, detail pages, embedded previews, kind-label maps).
---

# Nostr Kinds — Design and Registration

Use this skill when introducing a new kind to Ditto, extending an existing NIP with new tags, or deciding whether an existing NIP covers a feature. It covers the decision framework, schema rules, and — critically — the full list of places a new kind must be registered in Ditto's UI.

## Choosing Between Existing NIPs and Custom Kinds

1. **Thorough NIP review first.** Browse the NIP index, then read candidate NIPs in detail. The goal is to find the closest existing solution.
2. **Prefer extending existing NIPs** over creating custom kinds, even at the cost of minor schema compromises. Custom kinds fragment the ecosystem.
3. **When an existing NIP is close but not perfect**, use its kind as the base and add domain-specific tags. Document the extension in `NIP.md`.
4. **Only mint a new kind** when no existing NIP covers the core functionality, the data structure is fundamentally different, or the use case requires different storage characteristics (regular vs. replaceable vs. addressable).
5. **If a tool to generate a new kind number is available, you MUST call it.** Never pick an arbitrary number.
6. **Custom kinds MUST include a NIP-31 `alt` tag** with a human-readable description of the event's purpose.

**Example decision:**

```
Need: Equipment marketplace for farmers
Options:
  1. NIP-15 (Marketplace)   — too structured for peer-to-peer sales
  2. NIP-99 (Classifieds)   — good fit, extensible with farming tags
  3. Custom kind            — perfect fit, no interoperability

Decision: NIP-99 + farming-specific tags.
```

## Kind Ranges

An event's kind number determines storage semantics:

- **Regular** (1000 ≤ kind < 10000) — stored permanently by relays. Notes, articles, etc.
- **Replaceable** (10000 ≤ kind < 20000) — only the latest event per `pubkey+kind` is kept. Profile metadata, contact lists, mute lists.
- **Addressable** (30000 ≤ kind < 40000) — identified by `pubkey+kind+d-tag`; only the latest per combo is kept. Long-form content, products, definitions.

Kinds below 1000 are "legacy"; storage is per-kind (e.g. kind 1 is regular, kind 3 is replaceable).

## Tag Design Principles

- **Kind = schema, tags = semantics.** Don't mint a new kind just to represent a different category of the same data.
- **Relays only index single-letter tags.** Use `t` for categories so filters like `'#t': ['electronics']` work at the relay level. Multi-letter tags (`product_type`, etc.) force inefficient client-side filtering.
- **Filter at the relay**, not in JavaScript:

  ```ts
  // ❌ Fetch everything, filter locally
  const events = await nostr.query([{ kinds: [30402] }]);
  const filtered = events.filter((e) => hasTag(e, 'product_type', 'electronics'));

  // ✅ Filter at the relay
  const events = await nostr.query([{ kinds: [30402], '#t': ['electronics'] }]);
  ```

- **For Ditto-specific niches** (community apps, regional variants), tag events with a `t` value and query on it. Don't do this for generic platforms — it would silo content.

## Content vs. Tags

- **`content`** — large freeform text or existing industry-standard JSON (GeoJSON, FHIR, Tiled maps). Kind 0 is the one exception where structured JSON goes in content.
- **Tags** — queryable metadata, structured data, anything you might filter on.
- **Empty content is fine.** `content: ""` is idiomatic for tag-only events.
- **If you need to filter by a field, it must be a tag** — relays don't index content.

```json
// ✅ Queryable
{ "kind": 30402, "content": "",
  "tags": [["d", "product-123"], ["title", "Camera"], ["price", "250"], ["t", "photography"]] }

// ❌ Structured data buried in content
{ "kind": 30402, "content": "{\"title\":\"Camera\",\"price\":250}", "tags": [["d", "product-123"]] }
```

## `NIP.md`

`NIP.md` documents Ditto's custom kinds and any extensions to existing NIPs. Whenever you mint a new kind or change a custom schema, **create or update `NIP.md`** with the tag list, content format, and intended usage. If a kind you add is effectively the same shape as an existing NIP, note the NIP reference rather than duplicating the spec.

## Registering a New Kind in the Ditto UI

When adding support for a new kind, the kind must be registered in **multiple locations** or it will render incorrectly in certain views (blank content in quote posts, "Kind 12345" as a label, missing action headers, etc.).

### Checklist

1. **Content card component** (`src/components/`) — create `<MyKindCard>` that renders the event's tags/content appropriately.

2. **Feed rendering** (`src/components/NoteCard.tsx`):
   - Add `const isMyKind = event.kind === XXXX;`.
   - Include it in the appropriate group flag (e.g. `isDevKind`) or the `isTextNote` exclusion list.
   - Add the content dispatch: `isMyKind ? <MyKindCard event={event} /> : …`.
   - Add an entry to `KIND_HEADER_MAP` for the action header (e.g. "deployed an nsite").
   - Import the new component and any new icons (e.g. `Globe` from `lucide-react`).

3. **Detail page** (`src/pages/PostDetailPage.tsx`):
   - Mirror the `isMyKind` detection and group/exclusion flags from `NoteCard`.
   - Add the content dispatch for the detail view.
   - `shellTitleForKind()` falls through to the central `KIND_LABELS` registry, so adding a label there is sufficient for the loading-state title. Only add a manual override in `shellTitleForKind()` if the kind belongs to a group (e.g. music kinds → "Track Details") or needs a composite label (e.g. "Badge Collection").
   - Import the new component.

4. **Feed registration** (`src/lib/extraKinds.ts`):
   - Add the kind number to an existing feed definition's `extraFeedKinds` array, or create a new `ExtraKindDef` entry.

5. **Central kind label registry** (`src/lib/kindLabels.ts`):
   - Add an entry to the `KIND_LABELS` map with a short, user-facing label (capitalized noun phrase, no articles).
   - This registry is the single source of truth for kind→label mappings and is consumed by the nsite permission prompt, signer nudge toasts, detail page loading titles, and addressable event preview headers.
   - Some UI contexts maintain **context-specific** label maps that cannot use the central registry directly (they need different grammar):
     - `KIND_LABELS` and `KIND_ICONS` in `src/components/CommentContext.tsx` — uses articles ("a post", "an article") for "Commenting on {label}" text.
     - `NOTIFICATION_KIND_NOUNS` in `src/pages/NotificationsPage.tsx` — uses bare lowercase nouns for notification action text.
     - `KIND_HEADER_MAP` in `src/components/NoteCard.tsx` — uses action verbs + nouns for feed headers.
   - These context-specific maps must also be updated when adding a new kind.

6. **Embedded note cards** (`src/components/EmbeddedNote.tsx`, `src/components/EmbeddedNaddr.tsx`) — small preview cards shown inside quote posts, reply-context indicators, and CommentContext hover cards. They are **separate components** from `NoteCard` and render a minimal preview (author + title/content + attachment indicators). Basic rendering works for all kinds automatically, but kinds whose media lives in tags (e.g. kind 20 photos via `imeta` tags) may need attachment-indicator logic added to `EmbeddedNoteCard`.

   > Do not confuse these with the `compact` prop on `NoteCard` — that just hides action buttons on the full `NoteCard`. `EmbeddedNote`/`EmbeddedNaddr` are entirely different components.

7. **Reply composer** (`src/components/ReplyComposeModal.tsx`) — `EmbeddedPost` delegates to the shared `EmbeddedNote`/`EmbeddedNaddr` components, so no per-kind registration is needed here.

### Why so many places?

These are genuinely different UI contexts (feed cards, detail pages, embedded previews, reply previews, comment-context labels) with different rendering requirements. The central `KIND_LABELS` in `src/lib/kindLabels.ts` handles the common case, but several contexts need grammar-specific maps (articles, verbs, lowercase nouns) that can't be derived mechanically. **When in doubt, grep the codebase for an existing kind number like `30617`** — you'll find every registration point you need to mirror.
