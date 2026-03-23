# NIP: Custom Event Kinds

## Event Kinds Overview

| Kind  | Name                 | Description                                           |
|-------|----------------------|-------------------------------------------------------|
| 36767 | Theme Definition     | Shareable, named custom UI theme                      |
| 16767 | Active Profile Theme | The user's currently active theme (one per user)      |
| 16769 | Profile Tabs         | The user's custom profile page tabs (one per user)    |
| 30009 | Badge Definition     | NIP-58 badge definition with custom tag extensions    |
| 5950  | DVM Job Request      | NIP-90 DVM request for achievement badge claims       |
| 6950  | DVM Job Result       | NIP-90 DVM result for achievement badge claims        |

---

## Kind 36767: Theme Definition

### Summary

Addressable event kind for publishing shareable custom UI themes. A single user may publish multiple themes, each identified by a unique `d` tag.

A theme consists of colors, optional fonts, and an optional background. Colors are stored in `c` tags, fonts in `f` tags, and background in a `bg` tag.

### Event Structure

```json
{
  "kind": 36767,
  "content": "",
  "tags": [
    ["d", "mk-dark-theme"],
    ["c", "#1a1a2e", "background"],
    ["c", "#e0e0e0", "text"],
    ["c", "#6c3ce0", "primary"],
    ["f", "Inter", "https://example.com/inter.woff2"],
    ["bg", "url https://example.com/bg.jpg", "mode cover", "m image/jpeg", "dim 1920x1080"],
    ["title", "MK Dark Theme"],
    ["alt", "Custom theme: MK Dark Theme"]
  ]
}
```

### Content

The `content` field is unused and MUST be an empty string (`""`).

### Tags

