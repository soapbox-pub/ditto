# Project Overview

This project is a Nostr client application built with React 18.x, TailwindCSS 3.x, Vite, shadcn/ui, and Nostrify.

## Technology Stack

- **React 18.x**: Stable version of React with hooks, concurrent rendering, and improved performance
- **TailwindCSS 3.x**: Utility-first CSS framework for styling
- **Vite**: Fast build tool and development server
- **shadcn/ui**: Unstyled, accessible UI components built with Radix UI and Tailwind
- **Nostrify**: Nostr protocol framework for Deno and web
- **React Router**: For client-side routing with BrowserRouter and ScrollToTop functionality
- **TanStack Query**: For data fetching, caching, and state management
- **TypeScript**: For type-safe JavaScript development

## Project Structure

- `/src/components/`: UI components including NostrProvider for Nostr integration
  - `/src/components/ui/`: shadcn/ui components (48+ components available)
  - `/src/components/auth/`: Authentication-related components (LoginArea, LoginDialog, etc.)
  - `/src/components/dm/`: Direct messaging UI components (DMMessagingInterface, DMConversationList, DMChatArea)
  - Zap components: `ZapButton`, `ZapDialog`, `WalletModal` for Lightning payments
- `/src/hooks/`: Custom hooks including:
  - `useNostr`: Core Nostr protocol integration
  - `useAuthor`: Fetch user profile data by pubkey
  - `useCurrentUser`: Get currently logged-in user
  - `useNostrPublish`: Publish events to Nostr
  - `useUploadFile`: Upload files via Blossom servers
  - `useAppContext`: Access global app configuration
  - `useTheme`: Theme management
  - `useToast`: Toast notifications
  - `useLocalStorage`: Persistent local storage
  - `useLoggedInAccounts`: Manage multiple accounts
  - `useLoginActions`: Authentication actions
  - `useIsMobile`: Responsive design helper
  - `useZaps`: Lightning zap functionality with payment processing
  - `useWallet`: Unified wallet detection (WebLN + NWC)
  - `useNWC`: Nostr Wallet Connect connection management
  - `useNWCContext`: Access NWC context provider
  - `useShakespeare`: AI chat completions with Shakespeare AI API
- `/src/pages/`: Page components used by React Router (Index, NotFound)
- `/src/lib/`: Utility functions and shared logic
- `/src/contexts/`: React context providers (AppContext, NWCContext, DMContext)
  - `useDMContext`: Hook exported from DMContext for direct messaging (NIP-04 & NIP-17)
  - `useConversationMessages`: Hook exported from DMContext for paginated messages
- `/src/test/`: Testing utilities including TestApp component
- `/public/`: Static assets
- `App.tsx`: Main app component with provider setup (**CRITICAL**: this file is **already configured** with `QueryClientProvider`, `NostrProvider`, `UnheadProvider` and other important providers - **read this file before making changes**. Changes are usually not necessary unless adding new providers. Changing this file may break the application)
- `AppRouter.tsx`: React Router configuration

**CRITICAL**: Always read the files mentioned above before making changes, as they contain important setup and configuration for the application. Never directly write to these files without first reading their contents.

## UI Components

The project uses shadcn/ui components located in `@/components/ui`. These are unstyled, accessible components built with Radix UI and styled with Tailwind CSS. Available components include:

- **Accordion**: Vertically collapsing content panels
- **Alert**: Displays important messages to users
- **AlertDialog**: Modal dialog for critical actions requiring confirmation
- **AspectRatio**: Maintains consistent width-to-height ratio
- **Avatar**: User profile pictures with fallback support
- **Badge**: Small status descriptors for UI elements
- **Breadcrumb**: Navigation aid showing current location in hierarchy
- **Button**: Customizable button with multiple variants and sizes
- **Calendar**: Date picker component
- **Card**: Container with header, content, and footer sections
- **Carousel**: Slideshow for cycling through elements
- **Chart**: Data visualization component
- **Checkbox**: Selectable input element
- **Collapsible**: Toggle for showing/hiding content
- **Command**: Command palette for keyboard-first interfaces
- **ContextMenu**: Right-click menu component
- **Dialog**: Modal window overlay
- **Drawer**: Side-sliding panel (using vaul)
- **DropdownMenu**: Menu that appears from a trigger element
- **Form**: Form validation and submission handling
- **HoverCard**: Card that appears when hovering over an element
- **InputOTP**: One-time password input field
- **Input**: Text input field
- **Label**: Accessible form labels
- **Menubar**: Horizontal menu with dropdowns
- **NavigationMenu**: Accessible navigation component
- **Pagination**: Controls for navigating between pages
- **Popover**: Floating content triggered by a button
- **Progress**: Progress indicator
- **RadioGroup**: Group of radio inputs
- **Resizable**: Resizable panels and interfaces
- **ScrollArea**: Scrollable container with custom scrollbars
- **Select**: Dropdown selection component
- **Separator**: Visual divider between content
- **Sheet**: Side-anchored dialog component
- **Sidebar**: Navigation sidebar component
- **Skeleton**: Loading placeholder
- **Slider**: Input for selecting a value from a range
- **Switch**: Toggle switch control
- **Table**: Data table with headers and rows
- **Tabs**: Tabbed interface component
- **Textarea**: Multi-line text input
- **Toast**: Toast notification component
- **ToggleGroup**: Group of toggle buttons
- **Toggle**: Two-state button
- **Tooltip**: Informational text that appears on hover

These components follow a consistent pattern using React's `forwardRef` and use the `cn()` utility for class name merging. Many are built on Radix UI primitives for accessibility and customized with Tailwind CSS.

## System Prompt Management

