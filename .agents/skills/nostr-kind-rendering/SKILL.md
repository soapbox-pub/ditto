---
name: nostr-kind-rendering
description: Add UI rendering for an event kind Ditto doesn't yet display — feed cards, detail pages, embedded previews, notifications, routes, feed-toggle registration, and the several kind-label maps (KIND_LABELS, KIND_HEADER_MAP, NOTIFICATION_KIND_NOUNS, CommentContext) that must stay in sync. Load when asked to "support / display / render" a NIP or kind number, when a kind renders blank or as "Kind 12345", or when quote embeds of a kind show "This event kind is not supported".
---

# Nostr Kinds — UI Rendering Checklist

Ditto's kind dispatch is **spread across many files** by design — feed cards, detail pages, embedded previews, notifications, and several kind-label maps each have their own rendering requirements. The central `KIND_LABELS` registry covers the easy cases, but most context-specific maps (grammar, icons, verbs) cannot be derived mechanically and must be updated manually.

**Missing any location causes visible bugs**: a kind might render blank in quote posts, show "Kind 12345" as a label, skip its action header, tombstone as "This event kind is not supported" in embeds, or — worst of all — have its content fed through the kind-1 tokenizer and auto-linkify URLs/hashtags that weren't authored by the event creator.

**When in doubt, grep for an existing kind number like `30617` or `9802`** — you'll find every registration point you need to mirror.

## Decision: Feed-toggle + dedicated page, or just rendering?

Before touching code, pick one:

- **Just render it everywhere Nostr content appears** (no feed toggle, no dedicated page). Use when the kind is niche or only reached via direct links / quote embeds. Minimal surface — steps 1–6 below.
- **Add a feed toggle + optional dedicated page.** Use when users should be able to browse events of this kind or opt them in/out of their home feed. Requires the feed registration (step 7) and `AppConfig` triple (step 8).

When the user asks generally to "support" a kind, ask which direction they want if it's not obvious from context.

## Checklist

### 1. Content card component (`src/components/`)

Create `<MyKindCard event={event} />` that renders the event's tags/content appropriately.

- **Never run event content through the kind-1 tokenizer** (`<NoteContent>` / `<TruncatedNoteContent>`) unless the kind's content is actually free-form user prose. Quote-type content (highlights, snippets, citations) contains URLs and hashtags from the *source*, not the event author — tokenizing them is misleading.
- Render plaintext with `whitespace-pre-wrap break-words` inside a `<p>` instead.
- Route any event-sourced URLs (`r` tags, media URLs, source links) through `sanitizeUrl()` from `@/lib/sanitizeUrl` before using them in `href`/`src`.
- Support an `expanded` prop if the card looks different on the detail page than in the feed.

### 2. Feed card dispatch (`src/components/NoteCard.tsx`)

Three edits in this file:

1. **Flag block** (around lines 384–435): add `const isMyKind = event.kind === XXXX;`.
2. **`isTextNote` negation list** (around lines 440–475): add `&& !isMyKind`. Without this, unknown kinds fall through to `UnknownKindContent` (showing only the `alt` tag).
3. **Content dispatch ternary** (around lines 578–692): add `) : isMyKind ? (<MyKindCard event={event} />`.
4. **`KIND_HEADER_MAP`** (around lines 1710+): add an entry so the feed shows "Alice shared a *noun*" or similar. Pattern:
   ```ts
   9802: {
     icon: Highlighter,
     action: "shared a",
     noun: "highlight",
     nounRoute: "/highlights",  // omit if no dedicated page
   },
   ```
5. Import the card component and any new lucide icons.

### 3. Detail page dispatch (`src/pages/PostDetailPage.tsx`)

Mirror the three NoteCard edits:

1. **Flag block** (around lines 1021–1098): `const isMyKind = event.kind === XXXX;`.
2. **`isTextNote` negation list**: add `&& !isMyKind`.
3. **Content dispatch ternary** (around lines 2147–2251): add `) : isMyKind ? (<MyKindCard event={event} expanded />`.

The loading-state title uses `shellTitleForKind()`, which falls through to `KIND_LABELS` — no override needed unless the kind belongs to a group ("Music Details") or needs composite grammar.

### 4. Central kind label (`src/lib/kindLabels.ts`)

