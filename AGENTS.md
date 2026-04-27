# Project Overview

Ditto is a Nostr client built with React 19.x, TailwindCSS 3.x, Vite, shadcn/ui, and Nostrify, wrapped as a native iOS/Android app via Capacitor.

## Technology Stack

- **React 19.x** — hooks, concurrent rendering, ref-as-prop
- **TailwindCSS 3.x** — utility-first styling
- **Vite** — dev server and production bundler
- **shadcn/ui** — unstyled accessible components on Radix UI + Tailwind (48+ primitives in `@/components/ui`)
- **Nostrify** (`@nostrify/react`) — Nostr protocol framework
- **React Router** — client-side routing with `BrowserRouter` and automatic scroll-to-top
- **TanStack Query** — data fetching, caching, state
- **TypeScript** — type-safe JS. **Never use the `any` type.**
- **Capacitor** — native iOS/Android wrapper around the web app

## Project Structure

- `/src/components/` — UI components. `ui/` holds shadcn primitives; `auth/` holds login components; `dm/` holds direct-messaging UI (built on `DMContext`).
- `/src/hooks/` — custom hooks. Discover the full set with `ls src/hooks/`. Key ones: `useNostr`, `useAuthor`, `useCurrentUser`, `useNostrPublish`, `useUploadFile`, `useAppContext`, `useTheme`, `useToast`, `useLoggedInAccounts`, `useLoginActions`, `useIsMobile`, `useZaps`, `useWallet`, `useNWC`, `useShakespeare`.
- `/src/pages/` — page components wired into `AppRouter.tsx`. The catch-all `/:nip19` route is handled by `NIP19Page.tsx` (see the `nip19-routing` skill).
- `/src/lib/` — utility functions and shared logic.
- `/src/contexts/` — React context providers (`AppContext`, `NWCContext`, `DMContext`).
- `/src/test/` — testing utilities including the `TestApp` wrapper.
- `/public/` — static assets.
- `App.tsx` — **already configured** with `QueryClientProvider`, `NostrProvider`, `UnheadProvider`, `AppProvider`, `NostrLoginProvider`, `NWCContext`, `DMContext`. Read before editing; changes are rarely needed.
- `AppRouter.tsx` — React Router configuration.
- `NIP.md` — custom kinds documented by this project (see the `nostr-kinds` skill).

**Always read an existing file before modifying it.** Never overwrite `App.tsx`, `AppRouter.tsx`, or `NostrProvider` without first reading their contents.

## UI Components

Components in `@/components/ui` are unstyled, accessible primitives styled with Tailwind. They follow a consistent pattern using `React.forwardRef` and the `cn()` class-merge utility, and many are built on Radix UI primitives. When you need a specific primitive, list the directory (`ls src/components/ui/`) or import from `@/components/ui/<name>` — all common primitives are present (buttons, inputs, dialogs, dropdowns, forms, tables, carousels, sidebars, etc.).

## System Prompt Management

The assistant's behavior is defined by this file (`AGENTS.md`). Edit it directly to change guidelines — updates take effect the next session. Specialized workflows live in `/.agents/skills/` as loadable skills, discoverable through the `skill` tool.

## Nostr Protocol Integration

### The `useNostr` Hook

```ts
import { useNostr } from '@nostrify/react';

function useCustomHook() {
  const { nostr } = useNostr();
  // nostr.query(filters) / nostr.event(event) / nostr.req(filters)
}
```

By default `nostr` uses the app's connection pool (reads from one relay, publishes to all configured). For targeted single-relay or relay-group calls, load the **`nostr-relay-pools`** skill.

### Kinds, Tags, and NIP.md

When introducing a new kind, extending an existing NIP with new tags, or registering a kind in the UI (feed cards, detail pages, embedded previews, kind-label maps), load the **`nostr-kinds`** skill. It covers the NIP-vs-custom-kind decision framework, kind ranges, tag design (single-letter indexed tags, content vs. tags), the `NIP.md` documentation requirement, and Ditto's multi-location UI registration checklist.

Summary rules:

- **Kind ranges:** Regular (1000-9999), Replaceable (10000-19999), Addressable (30000-39999). Kinds below 1000 are legacy with per-kind storage semantics.
- **Prefer existing NIPs** over custom kinds. If you must mint a new kind, use an available kind-generation tool (never pick a number arbitrarily) and include a NIP-31 `alt` tag.
- **Relays only index single-letter tags.** Use `t` tags for categories.
- **Use `content` for** freeform text or industry-standard JSON only. Structured queryable data belongs in tags.
- **Update `NIP.md`** whenever you mint or modify a custom kind.

### Nostr Security Model