The AI assistant's behavior and knowledge is defined by the AGENTS.md file, which serves as the system prompt. To modify the assistant's instructions or add new project-specific guidelines:

1. Edit AGENTS.md directly
2. The changes take effect in the next session

## Nostr Protocol Integration

This project comes with custom hooks for querying and publishing events on the Nostr network.

### Nostr Implementation Guidelines

- Always check the full list of existing NIPs before implementing any Nostr features to see what kinds are currently in use across all NIPs.
- If any existing kind or NIP might offer the required functionality, read the relevant NIPs to investigate thoroughly. Several NIPs may need to be read before making a decision.
- Only generate new kind numbers if no existing suitable kinds are found after comprehensive research.

Knowing when to create a new kind versus reusing an existing kind requires careful judgement. Introducing new kinds means the project won't be interoperable with existing clients. But deviating too far from the schema of a particular kind can cause different interoperability issues.

#### Choosing Between Existing NIPs and Custom Kinds

When implementing features that could use existing NIPs, follow this decision framework:

1. **Thorough NIP Review**: Before considering a new kind, always perform a comprehensive review of existing NIPs and their associated kinds. Get an overview of all NIPs, and then read specific NIPs and kind documentation to investigate any potentially relevant NIPs or kinds in detail. The goal is to find the closest existing solution.

2. **Prioritize Existing NIPs**: Always prefer extending or using existing NIPs over creating custom kinds, even if they require minor compromises in functionality.

3. **Interoperability vs. Perfect Fit**: Consider the trade-off between:
   - **Interoperability**: Using existing kinds means compatibility with other Nostr clients
   - **Perfect Schema**: Custom kinds allow perfect data modeling but create ecosystem fragmentation

4. **Extension Strategy**: When existing NIPs are close but not perfect:
   - Use the existing kind as the base
   - Add domain-specific tags for additional metadata
   - Document the extensions in `NIP.md`

5. **When to Generate Custom Kinds**:
   - No existing NIP covers the core functionality
   - The data structure is fundamentally different from existing patterns
   - The use case requires different storage characteristics (regular vs replaceable vs addressable)
   - If you have a tool available to generate a kind, you **MUST** call the tool to generate a new kind rather than picking an arbitrary number

6. **Custom Kind Publishing**: When publishing events with custom generated kinds, always include a NIP-31 "alt" tag with a human-readable description of the event's purpose.

**Example Decision Process**:
```
Need: Equipment marketplace for farmers
Options:
1. NIP-15 (Marketplace) - Too structured for peer-to-peer sales
2. NIP-99 (Classified Listings) - Good fit, can extend with farming tags
3. Custom kind - Perfect fit but no interoperability

Decision: Use NIP-99 + farming-specific tags for best balance
```

#### Tag Design Principles

When designing tags for Nostr events, follow these principles:

1. **Kind vs Tags Separation**:
   - **Kind** = Schema/structure (how the data is organized)
   - **Tags** = Semantics/categories (what the data represents)
   - Don't create different kinds for the same data structure

2. **Use Single-Letter Tags for Categories**:
   - **Relays only index single-letter tags** for efficient querying
   - Use `t` tags for categorization, not custom multi-letter tags
   - Multiple `t` tags allow items to belong to multiple categories

3. **Relay-Level Filtering**:
   - Design tags to enable efficient relay-level filtering with `#t: ["category"]`
   - Avoid client-side filtering when relay-level filtering is possible
   - Consider query patterns when designing tag structure

4. **Tag Examples**:
   ```json
   // ❌ Wrong: Multi-letter tag, not queryable at relay level
   ["product_type", "electronics"]

   // ✅ Correct: Single-letter tag, relay-indexed and queryable
   ["t", "electronics"]
   ["t", "smartphone"]
   ["t", "android"]
   ```

5. **Querying Best Practices**:
   ```typescript
   // ❌ Inefficient: Get all events, filter in JavaScript
   const events = await nostr.query([{ kinds: [30402] }]);
   const filtered = events.filter(e => hasTag(e, 'product_type', 'electronics'));

   // ✅ Efficient: Filter at relay level
   const events = await nostr.query([{ kinds: [30402], '#t': ['electronics'] }]);
   ```

#### `t` Tag Filtering for Community-Specific Content

For applications focused on a specific community or niche, you can use `t` tags to filter events for the target audience.

**When to Use:**
- ✅ Community apps: "farmers" → `t: "farming"`, "Poland" → `t: "poland"`
- ❌ Generic platforms: Twitter clones, general Nostr clients

**Implementation:**
```typescript
// Publishing with community tag
createEvent({
  kind: 1,
  content: data.content,
  tags: [['t', 'farming']]
});

// Querying community content
const events = await nostr.query([{
  kinds: [1],
  '#t': ['farming'],
  limit: 20
}]);
```

### Kind Ranges

An event's kind number determines the event's behavior and storage characteristics:

- **Regular Events** (1000 ≤ kind < 10000): Expected to be stored by relays permanently. Used for persistent content like notes, articles, etc.
- **Replaceable Events** (10000 ≤ kind < 20000): Only the latest event per pubkey+kind combination is stored. Used for profile metadata, contact lists, etc.
- **Addressable Events** (30000 ≤ kind < 40000): Identified by pubkey+kind+d-tag combination, only latest per combination is stored. Used for articles, long-form content, etc.

Kinds below 1000 are considered "legacy" kinds, and may have different storage characteristics based on their kind definition. For example, kind 1 is regular, while kind 3 is replaceable.

### Content Field Design Principles

When designing new event kinds, the `content` field should be used for semantically important data that doesn't need to be queried by relays. **Structured JSON data generally shouldn't go in the content field** (kind 0 being an early exception).

#### Guidelines

