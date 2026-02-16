---
name: nostr-comments
description: Implement Nostr comment systems, add discussion features to posts/articles, or build community interaction features.
---

# Adding Nostr Comments Sections

The project includes a complete commenting system using NIP-22 (kind 1111) comments that can be added to any Nostr event or URL. The `CommentsSection` component provides a full-featured commenting interface with threaded replies, user authentication, and real-time updates.

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

- **`root`** (required): The root event or URL to comment on. Can be a `NostrEvent` or `URL` object.
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

The comments system also supports commenting on external URLs, making it useful for web pages, articles, or any online content:

```tsx
<CommentsSection
  root={new URL("https://example.com/article")}
  title="Comments on this article"
/>
```