Add a **capitalized noun phrase, no articles** to the `KIND_LABELS` map:

```ts
9802: 'Highlight',
```

This is consumed by the detail-page loading title, nsite permission prompt, signer nudge toasts, and addressable-event preview headers. Ignoring this gives "Kind 9802" everywhere it appears.

### 5. Context-specific label and icon maps

Each of these maps exists because the surrounding UI needs a different grammatical form. They are **not derived** from `KIND_LABELS` and must be updated manually.

- **`src/components/CommentContext.tsx`** — `KIND_LABELS` (uses articles: `'a highlight'`, `'an article'`) and `KIND_ICONS` (lucide component reference). Rendered as "Commenting on {label}". Without an entry you get "an unsupported event".
- **`src/pages/NotificationsPage.tsx`** — `NOTIFICATION_KIND_NOUNS` (bare lowercase nouns: `'highlight'`, `'article'`). Rendered as "reacted to your {noun}". Without an entry you get "post" as a fallback.
- **`src/components/NoteCard.tsx`** — `KIND_HEADER_MAP` (already covered in step 2).

### 6. Embedded previews (`src/components/EmbeddedNote.tsx`)

The quote-embed dispatcher in `EmbeddedNote` (around lines 65–110) routes kinds to dedicated compact cards. **Without a branch here, non-content kinds fall through to `EmbeddedNoteCard`, which either:**

- Shows only the NIP-31 `alt` tag (if present), or
- Tombstones as "This event kind is not supported", or
- **Feeds the event's `content` through the kind-1 tokenizer** if the kind is mistakenly treated as a content-kind — auto-linkifying URLs and hashtags that weren't authored by the event creator. This is a security/UX bug.

For any kind whose `content` isn't freeform user prose, add an explicit dispatch branch even if it just renders a minimal compact card. Pattern:

```tsx
if (event.kind === 9802) {
  return <EmbeddedHighlightCard event={event} className={className} disableHoverCards={disableHoverCards} />;
}
```

Then define the compact card using `EmbeddedCardShell` for the author row + navigation, and render the kind-specific body inside. See `EmbeddedHighlightCard` and `EmbeddedBadgeAwardCard` for reference.

`src/components/EmbeddedNaddr.tsx` works similarly for addressable kinds — add a branch there if your kind is addressable.

### 7. Feed/sidebar registration (`src/lib/extraKinds.ts`)

Only needed if you decided on "feed-toggle + dedicated page" above. Add an `ExtraKindDef`:

```ts
{
  kind: 9802,
  id: 'highlights',
  showKey: 'showHighlights',
  feedKey: 'feedIncludeHighlights',
  label: 'Highlights',
  description: 'Noteworthy excerpts from articles, posts, and the web (NIP-84)',
  route: 'highlights',          // omit for feed-only registration
  addressable: false,
  section: 'social',            // feed | media | social | development | whimsy
  blurb: 'Longer marketing copy shown in the info modal.',
},
```

Then:

- **Sidebar icon** (`src/lib/sidebarItems.tsx`) — add `{ id: "highlights", label: "Highlights", path: "/highlights", icon: Highlighter }` to `SIDEBAR_ITEMS`, and import the icon at the top. `CONTENT_KIND_ICONS` picks up the icon automatically from the sidebar definition.
- **Route** (`src/AppRouter.tsx`) — add `const highlightsDef = getExtraKindDef("highlights")!;` at the top of the file and a `<Route path="/highlights" element={<KindFeedPage kind={highlightsDef.kind} title={highlightsDef.label} icon={sidebarItemIcon("highlights", "size-5")} />} />` above the catch-all `*` route.

### 8. `AppConfig` triple (required if you added feed/sidebar toggle keys in step 7)

Three files must stay in sync, or the build fails or the setting silently no-ops:

1. **`src/contexts/AppContext.ts`** — add the fields to the `FeedSettings` interface with JSDoc comments.
2. **`src/lib/schemas.ts`** — add the same fields to `FeedSettingsSchema` as `z.boolean().optional()`. `DittoConfigSchema` is derived from `AppConfigSchema` with `.strict()` mode, so any `ditto.json` field missing from Zod is a build error.
3. **`src/App.tsx`** — add the default value in the initial `feedSettings` block.
4. **`src/test/TestApp.tsx`** — mirror the default in test config so component tests work.