- **Use content for**: Large text, freeform human-readable content, or existing industry-standard JSON formats (Tiled maps, FHIR, GeoJSON)
- **Use tags for**: Queryable metadata, structured data, anything that needs relay-level filtering
- **Empty content is valid**: Many events need only tags with `content: ""`
- **Relays only index tags**: If you need to filter by a field, it must be a tag

#### Example

**✅ Good - queryable data in tags:**
```json
{
  "kind": 30402,
  "content": "",
  "tags": [["d", "product-123"], ["title", "Camera"], ["price", "250"], ["t", "photography"]]
}
```

**❌ Bad - structured data in content:**
```json
{
  "kind": 30402,
  "content": "{\"title\":\"Camera\",\"price\":250,\"category\":\"photo\"}",
  "tags": [["d", "product-123"]]
}
```

### NIP.md

The file `NIP.md` is used by this project to define a custom Nostr protocol document. If the file doesn't exist, it means this project doesn't have any custom kinds associated with it.

Whenever new kinds are generated, the `NIP.md` file in the project must be created or updated to document the custom event schema. Whenever the schema of one of these custom events changes, `NIP.md` must also be updated accordingly.

### Nostr Security Model

**CRITICAL**: Nostr is permissionless - **anyone can publish any event**. When implementing admin/moderation systems or any feature that should only trust specific users, you MUST filter queries by the `authors` field. Without author filtering, anyone can publish events claiming to be admin actions, moderator decisions, or trusted content.

#### Using the `authors` Filter

**Always filter by authors when querying:**
- **Admin/moderator actions** - MUST filter by trusted admin pubkeys
- **Addressable events (kinds 30000-39999)** - MUST include author to prevent anyone from publishing events with the same d-tag
- **Any privileged operations** - Filter by trusted pubkeys only

**✅ Secure - Filtering by trusted authors:**
```typescript
import { ADMIN_PUBKEYS } from '@/lib/admins';

// Query organizer appointments - ONLY accept events from admins
const events = await nostr.query([{
  kinds: [30078],
  authors: ADMIN_PUBKEYS, // CRITICAL: Only trust admin authors
  '#d': ['pathos-organizers'],
  limit: 1
}]);
```

**❌ INSECURE - No author filtering:**
```typescript
// DANGER: This accepts events from ANYONE who publishes kind 30078
// An attacker could appoint themselves as an organizer
const events = await nostr.query([{
  kinds: [30078],
  '#d': ['pathos-organizers'],
  limit: 1
}]);
```

**Addressable Events Example:**
```typescript
// For addressable events, ALWAYS include the author in your filter
// This prevents attackers from publishing events with the same d-tag
const article = await nostr.query([{
  kinds: [30023], // Long-form article
  authors: [authorPubkey], // CRITICAL: Verify the author
  '#d': ['my-article-slug'],
  limit: 1
}]);
```

**URL Routing for Addressable/Replaceable Events:**

When creating URL paths for addressable or replaceable events, always include the author in the URL structure:

```typescript
// ❌ INSECURE: Missing author - anyone could publish an event with this d-tag
<Route path="/article/:slug" element={<Article />} />
// URL: /article/hello-world

// ✅ SECURE: Includes author - can safely filter by both author and d-tag
<Route path="/article/:npub/:slug" element={<Article />} />
// URL: /article/npub1abc.../hello-world
```

This ensures your route parameters provide both the author pubkey and the d-tag identifier needed to create a secure query filter.

**NIP-72 Community Moderation Example:**

When implementing moderated communities (NIP-72), you must query the community definition to get the moderator list, then filter approval events by those moderators:

```typescript
// Step 1: Query the community definition to get moderators
const communityEvents = await nostr.query([{
  kinds: [34550],
  authors: [communityOwnerPubkey], // CRITICAL: Only trust the community owner
  '#d': [communityId],
  limit: 1,
}]);

if (communityEvents.length === 0) return [];

// Step 2: Extract moderator pubkeys from p tags
const moderatorPubkeys = communityEvents[0].tags
  .filter(([name, _, __, role]) => name === 'p' && role === 'moderator')
  .map(([_, pubkey]) => pubkey);

// Step 3: Query approval events - ONLY from trusted moderators
const approvals = await nostr.query([{
  kinds: [4550],
  authors: moderatorPubkeys, // CRITICAL: Only accept approvals from moderators
  '#a': [`34550:${communityOwnerPubkey}:${communityId}`],
  limit: 100,
}]);
```

Without filtering approvals by the moderator list, anyone could publish kind 4550 events claiming to approve posts for the community.

#### When Author Filtering Is NOT Required

Author filtering is not needed for public user-generated content where anyone should be able to post (kind 1 notes, reactions, discovery queries, public feeds, etc.).

### The `useNostr` Hook

The `useNostr` hook returns an object containing a `nostr` property, with `.query()` and `.event()` methods for querying and publishing Nostr events respectively.

```typescript
import { useNostr } from '@nostrify/react';

function useCustomHook() {
  const { nostr } = useNostr();

  // ...
}
```

### Connecting to Multiple Nostr Relays

By default, the `nostr` object from `useNostr` uses a pool configuration that reads data from 1 relay and publishes to all configured relays. However, you can connect to specific relays or groups of relays for more granular control:

#### Single Relay Connection

To read and publish from one specific relay, use `nostr.relay()` with a WebSocket URL:

```typescript
import { useNostr } from '@nostrify/react';

function useSpecificRelay() {
  const { nostr } = useNostr();

  // Connect to a specific relay
  const relay = nostr.relay('wss://relay.damus.io');

  // Query from this specific relay only
  const events = await relay.query([{ kinds: [1], limit: 20 }]);

  // Publish to this specific relay only
  await relay.event({ kind: 1, content: 'Hello from specific relay!' });
}
```