Nostr is permissionless — **anyone can publish any event**, and `nsec` keys sit in plaintext `localStorage`, so an XSS is an instant key-theft. Core rules:

- **Never use `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML`, or `document.write`** with event data, URL params, or any other untrusted string. If HTML must come from event data, run it through DOMPurify at the parse layer.
- **Sanitize every event-sourced URL** with `sanitizeUrl()` from `@/lib/sanitizeUrl` before it lands in `href`, `src`, `srcSet`, `poster`, iframe `src`, or CSS `url()`. It returns `undefined` for anything that isn't a well-formed `https:` URL. Prefer sanitizing at the parse layer.
- **Sanitize event-sourced strings interpolated into CSS** with `sanitizeCssString()` from `@/lib/fontLoader`. URLs in CSS `url()` still go through `sanitizeUrl()`.
- **Filter trust-sensitive queries by `authors`**. Without it, any event matching your kind/d-tag comes back — an attacker publishes a fake admin action and your UI trusts it.
- **Routes for addressable/replaceable events must carry the author in the path** (e.g. `/article/:npub/:slug`), so the route handler can include `authors` in its filter.
- **Don't filter by `authors` for public UGC** (kind 1 notes, reactions, zaps, discovery feeds) — anyone can post there by design.

```typescript
import { ADMIN_PUBKEYS } from '@/lib/admins';

// ❌ Anyone can publish kind 30078 with this d-tag and self-appoint as an organizer
nostr.query([{ kinds: [30078], '#d': ['pathos-organizers'], limit: 1 }]);

// ✅ Only trust the admin list
nostr.query([{ kinds: [30078], authors: ADMIN_PUBKEYS, '#d': ['pathos-organizers'], limit: 1 }]);
```

Load the **`nostr-security`** skill for the full threat model, NIP-72 moderation walkthrough, sanitization helper examples, and the pre-merge checklist.

### Querying Nostr Data

The standard pattern is a custom hook combining `useNostr` and `useQuery`:

```ts
function usePosts() {
  const { nostr } = useNostr();
  return useQuery({
    queryKey: ['posts'],
    queryFn: async (c) => nostr.query([{ kinds: [1], limit: 20 }], { signal: c.signal }),
  });
}
```

**Efficient query design matters** — each query costs relay capacity and may count against rate limits. Combine related kinds into a single filter (`kinds: [1, 6, 16]`) and split by type in JavaScript; don't fan out into parallel round-trips.

For kinds with required tags or strict schemas, filter results through a validator before returning. Load the **`nostr-queries`** skill for patterns, examples, and a NIP-52 validator walkthrough.

### The `useAuthor` Hook

Fetch kind 0 profile metadata for a pubkey:

```tsx
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';

function Post({ event }: { event: NostrEvent }) {
  const author = useAuthor(event.pubkey);
  const metadata: NostrMetadata | undefined = author.data?.metadata;

  const displayName = metadata?.name ?? genUserName(event.pubkey);
  const profileImage = metadata?.picture;
}
```

`NostrMetadata` (from `@nostrify/nostrify`) covers the standard kind-0 fields: `name`, `display_name`, `about`, `picture`, `banner`, `website`, `nip05`, `lud06`, `lud16`, `bot`. Read the type definition from the package for the exact field list.

### Publishing Events

Publishes go through `useNostrPublish`, which auto-adds a `client` tag. Always guard with `useCurrentUser`:

```tsx
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';

export function PostForm() {
  const { user } = useCurrentUser();
  const { mutate: createEvent } = useNostrPublish();

  if (!user) return <span>You must be logged in.</span>;

  return <button onClick={() => createEvent({ kind: 1, content: 'hello' })}>Post</button>;
}
```

**Mutating replaceable or addressable events requires a read-modify-write cycle.** Never read from the TanStack Query cache before mutating — use `fetchFreshEvent()` from `src/lib/fetchFreshEvent.ts` and pass the fetched event as `prev` so `useNostrPublish` can preserve `published_at`:

```ts
const prev = await fetchFreshEvent(nostr, { kinds: [10003], authors: [user.pubkey] });
await publishEvent({ kind: 10003, content: prev?.content ?? '', tags: newTags, prev: prev ?? undefined });
```

**Publishing new addressable events with user-derived d-tags (slugs, etc.) requires a collision check** — otherwise you silently overwrite an existing event with the same `(kind, pubkey, d)` triple.

Load the **`nostr-publishing`** skill for the full pattern: the `prev` property contract, bookmark/follow/mute examples, and d-tag collision prevention.

### Nostr Login

Use the `LoginArea` component (already wired into the project). It renders "Log in" / "Sign Up" buttons when logged out and an account switcher when logged in. **Don't wrap it in conditional logic.**