Convention: `show*` toggles default to `true` (sidebar entries visible), `feedInclude*` toggles default to `false` for niche content, `true` for core feed content.

### 9. Notification integration (if applicable)

Load this step when the kind represents an interaction with the user's content (reactions, reposts, highlights, awards, etc.) — i.e. when an event author "does something with" another user's content via an `e`/`a`/`p` tag.

**Six files** to update:

1. **`src/hooks/useEncryptedSettings.ts`** — add `highlights?: boolean` (or equivalent) to the `notificationPreferences` object.
2. **`src/lib/notificationKinds.ts`** — add the kind to `ALL_NOTIFICATION_KINDS` and add a `if (p.X !== false) kinds.push(XXXX);` line in `getEnabledNotificationKinds`.
3. **`src/lib/notificationTemplates.ts`** — add a `NOTIFICATION_TEMPLATES` entry with a title and body for nostr-push server-side notifications.
4. **`src/pages/NotificationSettings.tsx`** — extend `NotificationPrefKey` union, add a row to `NOTIFICATION_TYPES` with icon/label/description/kinds.
5. **`src/hooks/useNotifications.ts`** — extend `groupKey` (decide if events of this kind group by referenced event or stand alone), and if it's a "did something to your content" kind, add it to the author-ownership filter so users only get notified for interactions with their own content.
6. **`src/pages/NotificationsPage.tsx`** — add a case to `GroupedNotificationView`'s switch; write `MyKindNotification` + `MyKindNotificationGroup` components modeled on `RepostNotification` / `LikeNotification`.

### 10. Spam guards (`src/lib/feedUtils.ts`)

If the kind has required tags (NIP-spec-mandated references, minimum content, etc.), add a check in `shouldHideFeedEvent` to hide events that don't meet the minimum bar. This pre-filters events before `NoteCard` mounts them, avoiding layout shifts from components that would return `null`.

Example:

```ts
// NIP-84 highlights with no excerpt AND no source reference.
if (event.kind === 9802) {
  const hasContent = event.content.trim().length > 0;
  const hasSource = event.tags.some(([n]) => n === 'a' || n === 'e' || n === 'r');
  if (!hasContent && !hasSource) return true;
}
```

### 11. `NIP.md` (custom kinds only)

If the kind is a Ditto-custom kind or a Ditto-specific extension of an existing NIP, document it in `NIP.md` — see the **`nostr-kind-design`** skill for the format. Standard NIPs (like NIP-84, NIP-23) do not go in `NIP.md`.

## Validation

After making changes, run `npm run test` — it runs `tsc --noEmit`, `eslint`, `vitest`, and `vite build` in sequence. All must pass. Additions to the `AppConfig` triple in particular frequently break the build if one of the four files is missed.

## Why so many locations?

These are genuinely different UI contexts (feed cards, detail pages, embedded previews, comment-context labels, notifications, sidebar routes) with different rendering requirements and grammar needs. The central `KIND_LABELS` in `src/lib/kindLabels.ts` handles the common "what to call this kind" case, but feed headers, comment-context text, and notification verbs each need their own grammar, and notification integration involves a whole independent subsystem.

## Bugs that signal a missed step

- **"Kind 12345" shown as a label** → step 4 (`KIND_LABELS`).
- **"an unsupported event" in CommentContext** → step 5 (`CommentContext` maps).
- **"reacted to your **post**"** when it should say "highlight" → step 5 (`NOTIFICATION_KIND_NOUNS`).
- **No action header above a feed card** → step 2.4 (`KIND_HEADER_MAP`).
- **Blank / `alt`-only card in quote embeds** → step 6 (`EmbeddedNote` dispatcher).
- **URLs/hashtags in quoted text auto-linkified** → step 6 (embedded dispatcher forgot to bypass the kind-1 tokenizer).
- **Kind doesn't appear in the home feed even with the toggle on** → step 7 (`ExtraKindDef` missing `feedKey`).
- **Build error mentioning a missing `FeedSettings` field** → step 8 (one of the three files out of sync).
- **Users not notified when their content is interacted with** → step 9 (notification stack).