#### Multiple Relay Group

To read and publish from a specific set of relays, use `nostr.group()` with an array of relay URLs:

```typescript
import { useNostr } from '@nostrify/react';

function useRelayGroup() {
  const { nostr } = useNostr();

  // Create a group of specific relays
  const relayGroup = nostr.group([
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://nos.lol'
  ]);

  // Query from all relays in the group
  const events = await relayGroup.query([{ kinds: [1], limit: 20 }]);

  // Publish to all relays in the group
  await relayGroup.event({ kind: 1, content: 'Hello from relay group!' });
}
```

#### API Consistency

Both `relay` and `group` objects have the same API as the main `nostr` object, including:

- `.query()` - Query events with filters
- `.req()` - Create subscriptions
- `.event()` - Publish events
- All other Nostr protocol methods

#### Use Cases

**Single Relay (`nostr.relay()`):**
- Testing specific relay behavior
- Querying relay-specific content
- Debugging connectivity issues
- Working with specialized relays

**Relay Group (`nostr.group()`):**
- Querying from trusted relay sets
- Publishing to specific communities
- Load balancing across relay subsets
- Geographic relay optimization

**Default Pool (`nostr`):**
- General application queries
- Maximum reach for publishing
- Default user experience
- Simplified relay management

### Query Nostr Data with `useNostr` and Tanstack Query

When querying Nostr, the best practice is to create custom hooks that combine `useNostr` and `useQuery` to get the required data.

```typescript
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/query';

function usePosts() {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['posts'],
    queryFn: async (c) => {
      const events = await nostr.query([{ kinds: [1], limit: 20 }]);
      return events; // these events could be transformed into another format
    },
  });
}
```

### Efficient Query Design

**Critical**: Always minimize the number of separate queries to avoid rate limiting and improve performance. Combine related queries whenever possible.

**✅ Efficient - Single query with multiple kinds:**
```typescript
// Query multiple event types in one request
const events = await nostr.query([
  {
    kinds: [1, 6, 16], // All repost kinds in one query
    '#e': [eventId],
    limit: 150,
  }
]);

// Separate by type in JavaScript
const notes = events.filter((e) => e.kind === 1);
const reposts = events.filter((e) => e.kind === 6);
const genericReposts = events.filter((e) => e.kind === 16);
```

**❌ Inefficient - Multiple separate queries:**
```typescript
// This creates unnecessary load and can trigger rate limiting
const [notes, reposts, genericReposts] = await Promise.all([
  nostr.query([{ kinds: [1], '#e': [eventId] }]),
  nostr.query([{ kinds: [6], '#e': [eventId] }]),
  nostr.query([{ kinds: [16], '#e': [eventId] }]),
]);
```

**Query Optimization Guidelines:**
1. **Combine kinds**: Use `kinds: [1, 6, 16]` instead of separate queries
2. **Use multiple filters**: When you need different tag filters, use multiple filter objects in a single query
3. **Adjust limits**: When combining queries, increase the limit appropriately
4. **Filter in JavaScript**: Separate event types after receiving results rather than making multiple requests
5. **Consider relay capacity**: Each query consumes relay resources and may count against rate limits

The data may be transformed into a more appropriate format if needed, and multiple calls to `nostr.query()` may be made in a single queryFn.

### Event Validation

When querying events, if the event kind being returned has required tags or required JSON fields in the content, the events should be filtered through a validator function. This is not generally needed for kinds such as 1, where all tags are optional and the content is freeform text, but is especially useful for custom kinds as well as kinds with strict requirements.

```typescript
// Example validator function for NIP-52 calendar events
function validateCalendarEvent(event: NostrEvent): boolean {
  // Check if it's a calendar event kind
  if (![31922, 31923].includes(event.kind)) return false;

  // Check for required tags according to NIP-52
  const d = event.tags.find(([name]) => name === 'd')?.[1];
  const title = event.tags.find(([name]) => name === 'title')?.[1];
  const start = event.tags.find(([name]) => name === 'start')?.[1];

  // All calendar events require 'd', 'title', and 'start' tags
  if (!d || !title || !start) return false;

  // Additional validation for date-based events (kind 31922)
  if (event.kind === 31922) {
    // start tag should be in YYYY-MM-DD format for date-based events
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(start)) return false;
  }

  // Additional validation for time-based events (kind 31923)
  if (event.kind === 31923) {
    // start tag should be a unix timestamp for time-based events
    const timestamp = parseInt(start);
    if (isNaN(timestamp) || timestamp <= 0) return false;
  }

  return true;
}

function useCalendarEvents() {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['calendar-events'],
    queryFn: async (c) => {
      const events = await nostr.query([{ kinds: [31922, 31923], limit: 20 }]);

      // Filter events through validator to ensure they meet NIP-52 requirements
      return events.filter(validateCalendarEvent);
    },
  });
}
```

### The `useAuthor` Hook

To display profile data for a user by their Nostr pubkey (such as an event author), use the `useAuthor` hook.

```tsx
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';

function Post({ event }: { event: NostrEvent }) {
  const author = useAuthor(event.pubkey);
  const metadata: NostrMetadata | undefined = author.data?.metadata;

  const displayName = metadata?.name ?? genUserName(event.pubkey);
  const profileImage = metadata?.picture;

  // ...render elements with this data
}
```

### `NostrMetadata` type