```tsx
import { LoginArea } from '@/components/auth/LoginArea';

<LoginArea className="max-w-60" />
```

`LoginArea` is inline-flex by default. Pass `flex` or `w-full` to expand it; otherwise set a sensible `max-w-*`.

**Social apps should include a profile/account menu in the main navigation** for access to settings, profile editing, and logout — don't only show `LoginArea` in logged-out states.

For an Edit Profile form, drop in `<EditProfileForm />` from `@/components/EditProfileForm` — no props, works automatically.

### NIP-19 Identifiers

Nostr uses bech32 identifiers (`npub1`, `nprofile1`, `note1`, `nevent1`, `naddr1`, `nsec1`). **All NIP-19 identifiers are routed at the URL root (`/:nip19`)**, handled by `src/pages/NIP19Page.tsx` — never nest them under `/note/`, `/profile/`, etc.

**Filters only accept hex.** Always decode before querying:

```ts
import { nip19 } from 'nostr-tools';

const decoded = nip19.decode(value);
if (decoded.type !== 'naddr') throw new Error('Unsupported identifier');
const { kind, pubkey, identifier } = decoded.data;

nostr.query([{
  kinds: [kind],
  authors: [pubkey],        // critical for addressable events
  '#d': [identifier],
}]);
```

Never treat `nsec1` or unknown prefixes as anything but a 404.

Load the **`nip19-routing`** skill for identifier-type comparisons, populating `NIP19Page`, building NIP-19 links with the most specific encoder, and security patterns.

### Rendering Rich Text Content

Nostr text notes (kind 1, 11, and 1111) have plaintext `content` that may contain URLs, hashtags, and Nostr URIs. Render them with the `NoteContent` component:

```tsx
import { NoteContent } from '@/components/NoteContent';

<div className="whitespace-pre-wrap break-words">
  <NoteContent event={post} className="text-sm" />
</div>
```

### Specialized Workflows

Load the matching skill when the feature requires it:

- **`file-uploads`** — `useUploadFile` + Blossom + NIP-94 `imeta` tags.
- **`nostr-encryption`** — NIP-44 / NIP-04 via the user's signer (DMs, gift wraps, private content).
- **`nostr-relay-pools`** — `nostr.relay(url)` / `nostr.group([urls])` for targeted queries.
- **`nostr-comments`** — Ditto's threaded comments (NIP-10 for kind 1, NIP-22 for everything else).
- **`nostr-direct-messages`** — DM implementation via `DMContext` (NIP-04 + NIP-17).
- **`nostr-infinite-scroll`** — feed pagination patterns.
- **`nip85-stats`** — NIP-85 trusted-assertion stats (followers, zap totals, etc.).
- **`ai-chat`** — Shakespeare AI streaming chat interfaces.

## App Configuration

The `AppProvider` manages global state (theme, NIP-65 relay list, Blossom servers, etc.) persisted to local storage. Default relay config:

```typescript
relayMetadata: {
  relays: [
    { url: 'wss://relay.ditto.pub', read: true, write: true },
    { url: 'wss://relay.primal.net', read: true, write: true },
    { url: 'wss://relay.damus.io', read: true, write: true },
  ],
  updatedAt: 0,
}
```

### Adding a New AppConfig Value

Adding a new configuration field requires updates in **three places**. Missing any will cause build failures or runtime issues.

1. **TypeScript interface** (`src/contexts/AppContext.ts`) — add the field to the `AppConfig` interface with a JSDoc comment.
2. **Zod schema** (`src/lib/schemas.ts`) — add the same field to `AppConfigSchema`. `DittoConfigSchema` (validates build-time `ditto.json`) is derived from `AppConfigSchema` with `.strict()` mode, so any field in `ditto.json` missing from the Zod schema causes a build error.
3. **Default value** (`src/contexts/AppContext.ts`) — if the field is required, add a default in `defaultConfig`. Optional fields (`?` in the interface, `.optional()` in Zod) can be omitted.

### Relay Management

- **`NostrSync`** auto-loads the user's NIP-65 relay list on login and writes it into `AppContext`.
- **Automatic publishing** — updating the relay config publishes a new kind 10002 event when the user is logged in.
- **`RelayListManager`** (`src/components/RelayListManager.tsx`) is a drop-in settings UI.

## Routing

Routes live in `AppRouter.tsx`. To add one:

1. Create the page component in `src/pages/`.
2. Import it in `AppRouter.tsx`.
3. Add the route **above** the catch-all `*` route: `<Route path="/your-path" element={<YourComponent />} />`.

The router provides automatic scroll-to-top on navigation and a 404 `NotFound` page.

## Development Practices