| Tag     | Required | Description                                                                           |
|---------|----------|---------------------------------------------------------------------------------------|
| `d`     | Yes      | Unique identifier (slug) for this theme, e.g. `"mk-dark-theme"`                      |
| `c`     | Yes (×3) | Hex color with marker. See [Color Tags](#color-tags).                                 |
| `f`     | No       | Font declaration. See [Font Tag](#font-tag).                                          |
| `bg`    | No       | Background media. See [Background Tag](#background-tag).                              |
| `title` | Yes      | Human-readable theme name                                                             |
| `alt`   | Yes      | NIP-31 human-readable fallback                                                        |

### Multiple Themes Per User

Since kind 36767 is addressable, a user can publish multiple themes by using different `d` tag values. Publishing a new event with the same `d` tag replaces the previous version (this is how editing works).

---

## Kind 16767: Active Profile Theme

### Summary

Replaceable event that represents the user's currently active profile theme. Only one per user. When other users visit a profile, they query this kind to determine what theme to display.

### Event Structure

```json
{
  "kind": 16767,
  "content": "",
  "tags": [
    ["c", "#1a1a2e", "background"],
    ["c", "#e0e0e0", "text"],
    ["c", "#6c3ce0", "primary"],
    ["f", "Inter", "https://example.com/inter.woff2"],
    ["bg", "url https://example.com/bg.jpg", "mode cover", "m image/jpeg"],
    ["title", "MK Dark Theme"],
    ["alt", "Active profile theme"]
  ]
}
```

### Content

The `content` field is unused and MUST be an empty string (`""`).

### Tags

| Tag     | Required | Description                                                                           |
|---------|----------|---------------------------------------------------------------------------------------|
| `c`     | Yes (×3) | Hex color with marker. See [Color Tags](#color-tags).                                 |
| `f`     | No       | Font declaration. See [Font Tag](#font-tag).                                          |
| `bg`    | No       | Background media. See [Background Tag](#background-tag).                              |
| `title` | No       | Human-readable name for the theme                                                     |
| `alt`   | Yes      | NIP-31 human-readable fallback                                                        |

### Client Behavior

- When visiting a profile, clients query `{ kinds: [16767], authors: [pubkey], limit: 1 }` to get the active theme.
- Clients read the `c` tags to extract colors, `f` tags for fonts, and `bg` tag for the background.
- Setting a new active theme publishes a new kind 16767 event (replacing the old one).
- To remove the active theme, publish a kind 5 deletion event targeting kind 16767.

---

## Shared Tag Definitions

The following tag definitions apply to both kind 36767 and kind 16767.

### Color Tags

Format: `["c", "#rrggbb", "<marker>"]`

| Index | Required | Description                                                                                   |
|-------|----------|-----------------------------------------------------------------------------------------------|
| 0     | Yes      | Tag name: `"c"`                                                                               |
| 1     | Yes      | Lowercase 6-digit hex color code including the `#` sign (e.g. `"#ff0000"`)                    |
| 2     | Yes      | Color role marker: one of `"primary"`, `"text"`, or `"background"`                            |

- All three markers (`"primary"`, `"text"`, `"background"`) MUST be present.
- Only one `c` tag per marker is allowed.

### Font Tag

Format: `["f", "<family>", "<url>"]`

| Index | Required | Description                                                                                   |
|-------|----------|-----------------------------------------------------------------------------------------------|
| 0     | Yes      | Tag name: `"f"`                                                                               |
| 1     | Yes      | CSS `font-family` name (e.g. `"Inter"`)                                                       |
| 2     | Yes      | Direct URL to a font file (`.woff2`, `.ttf`, `.otf`)                                          |

- The `f` tag is optional on the event.
- At most one `f` tag per event is allowed.
- The font applies globally to all text (body, headings, UI elements).
- If the URL fails to load, the client SHOULD fall back to a default font gracefully.
- Variable font files (covering multiple weights in a single file) are preferred.

### Background Tag

The `bg` tag uses an `imeta`-style variadic format where each entry (after the tag name) is a space-delimited key/value pair.

Format: `["bg", "url <url>", "mode <mode>", "m <mime-type>", ...]`

| Key         | Required | Description                                                                              |
|-------------|----------|------------------------------------------------------------------------------------------|
| `url`       | Yes      | URL to an image or video file                                                            |
| `mode`      | Yes      | Display mode: `"cover"` or `"tile"`                                                      |
| `m`         | Yes      | MIME type (e.g. `"image/jpeg"`, `"image/png"`, `"video/mp4"`)                            |
| `dim`       | No       | Dimensions in pixels: `"<width>x<height>"` (e.g. `"1920x1080"`)                          |
| `blurhash`  | No       | Blurhash placeholder string for progressive loading                                      |

- At most one `bg` tag is allowed per event.
- Clients MAY choose not to render video backgrounds for performance or bandwidth reasons.
- Unknown keys SHOULD be ignored for forward compatibility.

---

## Kind 16769: Profile Tabs

### Summary

Replaceable event kind for publishing a user's custom profile page tabs. Exactly one event per user (no `d` tag). Each tab defines a Nostr filter (NIP-01) that clients execute to populate the tab's content.

Visitors who load a profile fetch this event to display the custom tabs alongside the standard Posts / Media / Likes / Wall tabs.

### Event Structure

```json
{
  "kind": 16769,
  "content": "",
  "tags": [
    ["var", "$follows", "p", "a:3:$me:"],
    ["tab", "Bitcoin Posts", "{\"kinds\":[1],\"authors\":[\"$me\"],\"search\":\"bitcoin\"}"],
    ["tab", "Feed", "{\"kinds\":[1,6],\"authors\":[\"$follows\"],\"limit\":40}"],
    ["alt", "Custom profile tabs"]
  ]
}
```

### Content

The `content` field is unused and MUST be an empty string (`""`).

### Tags

| Tag   | Format                                         | Description                                                    |
|-------|------------------------------------------------|----------------------------------------------------------------|
| `tab` | `["tab", "<label>", "<filterJSON>"]`           | One tag per custom tab. Order defines display order.           |
| `var` | `["var", "<$name>", "<tag>", "<pointer>"]`     | Variable definition. See [Variable Tags](#variable-tags).      |
| `alt` | `["alt", "Custom profile tabs"]`               | NIP-31 human-readable fallback. Required.                      |

### Tab Filter JSON

The third element of each `tab` tag is a JSON-encoded **NIP-01 filter object**, optionally extended with the NIP-50 `search` field. Variable placeholders (strings starting with `$`) may appear wherever a string value is expected.

```json
{
  "kinds": [1],
  "authors": ["$me"],
  "search": "bitcoin",
  "limit": 20
}
```

Supported filter fields: `ids`, `authors`, `kinds`, `#<tag>` (e.g. `#t`, `#e`, `#p`), `since`, `until`, `limit`, `search`.

### Variable Tags

Variable tags define named placeholders that are resolved before the filter is executed. Each `var` tag extracts tag values from a referenced Nostr event.

Format: `["var", "$name", "<tag-to-extract>", "<event-pointer>"]`

| Index | Description                                                                                      |
|-------|--------------------------------------------------------------------------------------------------|
| 0     | Tag name: `"var"`                                                                                |
| 1     | Variable name, starting with `$` (e.g. `"$follows"`)                                            |
| 2     | Tag name to extract values from in the referenced event (e.g. `"p"`)                             |
| 3     | Event pointer: `e:<event-id>` for a specific event, or `a:<kind>:<pubkey>:<d-tag>` for an addressable/replaceable event coordinate. Variables like `$me` may appear in the pubkey position. |

Example — extract follow list pubkeys:
```json
["var", "$follows", "p", "a:3:$me:"]
```

This means: fetch the kind 3 event authored by `$me`, extract all `p` tag values, and bind them to `$follows`.

### Reserved Variable: `$me`

The `$me` variable is the only runtime-provided variable. It resolves to the **profile owner's pubkey** (the author of the kind 16769 event). It does not require a `var` tag definition.

### Variable Resolution

When a variable appears in a filter field that expects an array (e.g. `authors`, `ids`, `#p`), the variable is **expanded in-place** (spliced into the array). Literal values may be mixed with variables.

```json
["tab", "Mixed", "{\"authors\":[\"$follows\",\"abc123...\"],\"kinds\":[1]}"]
```

After resolution (assuming `$follows` = `["pk1", "pk2"]`):
```json
{"authors": ["pk1", "pk2", "abc123..."], "kinds": [1]}
```

### Behavior

- To **add or update** tabs: publish a new kind 16769 event with all current `tab` and `var` tags.
- To **clear** all tabs: publish a kind 16769 event with no `tab` tags (only `alt`).
- Clients MUST filter by `authors: [pubkey]` when querying to prevent spoofing.
- `var` tags are shared across all `tab` tags in the same event.

---

## Kind 0 Extension: Avatar Shape

### Summary

An optional `shape` property on kind 0 (profile metadata) that controls how the user's avatar is masked/clipped when displayed. The value is an emoji character whose silhouette is used as a mask over the avatar image. When absent, the avatar renders as the standard circle.

### Metadata Field

The `shape` field is added to the JSON content of a kind 0 event alongside standard fields like `name`, `picture`, etc. Its value is a single emoji character (including multi-codepoint emoji such as flags, ZWJ sequences, and skin-tone variants).

```json
{
  "kind": 0,
  "content": "{\"name\":\"Luna\",\"picture\":\"https://example.com/luna.jpg\",\"shape\":\"🌙\"}"
}
```

### Client Behavior

- When `shape` is absent, clients SHOULD render the avatar as a circle (the current universal default).
- When `shape` is a valid emoji, clients SHOULD use the emoji's silhouette as an alpha mask over the avatar image. The specific rendering technique is platform-dependent (see below).
- When `shape` is set to an unrecognized or invalid value, clients MUST fall back to a circle. This ensures forward compatibility.
- The `shape` field is purely cosmetic and has no protocol-level significance.
- Clients MAY choose not to support this extension, in which case avatars render as circles as usual.

---

## Kind 30009: Badge Definition Tag Extensions

### Summary

This project uses standard NIP-58 badge definitions (kind 30009) with additional custom tags to support categorization, tiered achievements, and shop functionality. The core event structure follows NIP-58 exactly; these tags are additive and do not alter the standard `d`, `name`, `description`, `image`, and `thumb` tags.

### Custom Tags

| Tag      | Format                                     | Description                                                     |
|----------|--------------------------------------------|-----------------------------------------------------------------|
| `t`      | `["t", "shop"]`                            | Marks the badge as a shop badge (browseable in the badge shop)  |
| `t`      | `["t", "achievement"]`                     | Marks the badge as an achievement (claimable via DVM)           |
| `t`      | `["t", "<category>"]`                      | Category for filtering (e.g. `"social"`, `"content"`, `"flags"`, `"crypto"`) |
| `tier`   | `["tier", "<level>"]`                      | Achievement tier: `"bronze"`, `"silver"`, `"gold"`, or `"diamond"` |

A badge may have multiple `t` tags. For example, a shop badge in the "flags" category would have both `["t", "shop"]` and `["t", "flags"]`.

### Achievement Categories

Achievement badges use `t` tags with these category values: `social`, `profile`, `content`, `engagement`, `community`, `exploration`.

### Shop Categories

Shop badges use `t` tags with these category values: `flags`, `identity`, `causes`, `interests`, `animals`, `crypto`, `memes`, `nostr`, `limited`.

### Example: Achievement Badge

```json
{
  "kind": 30009,
  "content": "",
  "tags": [
    ["d", "first-post"],
    ["name", "First Post"],
    ["description", "Publish your first text note on Nostr"],
    ["image", "https://example.com/first-post.png"],
    ["t", "achievement"],
    ["t", "content"],
    ["tier", "bronze"],
    ["alt", "Badge definition: First Post"]
  ]
}
```

### Example: Shop Badge

```json
{
  "kind": 30009,
  "content": "",
  "tags": [
    ["d", "bitcoin-flag"],
    ["name", "Bitcoin Flag"],
    ["description", "Show your support for Bitcoin"],
    ["image", "https://example.com/bitcoin-flag.png"],
    ["t", "shop"],
    ["t", "crypto"],
    ["alt", "Badge definition: Bitcoin Flag"]
  ]
}
```

### Querying

Shop badges are queried by filtering for the `t=shop` tag scoped to a trusted badge issuer:

```
{ kinds: [30009], authors: [<issuer-pubkey>], #t: ["shop"] }
```

Achievement badges are queried similarly with `t=achievement`:

```
{ kinds: [30009], authors: [<issuer-pubkey>], #t: ["achievement"] }
```

Categories are filtered client-side after fetching, since relay-level queries can only match one `t` value at a time.

---

## DVM Achievement Claim (Kinds 5950 / 6950)

### Summary

Achievement badges are claimed through a DVM (Data Vending Machine) flow using standard NIP-90 kinds 5950 (job request) and 6950 (job result). The custom job type is `claim-achievement`.

### Job Request (Kind 5950)

The user publishes a kind 5950 event to request verification and awarding of an achievement badge.

```json
{
  "kind": 5950,
  "content": "",
  "tags": [
    ["i", "30009:<issuer-pubkey>:<badge-identifier>", "event"],
    ["param", "action", "claim-achievement"],
    ["p", "<issuer-pubkey>"]
  ]
}
```

| Tag     | Description                                                                 |
|---------|-----------------------------------------------------------------------------|
| `i`     | The `a`-tag coordinate of the badge definition being claimed                |
| `param` | Action parameter: always `"claim-achievement"` for this job type            |
| `p`     | The badge issuer's pubkey (DVM operator that should process the request)    |

### Job Result (Kind 6950)

The DVM responds with a kind 6950 event indicating whether the achievement was verified and awarded.

```json
{
  "kind": 6950,
  "content": "Achievement verified! Badge awarded.",
  "tags": [
    ["e", "<job-request-event-id>"],
    ["p", "<requester-pubkey>"],
    ["status", "success"]
  ]
}
```

| Tag      | Description                                                               |
|----------|---------------------------------------------------------------------------|
| `e`      | Reference to the original kind 5950 job request event                     |
| `p`      | The pubkey of the user who requested the claim                            |
| `status` | `"success"` if the achievement was verified and badge awarded, `"error"` otherwise |
| `content`| Human-readable message describing the result                              |

### Flow

1. User publishes a kind 5950 job request referencing the badge definition's `a`-tag coordinate.
2. The DVM (badge bot) receives the request, verifies the user has met the achievement criteria (e.g. published a first post, followed N users, etc.), and if verified, publishes a kind 8 badge award event.
3. The DVM publishes a kind 6950 result event referencing the job request with a `status` tag.
4. The client listens for the kind 6950 result (filtered by `authors: [issuer]` and `#e: [jobEventId]`) with a 30-second timeout.
5. On success, the user can accept the badge into their kind 30008 profile badges.