```ts
/** Kind 0 metadata. */
interface NostrMetadata {
  /** A short description of the user. */
  about?: string;
  /** A URL to a wide (~1024x768) picture to be optionally displayed in the background of a profile screen. */
  banner?: string;
  /** A boolean to clarify that the content is entirely or partially the result of automation, such as with chatbots or newsfeeds. */
  bot?: boolean;
  /** An alternative, bigger name with richer characters than `name`. `name` should always be set regardless of the presence of `display_name` in the metadata. */
  display_name?: string;
  /** A bech32 lightning address according to NIP-57 and LNURL specifications. */
  lud06?: string;
  /** An email-like lightning address according to NIP-57 and LNURL specifications. */
  lud16?: string;
  /** A short name to be displayed for the user. */
  name?: string;
  /** An email-like Nostr address according to NIP-05. */
  nip05?: string;
  /** A URL to the user's avatar. */
  picture?: string;
  /** A web URL related in any way to the event author. */
  website?: string;
}
```

### The `useNostrPublish` Hook

To publish events, use the `useNostrPublish` hook in this project. This hook automatically adds a "client" tag to published events.

```tsx
import { useState } from 'react';

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostrPublish } from '@/hooks/useNostrPublish';

export function MyComponent() {
  const [ data, setData] = useState<Record<string, string>>({});

  const { user } = useCurrentUser();
  const { mutate: createEvent } = useNostrPublish();

  const handleSubmit = () => {
    createEvent({ kind: 1, content: data.content });
  };

  if (!user) {
    return <span>You must be logged in to use this form.</span>;
  }

  return (
    <form onSubmit={handleSubmit} disabled={!user}>
      {/* ...some input fields */}
    </form>
  );
}
```

The `useCurrentUser` hook should be used to ensure that the user is logged in before they are able to publish Nostr events.

### Nostr Login

To enable login with Nostr, simply use the `LoginArea` component already included in this project.

```tsx
import { LoginArea } from "@/components/auth/LoginArea";

function MyComponent() {
  return (
    <div>
      {/* other components ... */}

      <LoginArea className="max-w-60" />
    </div>
  );
}
```

The `LoginArea` component handles all the login-related UI and interactions, including displaying login dialogs, sign up functionality, and switching between accounts. It should not be wrapped in any conditional logic.

`LoginArea` displays both "Log in" and "Sign Up" buttons when the user is logged out, and changes to an account switcher once the user is logged in. It is an inline-flex element by default. To make it expand to the width of its container, you can pass a className like `flex` (to make it a block element) or `w-full`. If it is left as inline-flex, it's recommended to set a max width.

**Important**: Social applications should include a profile menu button in the main interface (typically in headers/navigation) to provide access to account settings, profile editing, and logout functionality. Don't only show `LoginArea` in logged-out states.

### `npub`, `naddr`, and other Nostr addresses

Nostr defines a set of bech32-encoded identifiers in NIP-19. Their prefixes and purposes:

- `npub1`: **public keys** - Just the 32-byte public key, no additional metadata
- `nsec1`: **private keys** - Secret keys (should never be displayed publicly)
- `note1`: **event IDs** - Just the 32-byte event ID (hex), no additional metadata
- `nevent1`: **event pointers** - Event ID plus optional relay hints and author pubkey
- `nprofile1`: **profile pointers** - Public key plus optional relay hints and petname
- `naddr1`: **addressable event coordinates** - For parameterized replaceable events (kind 30000-39999)
- `nrelay1`: **relay references** - Relay URLs (deprecated)

#### Key Differences Between Similar Identifiers

**`note1` vs `nevent1`:**
- `note1`: Contains only the event ID (32 bytes) - specifically for kind:1 events (Short Text Notes) as defined in NIP-10
- `nevent1`: Contains event ID plus optional relay hints and author pubkey - for any event kind
- Use `note1` for simple references to text notes and threads
- Use `nevent1` when you need to include relay hints or author context for any event type

**`npub1` vs `nprofile1`:**
- `npub1`: Contains only the public key (32 bytes)
- `nprofile1`: Contains public key plus optional relay hints and petname
- Use `npub1` for simple user references
- Use `nprofile1` when you need to include relay hints or display name context

#### NIP-19 Routing Implementation

**Critical**: NIP-19 identifiers should be handled at the **root level** of URLs (e.g., `/note1...`, `/npub1...`, `/naddr1...`), NOT nested under paths like `/note/note1...` or `/profile/npub1...`.

This project includes a boilerplate `NIP19Page` component that provides the foundation for handling all NIP-19 identifier types at the root level. The component is configured in the routing system and ready for AI agents to populate with specific functionality.

**How it works:**

1. **Root-Level Route**: The route `/:nip19` in `AppRouter.tsx` catches all NIP-19 identifiers
2. **Automatic Decoding**: The `NIP19Page` component automatically decodes the identifier using `nip19.decode()`
3. **Type-Specific Sections**: Different sections are rendered based on the identifier type:
   - `npub1`/`nprofile1`: Profile section with placeholder for profile view
   - `note1`: Note section with placeholder for kind:1 text note view
   - `nevent1`: Event section with placeholder for any event type view
   - `naddr1`: Addressable event section with placeholder for articles, marketplace items, etc.
4. **Error Handling**: Invalid, vacant, or unsupported identifiers show 404 NotFound page
5. **Ready for Population**: Each section includes comments indicating where AI agents should implement specific functionality

**Example URLs that work automatically:**
- `/npub1abc123...` - User profile (needs implementation)
- `/note1def456...` - Kind:1 text note (needs implementation)
- `/nevent1ghi789...` - Any event with relay hints (needs implementation)
- `/naddr1jkl012...` - Addressable event (needs implementation)

**Features included:**
- Basic NIP-19 identifier decoding and routing
- Type-specific sections for different identifier types
- Error handling for invalid identifiers
- Responsive container structure
- Comments indicating where to implement specific views

