# NIP: Custom Event Kinds

## Event Kinds Overview

### Ditto Kinds

| Kind  | Name                 | Description                                           |
|-------|----------------------|-------------------------------------------------------|
| 36767 | Theme Definition     | Shareable, named custom UI theme                      |
| 16767 | Active Profile Theme | The user's currently active theme (one per user)      |
| 16769 | Profile Tabs         | The user's custom profile page tabs (one per user)    |

### Community Kinds

These event kinds were created by community contributors and are supported by Ditto. Full specifications are maintained by their respective authors.

| Kind  | Name                   | Description                                                      | Spec                                                                                      |
|-------|------------------------|------------------------------------------------------------------|-------------------------------------------------------------------------------------------|
| 8211  | Encrypted Letter       | Encrypted personal letter with visual stationery                 | [NIP](https://gitlab.com/chad.curtis/lief/-/blob/main/NIP.md)                            |
| 4223  | Weather Reading        | Sensor readings from a weather station                           | [Draft NIP](https://github.com/nostr-protocol/nips/pull/2163)                            |
| 16158 | Weather Station        | Weather station metadata (location, sensors, connectivity)       | [Draft NIP](https://github.com/nostr-protocol/nips/pull/2163)                            |
| 31124 | Blobbi Pet State       | Current state of a virtual Blobbi pet (addressable)              | [NIP-BB](https://github.com/Danidfra/nostr-pet/blob/production/NIP.md)                   |
| 14919 | Blobbi Interaction     | Individual pet interaction (feed, play, clean, etc.)             | [NIP-BB](https://github.com/Danidfra/nostr-pet/blob/production/NIP.md)                   |
| 14920 | Blobbi Breeding        | Breeding event between two adult Blobbis                         | [NIP-BB](https://github.com/Danidfra/nostr-pet/blob/production/NIP.md)                   |
| 14921 | Blobbi Record          | Immutable lifecycle record (birth, evolution, adoption)          | [NIP-BB](https://github.com/Danidfra/nostr-pet/blob/production/NIP.md)                   |
| 11125 | Blobbonaut Profile     | Owner profile with coins, achievements, and inventory            | [NIP-BB](https://github.com/Danidfra/nostr-pet/blob/production/NIP.md)                   |

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

## Community NIP Specifications

The following specifications are maintained by their respective authors. Ditto implements these kinds but does not own the specs. See each link for the full event structure, tags, and client behavior.

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

