# Ditto Custom Event Kinds

## Buddy Identity (kind 30078)

Stores an AI buddy's identity as a [NIP-78](https://github.com/nostr-protocol/nips/blob/master/78.md) application-specific data event. The event is published by the logged-in user and encrypted to self using [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md).

### Event Structure

```json
{
  "kind": 30078,
  "content": "<NIP-44 encrypted JSON>",
  "tags": [
    ["d", "<appId>/buddy"],
    ["p", "<buddy-pubkey>"],
    ["alt", "Buddy identity for <appName>"]
  ]
}
```

### Encrypted Content

The `content` field is NIP-44 encrypted to the author's own pubkey. When decrypted, it contains a JSON object:

```json
{
  "nsec": "<bech32 nsec of the buddy's secret key>",
  "name": "<buddy display name>",
  "soul": "<buddy personality/behavior description>"
}
```

| Field  | Type   | Required | Description |
|--------|--------|----------|-------------|
| `nsec` | string | Yes      | Bech32-encoded secret key (`nsec1...`) for the buddy's Nostr identity |
| `name` | string | Yes      | Display name for the buddy |
| `soul` | string | Yes      | Personality description injected into the AI system prompt |

### Tags

| Tag   | Description |
|-------|-------------|
| `d`   | Identifier scoped to the app: `<appId>/buddy` (e.g. `ditto/buddy`) |
| `p`   | Public key derived from the buddy's secret key, for verification |
| `alt` | Human-readable description per [NIP-31](https://github.com/nostr-protocol/nips/blob/master/31.md) |

### Buddy Profile (kind 0)

When created, the buddy also gets a kind 0 profile event signed by its own keypair:

```json
{
  "kind": 0,
  "content": "{\"name\":\"<buddy-name>\",\"about\":\"AI buddy on <appName>\",\"bot\":true}",
  "tags": []
}
```

The `bot: true` field follows [NIP-24](https://github.com/nostr-protocol/nips/blob/master/24.md) extra metadata conventions.

### Security

- The buddy's secret key is cached in `localStorage` for fast access
- The relay-stored event serves as an encrypted backup for cross-device recovery
- Only the user who created the buddy can decrypt the content (NIP-44 self-encryption)
- The `authors` filter is always set to `[user.pubkey]` when querying, preventing spoofing