**Error handling:**
- Invalid NIP-19 format → 404 NotFound
- Unsupported identifier types (like `nsec1`) → 404 NotFound
- Empty or missing identifiers → 404 NotFound

To implement NIP-19 routing in your Nostr application:

1. **The NIP19Page boilerplate is already created** - populate sections with specific functionality
2. **The route is already configured** in `AppRouter.tsx`
3. **Error handling is built-in** - all edge cases show appropriate 404 responses
4. **Add specific components** for profile views, event displays, etc. as needed

#### Event Type Distinctions

**`note1` identifiers** are specifically for **kind:1 events** (Short Text Notes) as defined in NIP-10: "Text Notes and Threads". These are the basic social media posts in Nostr.

**`nevent1` identifiers** can reference any event kind and include additional metadata like relay hints and author pubkey. Use `nevent1` when:
- The event is not a kind:1 text note
- You need to include relay hints for better discoverability
- You want to include author context

#### Use in Filters

The base Nostr protocol uses hex string identifiers when filtering by event IDs and pubkeys. Nostr filters only accept hex strings.

```ts
// ❌ Wrong: naddr is not decoded
const events = await nostr.query(
  [{ ids: [naddr] }],
);
```

Corrected example:

```ts
// Import nip19 from nostr-tools
import { nip19 } from 'nostr-tools';

// Decode a NIP-19 identifier
const decoded = nip19.decode(value);

// Optional: guard certain types (depending on the use-case)
if (decoded.type !== 'naddr') {
  throw new Error('Unsupported Nostr identifier');
}

// Get the addr object
const naddr = decoded.data;

// ✅ Correct: naddr is expanded into the correct filter
const events = await nostr.query(
  [{
    kinds: [naddr.kind],
    authors: [naddr.pubkey],
    '#d': [naddr.identifier],
  }],
);
```

#### Implementation Guidelines

1. **Always decode NIP-19 identifiers** before using them in queries
2. **Use the appropriate identifier type** based on your needs:
   - Use `note1` for kind:1 text notes specifically
   - Use `nevent1` when including relay hints or for non-kind:1 events
   - Use `naddr1` for addressable events (always includes author pubkey for security)
3. **Handle different identifier types** appropriately:
   - `npub1`/`nprofile1`: Display user profiles
   - `note1`: Display kind:1 text notes specifically
   - `nevent1`: Display any event with optional relay context
   - `naddr1`: Display addressable events (articles, marketplace items, etc.)
4. **Security considerations**: Always use `naddr1` for addressable events instead of just the `d` tag value, as `naddr1` contains the author pubkey needed to create secure filters
5. **Error handling**: Gracefully handle invalid or unsupported NIP-19 identifiers with 404 responses

### Nostr Edit Profile

To include an Edit Profile form, place the `EditProfileForm` component in the project:

```tsx
import { EditProfileForm } from "@/components/EditProfileForm";

function EditProfilePage() {
  return (
    <div>
      {/* you may want to wrap this in a layout or include other components depending on the project ... */}

      <EditProfileForm />
    </div>
  );
}
```

The `EditProfileForm` component displays just the form. It requires no props, and will "just work" automatically.

### Uploading Files on Nostr

Use the `useUploadFile` hook to upload files. This hook uses Blossom servers for file storage and returns NIP-94 compatible tags.

```tsx
import { useUploadFile } from "@/hooks/useUploadFile";

function MyComponent() {
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();

  const handleUpload = async (file: File) => {
    try {
      // Provides an array of NIP-94 compatible tags
      // The first tag in the array contains the URL
      const [[_, url]] = await uploadFile(file);
      // ...use the url
    } catch (error) {
      // ...handle errors
    }
  };

  // ...rest of component
}
```

To attach files to kind 1 events, each file's URL should be appended to the event's `content`, and an `imeta` tag should be added for each file. For kind 0 events, the URL by itself can be used in relevant fields of the JSON content.

### Nostr Encryption and Decryption

The logged-in user has a `signer` object (matching the NIP-07 signer interface) that can be used for encryption and decryption. The signer's nip44 methods handle all cryptographic operations internally, including key derivation and conversation key management, so you never need direct access to private keys. Always use the signer interface for encryption rather than requesting private keys from users, as this maintains security and follows best practices.

```ts
// Get the current user
const { user } = useCurrentUser();

// Optional guard to check that nip44 is available
if (!user.signer.nip44) {
  throw new Error("Please upgrade your signer extension to a version that supports NIP-44 encryption");
}

// Encrypt message to self
const encrypted = await user.signer.nip44.encrypt(user.pubkey, "hello world");
// Decrypt message to self
const decrypted = await user.signer.nip44.decrypt(user.pubkey, encrypted) // "hello world"
```

### Rendering Rich Text Content

Nostr text notes (kind 1, 11, and 1111) have a plaintext `content` field that may contain URLs, hashtags, and Nostr URIs. These events should render their content using the `NoteContent` component:

```tsx
import { NoteContent } from "@/components/NoteContent";

export function Post(/* ...props */) {
  // ...

  return (
    <CardContent className="pb-2">
      <div className="whitespace-pre-wrap break-words">
        <NoteContent event={post} className="text-sm" />
      </div>
    </CardContent>
  );
}
```

## App Configuration

The project includes an `AppProvider` that manages global application state including theme and NIP-65 relay configuration. The default configuration includes:

```typescript
const defaultConfig: AppConfig = {
  theme: "light",
  relayMetadata: {
    relays: [
      { url: 'wss://relay.ditto.pub', read: true, write: true },
      { url: 'wss://relay.primal.net', read: true, write: true },
      { url: 'wss://relay.damus.io', read: true, write: true },
    ],
    updatedAt: 0,
  },
};
```

