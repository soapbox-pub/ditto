---
name: nostr-comments
description: Implement Nostr comment systems, add discussion features to posts/articles, build community interaction features, or attach comments to any external content identifier including URLs, hashtags, and NIP-73 identifiers (ISBN, podcast GUIDs, geohashes, movie ISANs, blockchain transactions, and more).
---

# Adding Nostr Comments

The project has a commenting system built on two Nostr protocols:

- **NIP-10 replies** (kind 1 → kind 1): For replying to kind 1 text notes. Published as kind 1 events with `e`-tag markers (`root`/`reply`).
- **NIP-22 comments** (kind 1111): For commenting on everything else — non-kind-1 events, external URLs, NIP-73 identifiers, hashtags. Uses uppercase tags for root references and lowercase tags for the immediate parent.

Voice equivalents also exist: kind 1222 (NIP-10 voice replies) and kind 1244 (NIP-22 voice comments).

## Architecture

The commenting system is composed of page-level logic, shared hooks, and shared UI components. There is no single drop-in `<CommentsSection>` component. Instead, each page assembles commenting from these building blocks:

### Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useComments` | `src/hooks/useComments.ts` | Fetches NIP-22 comments (kind 1111 + 1244) for a root. Returns `topLevelComments`, `getDirectReplies(id)`, and `getDescendants(id)`. |
| `usePostComment` | `src/hooks/usePostComment.ts` | Publishes NIP-22 kind 1111 comments with correct uppercase/lowercase tag structure. |
| `useReplies` | `src/hooks/useReplies.ts` | Fetches NIP-10 replies (kind 1) to a given event ID. |
| `useWallComments` | `src/hooks/useWallComments.ts` | Fetches comments on a user's kind 0 profile event (wall comments). |

### UI Components

| Component | File | Purpose |
|-----------|------|---------|
| `ComposeBox` | `src/components/ComposeBox.tsx` | The universal compose input. Handles both NIP-10 and NIP-22 modes based on its `replyTo` prop. |
| `ReplyComposeModal` | `src/components/ReplyComposeModal.tsx` | Dialog wrapper around `ComposeBox` for modal reply/comment composition. |
| `ThreadedReplyList` | `src/components/ThreadedReplyList.tsx` | Renders a flat list of replies, each optionally paired with its first sub-reply for visual threading. |
| `NoteCard` | `src/components/NoteCard.tsx` | Renders individual events with `threaded`/`threadedLast` props for connector-line styling. |

## How `ComposeBox` Determines the Protocol

The `replyTo` prop controls which protocol is used:

```tsx
// Inside ComposeBox:
const isNip22Reply = replyTo && (replyTo instanceof URL || replyTo.kind !== 1);
```

| `replyTo` value | Protocol | Published kind |
|---|---|---|
| `undefined` | New post | kind 1 |
| Kind 1 `NostrEvent` | NIP-10 | kind 1 (with `e`-tag markers) |
| Non-kind-1 `NostrEvent` | NIP-22 | kind 1111 (via `usePostComment`) |
| Kind 1111 `NostrEvent` | NIP-22 | kind 1111 (reconstructs root from uppercase tags) |
| `URL` | NIP-22 | kind 1111 (via `usePostComment`) |

## Adding Comments to a Page

### For Nostr Events (non-kind-1)

Use `useComments` to fetch comments and `ComposeBox` or `ReplyComposeModal` with the event as `replyTo`:

```tsx
import { useMemo } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useComments } from '@/hooks/useComments';
import { ComposeBox } from '@/components/ComposeBox';
import { ThreadedReplyList, type ThreadedReply } from '@/components/ThreadedReplyList';

function ArticleComments({ article }: { article: NostrEvent }) {
  const { data: commentsData, isLoading } = useComments(article, 500);

  const orderedReplies: ThreadedReply[] = useMemo(() => {
    if (!commentsData) return [];
    return commentsData.topLevelComments
      .sort((a, b) => a.created_at - b.created_at)
      .map((reply) => ({
        reply,
        firstSubReply: commentsData.getDirectReplies(reply.id)[0],
      }));
  }, [commentsData]);

  return (
    <div>
      <ComposeBox compact replyTo={article} />
      <ThreadedReplyList replies={orderedReplies} />
    </div>
  );
}
```

### For External Content (URLs and NIP-73 Identifiers)

Pass a `URL` object as `replyTo` to `ComposeBox` and as `root` to `useComments`:

```tsx
import { useMemo } from 'react';
import { useComments } from '@/hooks/useComments';
import { ComposeBox } from '@/components/ComposeBox';
import { ThreadedReplyList, type ThreadedReply } from '@/components/ThreadedReplyList';

function ExternalComments({ identifier }: { identifier: string }) {
  const commentRoot = useMemo(() => new URL(identifier), [identifier]);
  const { data: commentsData } = useComments(commentRoot, 500);

  const orderedReplies: ThreadedReply[] = useMemo(() => {
    if (!commentsData) return [];
    return commentsData.topLevelComments
      .sort((a, b) => a.created_at - b.created_at)
      .map((reply) => ({
        reply,
        firstSubReply: commentsData.getDirectReplies(reply.id)[0],
      }));
  }, [commentsData]);

  return (
    <div>
      <ComposeBox compact replyTo={commentRoot} />
      <ThreadedReplyList replies={orderedReplies} />
    </div>
  );
}
```

