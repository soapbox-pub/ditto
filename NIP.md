# NIP: Custom Event Kinds

## Event Kinds Overview

| Kind  | Name          | Description                                      |
|-------|---------------|--------------------------------------------------|
| 30203 | Profile Theme | Profile appearance and color configuration       |

---

## Kind 30203: Profile Theme

### Summary

Addressable event kind allowing users to customize their profile appearance with colors and typography. Compatible with the [Yourspace specification](https://gitlab.com/soapbox-pub/yourspace/-/blob/main/NIP.md).

### Event Structure

```json
{
  "kind": 30203,
  "content": "{\"preset\":\"custom\",\"primaryColor\":\"#7c3aed\",\"accentColor\":\"#7c3aed\",\"backgroundColor\":\"#141727\",\"textColor\":\"#e5e9f0\",\"borderRadius\":\"12\",\"fontFamily\":\"Inter\",\"fontSize\":\"14\",\"effects\":{\"particleEffect\":\"none\",\"particleIntensity\":0,\"particleColor\":\"#7c3aed\",\"hoverAnimation\":\"none\",\"entranceAnimation\":\"none\",\"clickEffect\":\"none\",\"cursorTrail\":\"none\",\"cursorEmoji\":\"\"}}",
  "tags": [
    ["d", "profile-theme"],
    ["alt", "Profile theme configuration"]
  ]
}
```

### Content Fields

- **`preset`**: Theme preset name (e.g. "custom", "modern")
- **`primaryColor`** (required): Primary color in hex format (#RRGGBB)
- **`accentColor`** (required): Accent color in hex format (#RRGGBB)
- **`backgroundColor`** (required): Background color in hex format (#RRGGBB)
- **`textColor`** (required): Text color in hex format (#RRGGBB)
- **`borderRadius`**: Border radius in pixels (as string)
- **`fontFamily`**: Font family name
- **`fontSize`**: Font size in pixels (as string)
- **`effects`**: Visual effects configuration (optional, not currently implemented by this client)

### Tags

- **`d`** (required): Set to `"profile-theme"`
- **`alt`** (recommended): Human-readable description per NIP-31

### Client Behavior

This client internally uses a 28-token HSL color system for full UI theming. When importing Yourspace themes from other clients, the 4 core colors (primary, accent, background, text) are mapped to the full token set using intelligent derivation based on background luminance. When publishing, the internal tokens are exported to the Yourspace hex color format for interoperability.

### Interoperability

Events published by this client are fully compatible with Yourspace and other clients implementing kind 30203. Effects fields are published with `"none"` defaults since this client focuses on color theming only.
