# NIP: Custom Event Kinds

## Event Kinds Overview

| Kind  | Name                 | Description                                           |
|-------|----------------------|-------------------------------------------------------|
| 33891 | Theme Definition     | Shareable, named custom UI theme with colors          |
| 11667 | Active Profile Theme | The user's currently active theme (one per user)      |

---

## Kind 33891: Theme Definition

### Summary

Addressable event kind for publishing shareable custom UI themes. A single user may publish multiple themes, each identified by a unique `d` tag. Themes include a title, optional description, and a full set of HSL color tokens.

### Event Structure

```json
{
  "kind": 33891,
  "content": "{\"background\":\"228 20% 10%\",\"foreground\":\"210 40% 98%\",\"card\":\"228 20% 12%\",\"cardForeground\":\"210 40% 98%\",\"popover\":\"228 20% 12%\",\"popoverForeground\":\"210 40% 98%\",\"primary\":\"258 70% 60%\",\"primaryForeground\":\"0 0% 100%\",\"secondary\":\"228 16% 18%\",\"secondaryForeground\":\"210 40% 98%\",\"muted\":\"228 16% 18%\",\"mutedForeground\":\"215 20.2% 65.1%\",\"accent\":\"225 65% 55%\",\"accentForeground\":\"0 0% 100%\",\"destructive\":\"0 72% 51%\",\"destructiveForeground\":\"210 40% 98%\",\"border\":\"228 14% 20%\",\"input\":\"228 14% 20%\",\"ring\":\"258 70% 60%\"}",
  "tags": [
    ["d", "mk-dark-theme"],
    ["title", "MK Dark Theme"],
    ["description", "A sleek dark theme with purple and blue accents"],
    ["alt", "Custom theme: MK Dark Theme"],
    ["t", "theme"]
  ]
}
```

### Content

JSON object containing the full theme token set. Each value is an HSL color string in the format `"H S% L%"` (e.g. `"258 70% 60%"`).

**Required fields:** `background`, `foreground`, `primary`, `accent`

**Optional fields** (clients should derive these if missing): `card`, `cardForeground`, `popover`, `popoverForeground`, `primaryForeground`, `secondary`, `secondaryForeground`, `muted`, `mutedForeground`, `accentForeground`, `destructive`, `destructiveForeground`, `border`, `input`, `ring`

### Tags

| Tag           | Required | Description                                              |
|---------------|----------|----------------------------------------------------------|
| `d`           | Yes      | Unique identifier (slug) for this theme, e.g. `"mk-dark-theme"` |
| `title`       | Yes      | Human-readable theme name                                |
| `description` | No       | Brief description of the theme                           |
| `alt`         | Yes      | NIP-31 human-readable fallback                           |
| `t`           | Yes      | Set to `"theme"` for discoverability                     |

### Multiple Themes Per User

Since kind 33891 is addressable, a user can publish multiple themes by using different `d` tag values. Publishing a new event with the same `d` tag replaces the previous version (this is how editing works).

---

## Kind 11667: Active Profile Theme

### Summary

Replaceable event that represents the user's currently active profile theme. Only one per user. When other users visit a profile, they query this kind to determine what theme to display.

The content is a **copy** of the theme tokens from whichever theme definition (the user's own or someone else's) they have set as active. An `a` tag references the source theme definition for attribution.

### Event Structure

```json
{
  "kind": 11667,
  "content": "{\"background\":\"228 20% 10%\",\"foreground\":\"210 40% 98%\",...}",
  "tags": [
    ["a", "33891:<source-author-pubkey>:<source-d-tag>"],
    ["alt", "Active profile theme"]
  ]
}
```

### Content

Same JSON format as kind 33891 — a full set of HSL theme tokens.

### Tags

| Tag   | Required | Description                                                     |
|-------|----------|-----------------------------------------------------------------|
| `a`   | No       | Reference to the source kind 33891 event (`kind:pubkey:d-tag`). Allows attribution ("Using X's theme"). |
| `alt`  | Yes      | NIP-31 human-readable fallback                                  |

### Client Behavior

- When visiting a profile, clients query `{ kinds: [11667], authors: [pubkey], limit: 1 }` to get the active theme.
- The `a` tag lets clients display attribution: "Using MK Dark Theme by @mk" with a link to the source theme.
- Setting a new active theme publishes a new kind 11667 event (replacing the old one).
- To remove the active theme, publish a kind 5 deletion event targeting kind 11667.