### Using the Modal Composer

For a modal-based compose experience (e.g. triggered by a FAB or reply button):

```tsx
import { useState } from 'react';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { Button } from '@/components/ui/button';

function CommentButton({ target }: { target: NostrEvent | URL }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Comment</Button>
      <ReplyComposeModal event={target} open={open} onOpenChange={setOpen} />
    </>
  );
}
```

`ReplyComposeModal` accepts `event` as either a `NostrEvent` or `URL`, which it passes through to `ComposeBox` as `replyTo`.

## Supported Root Types for `useComments`

The `useComments` hook accepts three root types:

- **`NostrEvent`** — comments on any Nostr event (addressable, replaceable, or regular)
- **`URL`** — comments on external identifiers: web URLs (`new URL("https://...")`) or any NIP-73 identifier except hashtags (e.g. `new URL("isbn:9780765382030")`, `new URL("iso3166:US")`)
- **`` `#${string}` ``** — NIP-73 hashtag only (e.g. `"#bitcoin"`); this template string type is exclusively for hashtags

## NIP-73 External Content Identifiers

All NIP-73 identifiers (except hashtags) are passed as `URL` objects:

```tsx
// Web URL
const root = new URL("https://example.com/article");

// Book (ISBN, without hyphens)
const root = new URL("isbn:9780765382030");

// Podcast feed
const root = new URL("podcast:guid:c90e609a-df1e-596a-bd5e-57bcc8aad6cc");

// Podcast episode
const root = new URL("podcast:item:guid:d98d189b-dc7b-45b1-8720-d4b98690f31f");

// Movie (ISAN, without version part)
const root = new URL("isan:0000-0000-401A-0000-7");

// Geohash (lowercase)
const root = new URL("geo:ezs42e44yx96");

// Country (ISO 3166, uppercase)
const root = new URL("iso3166:US");

// Subdivision
const root = new URL("iso3166:US-CA");

// Academic paper (DOI, lowercase)
const root = new URL("doi:10.1000/xyz123");

// Bitcoin transaction
const root = new URL("bitcoin:tx:a1075db55d416d3ca199f55b6084e2115b9345e16c5cf302fc80e9d5fbf5d48d");

// Ethereum address
const root = new URL("ethereum:1:address:0xd8da6bf26964af9d7eed9e03e53415d37aa96045");
```

Hashtags use the string format directly:

```tsx
const root = "#bitcoin";
```

## How `useComments` Builds Filters

The hook constructs relay filters based on the root type:

| Root type | Filter |
|---|---|
| Hashtag string | `{ kinds: [1111, 1244], '#I': [root] }` |
| `URL` | `{ kinds: [1111, 1244], '#I': [root.toString()] }` |
| Addressable event | `{ kinds: [1111, 1244], '#A': ["kind:pubkey:d"] }` |
| Replaceable event | `{ kinds: [1111, 1244], '#A': ["kind:pubkey:"] }` |
| Regular event | `{ kinds: [1111, 1244], '#E': [root.id] }` |

## How `usePostComment` Builds Tags

The hook constructs NIP-22 tags with uppercase for the root scope and lowercase for the reply scope:

- `E`/`e` — Event ID reference
- `A`/`a` — Addressable event coordinate (`kind:pubkey:d-tag`)
- `I`/`i` — External identifier (URL, hashtag)
- `K`/`k` — Kind number, or `web` for HTTP(S), or `#` for hashtags
- `P`/`p` — Pubkey of the referenced event's author

For top-level comments, both the root and reply tags point to the same target. For nested replies, the root tags point to the original root and the reply tags point to the parent comment.

## Where Comments Are Used in the App

| Page | File | Commenting mode |
|------|------|-----------------|
| `PostDetailPage` (kind 1) | `src/pages/PostDetailPage.tsx` | NIP-10 via `useReplies` |
| `PostDetailPage` (non-kind-1) | `src/pages/PostDetailPage.tsx` | NIP-22 via `useComments` |
| `PostDetailPage` (kind 1111) | `src/pages/PostDetailPage.tsx` | NIP-22, reconstructs root from uppercase tags |
| `ExternalContentPage` | `src/pages/ExternalContentPage.tsx` | NIP-22 via `useComments` with `URL` root |
| `VinesFeedPage` | `src/pages/VinesFeedPage.tsx` | NIP-22 via `CommentsSheet` + `useEventComments` |
| `ProfilePage` (wall) | `src/pages/ProfilePage.tsx` | NIP-22 via `useWallComments` on kind 0 |