The app uses NIP-65 compatible relay management with automatic sync when users log in. Local storage persists user preferences and relay configurations.

### Relay Management

The project includes a complete NIP-65 relay management system:

- **RelayListManager**: Component for managing multiple relays with read/write permissions
- **NostrSync**: Automatically syncs user's NIP-65 relay list when they log in
- **Automatic Publishing**: Changes to relay configuration are automatically published as NIP-65 events when the user is logged in

Use the `RelayListManager` component to provide relay management interfaces:

```tsx
import { RelayListManager } from '@/components/RelayListManager';

function SettingsPage() {
  return (
    <div>
      <h2>Relay Settings</h2>
      <RelayListManager />
    </div>
  );
}
```

## Routing

The project uses React Router with a centralized routing configuration in `AppRouter.tsx`. To add new routes:

1. Create your page component in `/src/pages/`
2. Import it in `AppRouter.tsx`
3. Add the route above the catch-all `*` route:

```tsx
<Route path="/your-path" element={<YourComponent />} />
```

The router includes automatic scroll-to-top functionality and a 404 NotFound page for unmatched routes.

## Development Practices

- Uses React Query for data fetching and caching
- Follows shadcn/ui component patterns
- Implements Path Aliases with `@/` prefix for cleaner imports
- Uses Vite for fast development and production builds
- Component-based architecture with React hooks
- Default connection to one Nostr relay for best performance
- Comprehensive provider setup with NostrLoginProvider, QueryClientProvider, and custom AppProvider
- **Never use the `any` type**: Always use proper TypeScript types for type safety

## Loading States

**Use skeleton loading** for structured content (feeds, profiles, forms). **Use spinners** only for buttons or short operations.

```tsx
// Skeleton example matching component structure
<Card>
  <CardHeader>
    <div className="flex items-center space-x-3">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="space-y-1">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  </CardHeader>
  <CardContent>
    <div className="space-y-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  </CardContent>
</Card>
```

### Empty States and No Content Found

When no content is found (empty search results, no data available, etc.), display a minimalist empty state with helpful messaging. The application uses NIP-65 relay management, so users can manage their relays through the settings or relay management interface.

```tsx
import { Card, CardContent } from '@/components/ui/card';

// Empty state example
<div className="col-span-full">
  <Card className="border-dashed">
    <CardContent className="py-12 px-8 text-center">
      <div className="max-w-sm mx-auto space-y-6">
        <p className="text-muted-foreground">
          No results found. Try checking your relay connections or wait a moment for content to load.
        </p>
      </div>
    </CardContent>
  </Card>
</div>
```

## CRITICAL Design Standards

- Create breathtaking, immersive designs that feel like bespoke masterpieces, rivaling the polish of Apple, Stripe, or luxury brands
- Designs must be production-ready, fully featured, with no placeholders unless explicitly requested, ensuring every element serves a functional and aesthetic purpose
- Avoid generic or templated aesthetics at all costs; every design must have a unique, brand-specific visual signature that feels custom-crafted
- Headers must be dynamic, immersive, and storytelling-driven, using layered visuals, motion, and symbolic elements to reflect the brand’s identity—never use simple “icon and text” combos
- Incorporate purposeful, lightweight animations for scroll reveals, micro-interactions (e.g., hover, click, transitions), and section transitions to create a sense of delight and fluidity

### Design Principles

- Achieve Apple-level refinement with meticulous attention to detail, ensuring designs evoke strong emotions (e.g., wonder, inspiration, energy) through color, motion, and composition
- Deliver fully functional interactive components with intuitive feedback states, ensuring every element has a clear purpose and enhances user engagement
- **Generate custom images liberally** when image generation tools are available - this is ALWAYS preferred over stock photography for creating unique, brand-specific visuals that perfectly match the design intent
- Ensure designs feel alive and modern with dynamic elements like gradients, glows, or parallax effects, avoiding static or flat aesthetics
- Before finalizing, ask: "Would this design make Apple or Stripe designers pause and take notice?" If not, iterate until it does

### Avoid Generic Design

- No basic layouts (e.g., text-on-left, image-on-right) without significant custom polish, such as dynamic backgrounds, layered visuals, or interactive elements
- No simplistic headers; they must be immersive, animated, and reflective of the brand’s core identity and mission
- No designs that could be mistaken for free templates or overused patterns; every element must feel intentional and tailored

### Interaction Patterns

- Use progressive disclosure for complex forms or content to guide users intuitively and reduce cognitive load
- Incorporate contextual menus, smart tooltips, and visual cues to enhance navigation and usability
- Implement drag-and-drop, hover effects, and transitions with clear, dynamic visual feedback to elevate the user experience
- Support power users with keyboard shortcuts, ARIA labels, and focus states for accessibility and efficiency
- Add subtle parallax effects or scroll-triggered animations to create depth and engagement without overwhelming the user

### Technical Requirements

- Curated color FRpalette (3-5 evocative colors + neutrals) that aligns with the brand’s emotional tone and creates a memorable impact
- Ensure a minimum 4.5:1 contrast ratio for all text and interactive elements to meet accessibility standards
- Use expressive, readable fonts (18px+ for body text, 40px+ for headlines) with a clear hierarchy; pair a modern sans-serif (e.g., Inter) with an elegant serif (e.g., Playfair Display) for personality
- Design for full responsiveness, ensuring flawless performance and aesthetics across all screen sizes (mobile, tablet, desktop)
- Adhere to WCAG 2.1 AA guidelines, including keyboard navigation, screen reader support, and reduced motion options
- Follow an 8px grid system for consistent spacing, padding, and alignment to ensure visual harmony
- Add depth with subtle shadows, gradients, glows, and rounded corners (e.g., 16px radius) to create a polished, modern aesthetic
- Optimize animations and interactions to be lightweight and performant, ensuring smooth experiences across devices

