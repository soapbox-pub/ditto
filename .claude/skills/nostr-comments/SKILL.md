---
name: nostr-comments
description: Implement Nostr comment systems, add discussion features to posts/articles, build community interaction features, or attach comments to any external content identifier including URLs, hashtags, and NIP-73 identifiers (ISBN, podcast GUIDs, geohashes, movie ISANs, blockchain transactions, and more).
---

# Adding Nostr Comments Sections

The project includes a complete commenting system using NIP-22 (kind 1111) comments that can be added to any Nostr event, URL, hashtag, or NIP-73 external content identifier. The `CommentsSection` component provides a full-featured commenting interface with threaded replies, user authentication, and real-time updates.

## Basic Usage

```tsx
import { CommentsSection } from "@/components/comments/CommentsSection";

function ArticlePage({ article }: { article: NostrEvent }) {
  return (
    <div className="space-y-6">
      {/* Your article content */}
      <div>{/* article content */}</div>

      {/* Comments section */}
      <CommentsSection root={article} />
    </div>
  );
}
```

## Props and Customization

The `CommentsSection` component accepts the following props:

- **`root`** (required): The root to comment on. Accepts three types:
  - `NostrEvent` — comment on a Nostr event (kind 1 note, long-form article, etc.)
  - `URL` — comment on an external identifier: web URLs (`new URL("https://...")`) or any NIP-73 identifier except hashtags (e.g. `new URL("isbn:9780765382030")`, `new URL("iso3166:US")`)
  - `#${string}` — NIP-73 hashtag only (e.g. `"#bitcoin"`); this template string type is exclusively for hashtags and must not be used for other NIP-73 identifiers
- **`title`**: Custom title for the comments section (default: "Comments")
- **`emptyStateMessage`**: Message shown when no comments exist (default: "No comments yet")
- **`emptyStateSubtitle`**: Subtitle for empty state (default: "Be the first to share your thoughts!")
- **`className`**: Additional CSS classes for styling
- **`limit`**: Maximum number of comments to load (default: 500)

```tsx
<CommentsSection
  root={event}
  title="Discussion"
  emptyStateMessage="Start the conversation"
  emptyStateSubtitle="Share your thoughts about this post"
  className="mt-8"
  limit={100}
/>
```

## Commenting on URLs

The comments system supports commenting on external URLs, making it useful for web pages, articles, or any online content:

```tsx
<CommentsSection
  root={new URL("https://example.com/article")}
  title="Comments on this article"
/>
```

## Commenting on Hashtags

Pass a hashtag string (`#${string}` format) to attach comments to a topic. The hashtag must be lowercase:

```tsx
// Comments for the #bitcoin hashtag
<CommentsSection
  root="#bitcoin"
  title="Bitcoin Discussion"
/>

// Comments for a community-specific tag
<CommentsSection
  root="#nostr"
  title="Nostr Community"
/>
```

## Commenting on NIP-73 External Content Identifiers

NIP-73 defines a standard set of external content IDs. All NIP-73 identifiers (except hashtags) are passed as `URL` objects — the identifier string is used directly as the URL:

### Books (ISBN)

```tsx
// ISBN must be without hyphens
<CommentsSection
  root={new URL("isbn:9780765382030")}
  title="Book Discussion"
/>
```

### Podcasts

```tsx
// Podcast feed
<CommentsSection
  root={new URL("podcast:guid:c90e609a-df1e-596a-bd5e-57bcc8aad6cc")}
  title="Podcast Discussion"
/>

// Podcast episode
<CommentsSection
  root={new URL("podcast:item:guid:d98d189b-dc7b-45b1-8720-d4b98690f31f")}
  title="Episode Discussion"
/>
```

### Movies (ISAN)

```tsx
// ISAN without version part
<CommentsSection
  root={new URL("isan:0000-0000-401A-0000-7")}
  title="Movie Discussion"
/>
```

### Geohashes

```tsx
// Geohash must be lowercase
<CommentsSection
  root={new URL("geo:ezs42e44yx96")}
  title="Location Discussion"
/>
```

### Countries (ISO 3166)

```tsx
// ISO 3166 codes must be uppercase
<CommentsSection
  root={new URL("iso3166:US")}
  title="USA Discussion"
/>

// Subdivision (state/province)
<CommentsSection
  root={new URL("iso3166:US-CA")}
  title="California Discussion"
/>
```

### Academic Papers (DOI)

```tsx
// DOI must be lowercase
<CommentsSection
  root={new URL("doi:10.1000/xyz123")}
  title="Paper Discussion"
/>
```

### Blockchain Transactions and Addresses

```tsx
// Bitcoin transaction
<CommentsSection
  root={new URL("bitcoin:tx:a1075db55d416d3ca199f55b6084e2115b9345e16c5cf302fc80e9d5fbf5d48d")}
  title="Transaction Discussion"
/>

// Ethereum address
<CommentsSection
  root={new URL("ethereum:1:address:0xd8da6bf26964af9d7eed9e03e53415d37aa96045")}
  title="Address Discussion"
/>
```
