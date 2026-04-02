# NIP: Custom Event Kinds

## Event Kinds Overview

### Ditto Kinds

| Kind  | Name                 | Description                                           |
|-------|----------------------|-------------------------------------------------------|
| 777   | Spell                | Portable Nostr relay query (saved feed / custom feed) |
| 36767 | Theme Definition     | Shareable, named custom UI theme                      |
| 16767 | Active Profile Theme | The user's currently active theme (one per user)      |
| 16769 | Profile Tabs         | The user's custom profile page tabs (one per user)    |

### Community Kinds

These event kinds were created by community contributors and are supported by Ditto. Full specifications are maintained by their respective authors.

| Kind  | Name                   | Description                                                      | Spec                                                                                      |
|-------|------------------------|------------------------------------------------------------------|-------------------------------------------------------------------------------------------|
| 3367  | Color Moment           | Color palette post expressing a mood                             | [NIP](https://gitlab.com/chad.curtis/espy/-/blob/main/NIP.md)                            |
| 4223  | Weather Reading        | Sensor readings from a weather station                           | [Draft NIP](https://github.com/nostr-protocol/nips/pull/2163)                            |
| 7516  | Found Log              | Log entry recording a user finding a geocache                    | [NIP-GC](https://gitlab.com/chad.curtis/treasures/-/blob/main/NIP-GC.md)                 |
| 8211  | Encrypted Letter       | Encrypted personal letter with visual stationery                 | [NIP](https://gitlab.com/chad.curtis/lief/-/blob/main/NIP.md)                            |
| 11125 | Blobbonaut Profile     | Owner profile with coins, achievements, and inventory            | [NIP-BB](https://github.com/Danidfra/nostr-pet/blob/production/NIP.md)                   |
| 14919 | Blobbi Interaction     | Individual pet interaction (feed, play, clean, etc.)             | [NIP-BB](https://github.com/Danidfra/nostr-pet/blob/production/NIP.md)                   |
| 14920 | Blobbi Breeding        | Breeding event between two adult Blobbis                         | [NIP-BB](https://github.com/Danidfra/nostr-pet/blob/production/NIP.md)                   |
| 14921 | Blobbi Record          | Immutable lifecycle record (birth, evolution, adoption)          | [NIP-BB](https://github.com/Danidfra/nostr-pet/blob/production/NIP.md)                   |
| 16158 | Weather Station        | Weather station metadata (location, sensors, connectivity)       | [Draft NIP](https://github.com/nostr-protocol/nips/pull/2163)                            |
| 31124 | Blobbi Pet State       | Current state of a virtual Blobbi pet (addressable)              | [NIP-BB](https://github.com/Danidfra/nostr-pet/blob/production/NIP.md)                   |
| 37516 | Geocache               | Geocache listing for real-world treasure hunting                 | [NIP-GC](https://gitlab.com/chad.curtis/treasures/-/blob/main/NIP-GC.md)                 |

---

## Kind 777: Spell (NIP-A7)

### Summary

Regular (non-replaceable) event that encodes a Nostr relay query filter as a portable, shareable event. Spells function as saved feeds — users can publish, discover, and execute them across clients.

See [NIP-A7](https://github.com/nostr-protocol/nips) for the full specification.

### Event Structure

```json
{
  "kind": 777,
  "content": "Notes about Bitcoin from my contacts",
  "tags": [
    ["cmd", "REQ"],
    ["name", "Bitcoin from contacts"],
    ["alt", "Spell: Bitcoin from contacts"],
    ["k", "1"],
    ["authors", "$contacts"],
    ["tag", "t", "bitcoin"],
    ["since", "7d"],
    ["limit", "50"],
    ["media", "images"],
    ["language", "en"],
    ["sort", "trending"]
  ]
}
```

### Content

The `content` field contains a human-readable description of the query in plain text. It MAY be an empty string.

### Filter Tags

| Tag       | Values                                  | Description                              |
|-----------|-----------------------------------------|------------------------------------------|
| `cmd`     | `REQ` or `COUNT`                        | Query command type (required)            |
| `k`       | `<kind number>`                         | Kind filter — one tag per kind           |
| `authors` | `<pubkey1>`, `<pubkey2>`, ...           | Author filter (supports `$me`, `$contacts`) |
| `ids`     | `<id1>`, `<id2>`, ...                   | Event ID filter                          |
| `tag`     | `<letter>`, `<val1>`, `<val2>`, ...     | Tag filter → `#<letter>` in NostrFilter  |
| `limit`   | `<integer>`                             | Max results                              |
| `since`   | `<timestamp>` or `<relative>`           | Start time (supports relative: `7d`, `2w`, `1mo`, `1y`) |
| `until`   | `<timestamp>` or `<relative>`           | End time (same format as since)          |
| `search`  | `<query string>`                        | NIP-50 full-text search                  |
| `relays`  | `<wss://url1>`, `<wss://url2>`, ...     | Target relay URLs                        |

### Client-Hint Tags

These tags instruct clients how to build NIP-50 search extensions. They are NOT part of the NIP-01 filter — they are metadata that clients use to construct search strings and apply client-side filters.

| Tag              | Values                                    | Description                                        |
|------------------|-------------------------------------------|----------------------------------------------------|
| `media`          | `images`, `videos`, `vines`, `none`       | Media type filter (omit for all)                   |
| `language`       | ISO 639-1 code (e.g. `en`, `ja`)         | Language filter                                    |
| `platform`       | `nostr`, `activitypub`, `atproto`        | Protocol filter (omit for `nostr`)                 |
| `sort`           | `hot`, `trending`                         | Sort preference (omit for `recent`)                |
| `include-replies`| `false`                                   | Exclude replies (omit to include)                  |

Client-hint tags that use NIP-50 extensions (`media`, `language`, `platform`, `sort`) require a relay that supports these extensions (e.g. Ditto relay). Clients SHOULD route queries with these extensions to a compatible relay.

### Metadata Tags

| Tag              | Values     | Description                                    |
|------------------|------------|------------------------------------------------|
| `name`           | `<string>` | Human-readable spell name                      |
| `alt`            | `<string>` | NIP-31 alternative text                        |
| `t`              | `<topic>`  | Topic tag for categorization                   |
| `close-on-eose`  | none       | Close subscription after EOSE                  |

### Runtime Variables

| Variable     | Resolves to                                           |
|-------------|-------------------------------------------------------|
| `$me`       | The executing user's pubkey                           |
| `$contacts` | All pubkeys from the executing user's kind 3 contact list |

### Relative Timestamps

`since` and `until` support relative durations: `s` (seconds), `m` (minutes), `h` (hours), `d` (days), `w` (weeks), `mo` (months/30d), `y` (years/365d). `now` = current timestamp.

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
    ["f", "Inter", "https://example.com/inter.woff2", "body"],
    ["f", "Playfair Display", "https://example.com/playfair.woff2", "title"],
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
    ["f", "Inter", "https://example.com/inter.woff2", "body"],
    ["f", "Playfair Display", "https://example.com/playfair.woff2", "title"],
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

Format: `["f", "<family>", "<url>", "<role>"]`

| Index | Required | Description                                                                                   |
|-------|----------|-----------------------------------------------------------------------------------------------|
| 0     | Yes      | Tag name: `"f"`                                                                               |
| 1     | Yes      | CSS `font-family` name (e.g. `"Inter"`)                                                       |
| 2     | Yes      | Direct URL to a font file (`.woff2`, `.ttf`, `.otf`)                                          |
| 3     | Yes      | Font role: `"body"` or `"title"`                                                              |

**Roles:**

| Role      | Applies to                                      |
|-----------|--------------------------------------------------|
| `"body"`  | All text globally (body, headings, UI elements)  |
| `"title"` | The user's profile display name                  |

**Rules:**

- The `f` tag is optional on the event.
- At most one `f` tag per role is allowed (i.e. one body font and one title font).
- The `"body"` font tag MUST be ordered before the `"title"` font tag. This ensures backward-compatible clients that only read the first `f` tag will pick up the body font.
- If the URL fails to load, the client SHOULD fall back to a default font gracefully.
- Clients that do not recognize a role SHOULD ignore that `f` tag.
- Legacy events with an `f` tag that has no role marker (only 3 elements) SHOULD be treated as `"body"`.
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

Replaceable event kind for publishing a user's custom profile page tabs. Exactly one event per user (no `d` tag). Each tab stores a kind:777 spell event (JSON-encoded) that clients execute to populate the tab's content.

Visitors who load a profile fetch this event to display the custom tabs alongside the standard Posts / Media / Likes / Wall tabs.

### Event Structure

```json
{
  "kind": 16769,
  "content": "",
  "tags": [
    ["alt", "Custom profile tabs"],
    ["tab", "Bitcoin Posts", "{\"kind\":777,\"tags\":[[\"cmd\",\"REQ\"],[\"name\",\"Bitcoin Posts\"],[\"k\",\"1\"],[\"authors\",\"$me\"],[\"search\",\"bitcoin\"],[\"alt\",\"Spell: Bitcoin Posts\"]],\"content\":\"\",\"id\":\"\",\"pubkey\":\"\",\"created_at\":0,\"sig\":\"\"}"],
    ["tab", "Feed", "{\"kind\":777,\"tags\":[[\"cmd\",\"REQ\"],[\"name\",\"Feed\"],[\"k\",\"1\"],[\"k\",\"6\"],[\"authors\",\"$contacts\"],[\"alt\",\"Spell: Feed\"]],\"content\":\"\",\"id\":\"\",\"pubkey\":\"\",\"created_at\":0,\"sig\":\"\"}"]
  ]
}
```

### Content

The `content` field is unused and MUST be an empty string (`""`).

### Tags

| Tag   | Format                                         | Description                                                    |
|-------|------------------------------------------------|----------------------------------------------------------------|
| `tab` | `["tab", "<label>", "<spellJSON>"]`            | One tag per custom tab. Order defines display order.           |
| `alt` | `["alt", "Custom profile tabs"]`               | NIP-31 human-readable fallback. Required.                      |

### Tab Spell JSON

The third element of each `tab` tag is a JSON-encoded **kind:777 spell event** (see [Kind 777](#kind-777-spell-nip-a7)). The spell event contains all filter parameters, runtime variables (`$me`, `$contacts`), and client hints (media type, language, sort, etc.) in its tags.

The spell does not need to be signed or published to relays -- it is stored inline as a structural template. The `id`, `pubkey`, `created_at`, and `sig` fields may be empty strings or zero.

### Behavior

- To **add or update** tabs: publish a new kind 16769 event with all current `tab` tags.
- To **clear** all tabs: publish a kind 16769 event with no `tab` tags (only `alt`).
- Clients MUST filter by `authors: [pubkey]` when querying to prevent spoofing.

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

## Community NIP Specifications

The following specifications are maintained by their respective authors. Ditto implements these kinds but does not own the specs. See each link for the full event structure, tags, and client behavior.

### Color Moments (Kind 3367)

**Author:** Chad Curtis
**Spec:** https://gitlab.com/chad.curtis/espy/-/blob/main/NIP.md
**App:** https://espy.you

Color palette posts capturing 3-6 colors from a beautiful moment, optionally accompanied by an emoji and layout preference. Supports horizontal, vertical, grid, star, checkerboard, and diagonal stripe layouts. A form of pre-verbal visual communication through color and emotion.

### Geocaching (Kinds 37516, 7516)

**Author:** Chad Curtis
**Spec:** https://gitlab.com/chad.curtis/treasures/-/blob/main/NIP-GC.md
**App:** https://treasures.to

NIP-GC defines geocaching on Nostr. Kind 37516 (addressable) is a geocache listing with location (geohash), difficulty/terrain scores, size, and type. Kind 7516 is a found log recording a successful visit. The spec also covers comment logs (kind 1111 via NIP-22), verified finds with cryptographic proof (kind 7517), and cache retirement.

### Personal Letters (Kind 8211)

**Author:** Chad Curtis
**Spec:** https://gitlab.com/chad.curtis/lief/-/blob/main/NIP.md
**App:** https://lief.to

NIP-44 encrypted personal letters with visual stationery, hand-drawn stickers, decorative frames, and custom fonts. Letters render as 5:4 landscape postcards. The privacy model is intentionally postcard-like: sender/recipient metadata is visible, content is encrypted.

### Weather Station (Kinds 4223, 16158)

**Author:** Sam Thomson
**Spec:** https://github.com/nostr-protocol/nips/pull/2163
**App:** https://weather.shakespeare.wtf
**Firmware:** https://github.com/samthomson/weather-station

Kind 16158 (replaceable) describes a weather station's configuration: name, geohash location, elevation, power source, connectivity, and sensor inventory. Kind 4223 (regular) carries individual sensor readings as 3-parameter tags `[sensor_type, value, model]`, enabling historical queries and cross-station comparison. Each station has its own keypair.

### Blobbi Virtual Pet (Kinds 31124, 14919, 14920, 14921, 11125)

**Author:** Danifra
**Spec:** https://github.com/Danidfra/nostr-pet/blob/production/NIP.md
**App:** https://nostr-pet.vercel.app
**See also:** [Blobbi tag schema](docs/blobbi/blobbi-tag-schema.md) (Ditto-specific integration details)

NIP-BB defines a virtual pet lifecycle on Nostr. Kind 31124 (addressable) holds the current pet state across three stages (egg, baby, adult) with stats, appearance, and personality traits. Kind 14919 logs individual interactions, kind 14920 records breeding events, kind 14921 stores immutable lifecycle records, and kind 11125 (replaceable) holds the owner's profile with coins, achievements, and inventory.

