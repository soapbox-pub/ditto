# NIP: Custom Event Kinds

## Event Kinds Overview

| Kind  | Name                 | Description                                           |
|-------|----------------------|-------------------------------------------------------|
| 33891 | Theme Definition     | Shareable, named custom UI theme with colors          |
| 11667 | Active Profile Theme | The user's currently active theme (one per user)      |

---

## Kind 33891: Theme Definition

### Summary

Addressable event kind for publishing shareable custom UI themes. A single user may publish multiple themes, each identified by a unique `d` tag.

Theme colors are stored in `c` tags using hex color codes with a required marker indicating the color's role.

### Event Structure

```json
{
  "kind": 33891,
  "content": "",
  "tags": [
    ["d", "mk-dark-theme"],
    ["c", "#1a1a2e", "background"],
    ["c", "#e0e0e0", "text"],
    ["c", "#6c3ce0", "primary"],
    ["title", "MK Dark Theme"],
    ["description", "A sleek dark theme with purple and blue accents"],
    ["alt", "Custom theme: MK Dark Theme"],
    ["t", "theme"]
  ]
}
```

### Content

The `content` field is unused and MUST be an empty string (`""`).

### Tags

| Tag           | Required | Description                                                                                                                                                                                                                                     |
|---------------|----------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `d`           | Yes      | Unique identifier (slug) for this theme, e.g. `"mk-dark-theme"`                                                                                                                                                                                |
| `c`           | Yes (×3) | Hex color with marker. Format: `["c", "#rrggbb", "<marker>"]`. Index 1 is a lowercase 6-digit hex color code including the `#` sign (e.g. `"#ff0000"`). Index 2 is a required marker: one of `"primary"`, `"text"`, or `"background"`. All three markers MUST be present, and only one `c` tag per marker is allowed. |
| `title`       | Yes      | Human-readable theme name                                                                                                                                                                                                                       |
| `description` | No       | Brief description of the theme                                                                                                                                                                                                                  |
| `alt`         | Yes      | NIP-31 human-readable fallback                                                                                                                                                                                                                  |
| `t`           | Yes      | Set to `"theme"` for discoverability                                                                                                                                                                                                            |

### Multiple Themes Per User

Since kind 33891 is addressable, a user can publish multiple themes by using different `d` tag values. Publishing a new event with the same `d` tag replaces the previous version (this is how editing works).

---

## Kind 11667: Active Profile Theme

### Summary

Replaceable event that represents the user's currently active profile theme. Only one per user. When other users visit a profile, they query this kind to determine what theme to display.

Theme colors are stored in `c` tags using hex color codes with a required marker indicating the color's role.

### Event Structure

```json
{
  "kind": 11667,
  "content": "",
  "tags": [
    ["c", "#1a1a2e", "background"],
    ["c", "#e0e0e0", "text"],
    ["c", "#6c3ce0", "primary"],
    ["title", "MK Dark Theme"],
    ["alt", "Active profile theme"]
  ]
}
```

### Content

The `content` field is unused and MUST be an empty string (`""`).

### Tags

| Tag     | Required | Description                                                                                                                                                                                                                                     |
|---------|----------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `c`     | Yes (×3) | Hex color with marker. Format: `["c", "#rrggbb", "<marker>"]`. Index 1 is a lowercase 6-digit hex color code including the `#` sign (e.g. `"#ff0000"`). Index 2 is a required marker: one of `"primary"`, `"text"`, or `"background"`. All three markers MUST be present, and only one `c` tag per marker is allowed. |
| `title` | No       | Human-readable name for the theme                                                                                                                                                                                                               |
| `alt`   | Yes      | NIP-31 human-readable fallback                                                                                                                                                                                                                  |

### Client Behavior

- When visiting a profile, clients query `{ kinds: [11667], authors: [pubkey], limit: 1 }` to get the active theme.
- Clients read the three `c` tags to extract the background, text, and primary colors for the profile.
- Setting a new active theme publishes a new kind 11667 event (replacing the old one).
- To remove the active theme, publish a kind 5 deletion event targeting kind 11667.