- React Query for data fetching and caching
- shadcn/ui component patterns
- Path aliases with `@/` prefix
- Component-based architecture with hooks
- **Never use the `any` type.**

## Design Standards

Designs should be polished and production-ready. Concrete rules:

- **Responsive** down to ~360px; test mobile, tablet, desktop.
- **WCAG 2.1 AA** — ≥ 4.5:1 contrast for body text, ≥ 3:1 for large text and UI. Full keyboard navigation, ARIA labels, visible `focus-visible` rings.
- **8px grid** for spacing (Tailwind's 4-based scale). Avoid `p-[13px]`-style one-offs.
- **Typography hierarchy** — ≥ 18px body, ≥ 40px primary headlines. Prefer a modern sans (e.g. Inter) for UI; pair a display/serif for headings when personality is needed.
- **Depth** — soft shadows, gentle gradients, rounded corners (`rounded-lg` / `rounded-xl`). Avoid heavy drop shadows.
- **Motion** — lightweight, purposeful (hover, scroll reveals, transitions). Respect `prefers-reduced-motion` with Tailwind's `motion-safe:` / `motion-reduce:` variants.
- **Reusable components** — consistent variants and feedback states (`hover`, `focus-visible`, `active`, `disabled`, `aria-invalid`). Use `cn()` for conditional classes and `class-variance-authority` for variants.
- **Custom over generic** — avoid template-looking headers. Combine layered visuals, subtle motion, and brand colors. Generate custom images with available tools before reaching for stock.

For fonts, theme switching, color-scheme changes, `useTheme`, and the `isolate` + negative-z-index gotcha, load the **`theming`** skill.

### Loading and Empty States

**Use skeletons** for structured content (feeds, profiles, forms). **Use spinners** only for buttons or short operations.

```tsx
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

For empty results, show a minimalist empty state in a `border-dashed` card:

```tsx
<Card className="border-dashed">
  <CardContent className="py-12 px-8 text-center">
    <p className="text-muted-foreground max-w-sm mx-auto">
      No results found. Try checking your relay connections or wait a moment for content to load.
    </p>
  </CardContent>
</Card>
```

## Capacitor Compatibility

Ditto runs inside Capacitor's WKWebView on iOS and WebView on Android. Several common web APIs do not work there:

- **`<a download>` file downloads** silently fail in WKWebView.
- **`<a target="_blank">` new tabs** are blocked.
- **`window.open()`** may be blocked without user-gesture context.

**Always use** `downloadTextFile(filename, content)` and `openUrl(url)` from `@/lib/downloadFile` — they bridge web and native automatically. Never use `document.createElement('a')` with `.click()`.

Detect native with `Capacitor.isNativePlatform()` from `@capacitor/core`. Run `npm run cap:sync` after adding or removing plugins.

Load the **`capacitor-compat`** skill for the full list of installed plugins, platform detection patterns, and `downloadFile.ts` API details. For Apple Lockdown Mode restrictions that affect WKWebView, load the **`lockdown-mode`** skill.

## Writing Tests vs. Running Tests

**Running the existing test script — always do it.** After any code change, run `npm run test`. The script runs `tsc --noEmit`, `eslint`, `vitest run`, and `vite build` in sequence. **Your task is not complete until it passes.**

**Writing new test files — don't, unless the user asks.** If the user explicitly requests tests, describes a bug to diagnose with a test, or reports that a problem persists after a fix, load the **`testing`** skill for Ditto's Vitest + `TestApp` setup and policy.

## Validating Your Changes

**Your task is not finished until the code type-checks and builds without errors.** Run validation in priority order, commit when done. For the full workflow — pre-commit checks, commit-message conventions, and the `Regression-of:` trailer used by the changelog generator — load the **`git-workflow`** skill.

**Always commit when finished.** Non-negotiable — every completed task ends with a commit.

## CI/CD Pipeline

Ditto uses GitLab CI (`.gitlab-ci.yml`) with five stages:

1. **test** — `npm run test` on every commit (skipped for tags).
2. **deploy** — `deploy-nsite` builds and uploads `dist/` to nsite via nsyte (default branch only).
3. **build** — `build-apk` produces a signed release APK and AAB (tags only).
4. **release** — creates a GitLab Release with the APK artifact (tags only).
5. **publish** — `publish-zapstore` (APK → Zapstore) and `publish-google-play` (AAB → Google Play production track), tags only.

Cut a release with `npm run release` — this creates a `v2026.MM.DD+shortsha` tag and pushes it. For the full release workflow (versioning, changelog, native builds, tagging) load the **`release`** skill.

For CI credential setup and rotation (Zapstore NIP-46 bunker, nsyte `nbunksec`, Google Play service-account JSON, Android keystore), load the **`ci-cd-publishing`** skill.