### Components

- Design reusable, modular components with consistent styling, behavior, and feedback states (e.g., hover, active, focus, error)
- Include purposeful animations (e.g., scale-up on hover, fade-in on scroll) to guide attention and enhance interactivity without distraction
- Ensure full accessibility support with keyboard navigation, ARIA labels, and visible focus states (e.g., a glowing outline in an accent color)
- Use custom icons or illustrations for components to reinforce the brand’s visual identity

### Adding Fonts

To add custom fonts, follow these steps:

1. **Install a font package** using npm:

   **Any Google Font can be installed** using the @fontsource packages. Examples:
   - For Inter Variable: `@fontsource-variable/inter`
   - For Roboto: `@fontsource/roboto`
   - For Outfit Variable: `@fontsource-variable/outfit`
   - For Poppins: `@fontsource/poppins`
   - For Open Sans: `@fontsource/open-sans`

   **Format**: `@fontsource/[font-name]` or `@fontsource-variable/[font-name]` (for variable fonts)

2. **Import the font** in `src/main.tsx`:
   ```typescript
   import '@fontsource-variable/<font-name>';
   ```

3. **Update Tailwind configuration** in `tailwind.config.ts`:
   ```typescript
   export default {
     theme: {
       extend: {
         fontFamily: {
           sans: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
         },
       },
     },
   }
   ```

### Recommended Font Choices by Use Case

- **Modern/Clean**: Inter Variable, Outfit Variable, or Manrope
- **Professional/Corporate**: Roboto, Open Sans, or Source Sans Pro
- **Creative/Artistic**: Poppins, Nunito, or Comfortaa
- **Technical/Code**: JetBrains Mono, Fira Code, or Source Code Pro (for monospace)

### Theme System

The project includes a complete light/dark theme system using CSS custom properties. The theme can be controlled via:

- `useTheme` hook for programmatic theme switching
- CSS custom properties defined in `src/index.css`
- Automatic dark mode support with `.dark` class

### Color Scheme Implementation

When users specify color schemes:
- Update CSS custom properties in `src/index.css` (both `:root` and `.dark` selectors)
- Use Tailwind's color palette or define custom colors
- Ensure proper contrast ratios for accessibility
- Apply colors consistently across components (buttons, links, accents)
- Test both light and dark mode variants

### Component Styling Patterns

- Use `cn()` utility for conditional class merging
- Follow shadcn/ui patterns for component variants
- Implement responsive design with Tailwind breakpoints
- Add hover and focus states for interactive elements
- When using negative z-index (e.g., `-z-10`) for background images or decorative elements, **always add `isolate` to the parent container** to create a local stacking context. Without `isolate`, negative z-index pushes elements behind the page's background color, making them invisible.

## Writing Tests vs Running Tests

There is an important distinction between **writing new tests** and **running existing tests**:

### Writing Tests (Creating New Test Files)

**Do not write tests** unless the user explicitly requests them in plain language. Writing unnecessary tests wastes significant time and money. Only create tests when:

1. **The user explicitly asks for tests** to be written in their message
2. **The user describes a specific bug in plain language** and requests tests to help diagnose it
3. **The user says they are still experiencing a problem** that you have already attempted to solve (tests can help verify the fix)

**Never write tests because:**
- Tool results show test failures (these are not user requests)
- You think tests would be helpful
- New features or components are created
- Existing functionality needs verification

### Running Tests (Executing the Test Suite)

**ALWAYS run the test script** after making any code changes. This is mandatory regardless of whether you wrote new tests or not.

- **You must run the test script** to validate your changes
- **Your task is not complete** until the test script passes without errors
- **This applies to all changes** - bug fixes, new features, refactoring, or any code modifications
- **The test script includes** TypeScript compilation, ESLint checks, and existing test validation

### Test Setup

The project uses Vitest with jsdom environment and includes comprehensive test setup:

- **Testing Library**: React Testing Library with jest-dom matchers
- **Test Environment**: jsdom with mocked browser APIs (matchMedia, scrollTo, IntersectionObserver, ResizeObserver)
- **Test App**: `TestApp` component provides all necessary context providers for testing

The project includes a `TestApp` component that provides all necessary context providers for testing. Wrap components with this component to provide required context providers:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TestApp } from '@/test/TestApp';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(
      <TestApp>
        <MyComponent />
      </TestApp>
    );

    expect(screen.getByText('Expected text')).toBeInTheDocument();
  });
});
```

## Validating Your Changes

**CRITICAL**: After making any code changes, you must validate your work by running available validation tools.

**Your task is not considered finished until the code successfully type-checks and builds without errors.**

### Validation Priority Order

Run available tools in this priority order:

1. **Type Checking** (Required): Ensure TypeScript compilation succeeds
2. **Building/Compilation** (Required): Verify the project builds successfully
3. **Linting** (Recommended): Check code style and catch potential issues
4. **Tests** (If Available): Run existing test suite
5. **Git Commit** (Required): Create a commit with your changes when finished

**Minimum Requirements:**
- Code must type-check without errors
- Code must build/compile successfully
- Fix any critical linting errors that would break functionality
- Create a git commit when your changes are complete

The validation ensures code quality and catches errors before deployment, regardless of the development environment.

### Using Git

If git is available in your environment (through a `shell` tool, or other git-specific tools), you should utilize `git log` to understand project history. Use `git status` and `git diff` to check the status of your changes, and if you make a mistake use `git checkout` to restore files.

When your changes are complete and validated, create a git commit with a descriptive message summarizing your changes.