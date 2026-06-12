# NIP: Custom Event Kinds

## Event Kinds Overview

### Ditto Kinds

| Kind  | Name                 | Description                                           |
|-------|----------------------|-------------------------------------------------------|
| 8333  | Onchain Zap          | Attestation that an on-chain BTC tx paid a target     |
| 15683 | Love List            | The people the user truly loves (one per user)        |
| 36767 | Theme Definition     | Shareable, named custom UI theme                      |
| 16767 | Active Profile Theme | The user's currently active theme (one per user)      |
| 16769 | Profile Tabs         | The user's custom profile page tabs (one per user)    |

### Community Kinds

These event kinds were created by community contributors and are supported by Ditto. Full specifications are maintained by their respective authors.

| Kind  | Name                   | Description                                                      | Spec                                                                                      |
|-------|------------------------|------------------------------------------------------------------|-------------------------------------------------------------------------------------------|
| 2473  | Bird Detection         | Bird-by-ear observation log (species heard in the wild)          | [NIP](https://gitlab.com/alexgleason/birdstar/-/blob/main/NIP.md)                         |
| 12473 | Birdex                 | Author's cumulative life list of confirmed bird species          | [NIP](https://gitlab.com/alexgleason/birdstar/-/blob/main/NIP.md)                         |
| 3367  | Color Moment           | Color palette post expressing a mood                             | [NIP](https://gitlab.com/chad.curtis/espy/-/blob/main/NIP.md)                            |
| 4223  | Weather Reading        | Sensor readings from a weather station                           | [Draft NIP](https://github.com/nostr-protocol/nips/pull/2163)                            |
| 7516  | Found Log              | Log entry recording a user finding a geocache                    | [NIP-GC](https://gitlab.com/chad.curtis/treasures/-/blob/main/NIP-GC.md)                 |
| 8211  | Encrypted Letter       | Encrypted personal letter with visual stationery                 | [NIP](https://gitlab.com/chad.curtis/lief/-/blob/main/NIP.md)                            |
| 1124  | Blobbi Social Interaction | Immutable interaction log for Blobbi social interactions       | See [Blobbi Social Interaction](#kind-1124-blobbi-social-interaction) below                |
| 10133 | Payment Targets        | Donation endpoints (Bitcoin, Lightning, Monero, …) per RFC-8905 | [NIP-A3](https://github.com/ATXMJ/nips/blob/main/A3.md); see [Kind 10133](#kind-10133-payment-targets-nip-a3) below |
| 11125 | Blobbonaut Profile     | Owner profile with coins, achievements, and inventory            | [NIP-BB](https://github.com/Danidfra/nostr-pet/blob/production/NIP.md)                   |
| 14919 | Blobbi Interaction     | Individual pet interaction (feed, play, clean, etc.)             | [NIP-BB](https://github.com/Danidfra/nostr-pet/blob/production/NIP.md)                   |
| 14920 | Blobbi Breeding        | Breeding event between two adult Blobbis                         | [NIP-BB](https://github.com/Danidfra/nostr-pet/blob/production/NIP.md)                   |
| 14921 | Blobbi Record          | Immutable lifecycle record (birth, evolution, adoption)          | [NIP-BB](https://github.com/Danidfra/nostr-pet/blob/production/NIP.md)                   |
| 16158 | Weather Station        | Weather station metadata (location, sensors, connectivity)       | [Draft NIP](https://github.com/nostr-protocol/nips/pull/2163)                            |
| 31124 | Blobbi Pet State       | Current state of a virtual Blobbi pet (addressable)              | [NIP-BB](https://github.com/Danidfra/nostr-pet/blob/production/NIP.md)                   |
| 33863 | Fundraiser             | Self-authored Bitcoin fundraising campaign                       | See [Kind 33863: Fundraiser](#kind-33863-fundraiser) below                                |
| 37516 | Geocache               | Geocache listing for real-world treasure hunting                 | [NIP-GC](https://gitlab.com/chad.curtis/treasures/-/blob/main/NIP-GC.md)                 |
| 36787 | Music Track            | Addressable event for a music audio file with metadata           | See [Music Tracks & Playlists](#music-tracks--playlists) below                            |
| 34139 | Music Playlist         | Ordered list of music track references (also used for albums)    | See [Music Tracks & Playlists](#music-tracks--playlists) below                            |
| 30621 | Custom Constellation   | User-drawn star figure with Hipparcos-numbered edges             | [NIP](https://gitlab.com/alexgleason/birdstar/-/blob/main/NIP.md)                         |

---

## Kind 8333: Onchain Zap

### Summary

Regular event kind that records a **Bitcoin on-chain payment** ("onchain zap") sent in appreciation of a Nostr event or profile. Functions as the on-chain analogue of NIP-57 zap receipts (kind 9735), but without the LNURL round-trip: the event is self-attested by the sender and references a real Bitcoin transaction that clients can verify directly on-chain.

The kind number mirrors the convention of NIP-57: kind **9735** is the Lightning P2P port (per BOLT spec), and kind **8333** is the Bitcoin mainnet P2P port — a natural semantic pairing for Lightning vs. on-chain settlement.

Because every Nostr keypair deterministically maps to a Bitcoin Taproot (P2TR) address (both use 32-byte x-only secp256k1 keys, per BIP-340/BIP-341), an on-chain zap is simply a Bitcoin transaction whose output pays the recipient's derived Taproot address. The kind 8333 event links that transaction to the Nostr event or profile being zapped.

### Event Structure

Single-recipient zap (the common case — tipping a post or profile):

```json
{
  "kind": 8333,
  "pubkey": "<sender-pubkey>",
  "content": "Great post!",
  "tags": [
    ["i", "bitcoin:tx:<txid>"],
    ["p", "<recipient-pubkey>"],
    ["amount", "<sats>"],
    ["e", "<target-event-id>", "<relay-hint>"],
    ["alt", "Onchain zap: 25000 sats"]
  ]
}
```

Multi-recipient zap — one Bitcoin transaction paying multiple recipients in a single batch (e.g. "zap all members of a follow set"):

```json
{
  "kind": 8333,
  "pubkey": "<sender-pubkey>",
  "content": "Great list!",
  "tags": [
    ["i", "bitcoin:tx:<txid>"],
    ["p", "<recipient-1-pubkey>"],
    ["p", "<recipient-2-pubkey>"],
    ["p", "<recipient-3-pubkey>"],
    ["amount", "<total-sats-paid-to-all-recipients>"],
    ["a", "30000:<author>:<d-tag>"],
    ["alt", "Onchain zap: 75000 sats across 3 recipients"]
  ]
}
```

### Content

The `content` field is a human-readable comment from the sender (may be empty). It is NOT a zap request JSON (unlike NIP-57 kind 9735).

### Tags

| Tag      | Required | Description                                                                                  |
|----------|----------|----------------------------------------------------------------------------------------------|
| `i`      | Yes      | NIP-73 external content identifier. MUST be `bitcoin:tx:<txid>` where `<txid>` is a 64-char lowercase hex Bitcoin transaction ID. |
| `p`      | Yes (≥1) | 32-byte hex pubkey of a zap **recipient**. A single event MAY include multiple `p` tags when the transaction has one output per recipient (multi-recipient form). Each `p` tag MUST correspond to at least one tx output paying that recipient's derived Taproot address. |
| `amount` | Yes      | **Total** amount paid in satoshis (decimal integer). This is the sum of outputs in the tx paying the derived Taproot addresses of **all** listed `p` recipients combined — *not* the total tx value. The sender's change output MUST NOT be included. For single-recipient events this is simply the amount paid to that one recipient. |
| `e`      | If zapping an event | 32-byte hex ID of the event being zapped. Include a relay hint as the 3rd element where possible. |
| `a`      | If zapping an addressable event | Addressable event coordinate `<kind>:<pubkey>:<d-tag>`. Used instead of (or alongside) `e` for kinds 30000–39999. |
| `k`      | No       | The stringified `kind` of the target event, mirroring NIP-57.                                |
| `alt`    | Yes      | NIP-31 human-readable fallback.                                                              |

If neither `e` nor `a` is present, the zap targets the recipients' **profiles** (i.e. a tip to the pubkey(s), not to a specific event).

Per-recipient amounts are not encoded in the event. Clients that need them (e.g. attributing a multi-recipient donation to one recipient's profile zap history) recompute them from the on-chain transaction by matching each recipient's derived Taproot address against the tx outputs.

### Publishing Flow

1. Sender builds a Bitcoin transaction paying each recipient's derived Taproot address (`nostrPubkeyToBitcoinAddress(recipientPubkey)`). A single-recipient zap has one recipient output; a multi-recipient batch zap has one output per recipient.
2. Sender broadcasts the transaction to the Bitcoin network and obtains the `txid`.
3. Sender signs and publishes a kind 8333 event referencing that `txid` with the appropriate `e`/`a`/`p` tags. For batch zaps, every recipient gets its own `p` tag in the single event.
4. The event is published **after** broadcast; the txid is already final at that point.

### Client Behavior

**Querying onchain zaps for an event:**

```json
{ "kinds": [8333], "#e": ["<target-event-id>"], "limit": 100 }
```

For addressable events, use `"#a": ["<kind>:<pubkey>:<d-tag>"]` instead. For profile-level zaps, use `"#p": ["<pubkey>"]` — this matches both single-recipient events tagging that user and multi-recipient events where the user is one of several recipients.

**Verification (REQUIRED before trusting amounts):**

Clients MUST verify a kind 8333 event on-chain before counting it toward a zap total or displaying its amount. The `amount` tag is self-reported by the sender and would otherwise be trivially spoofable. To verify:

1. Extract the txid from the `i` tag.
2. Fetch the transaction from a Bitcoin data source (e.g. a mempool.space-compatible Esplora API).
3. For each `p` tag, derive the recipient's expected Taproot address from the pubkey.
4. Sum the values of all outputs in the transaction that pay **any** of the listed recipients' derived addresses. This is the **verified amount**. Change outputs paying back to the **sender's** derived Taproot address MUST NOT be counted toward the verified amount.
5. If the verified amount is 0 (none of the listed recipients received anything on-chain), the event SHOULD be discarded.
6. If the sender's `amount` tag exceeds the verified amount, clients MAY discard the event or MAY display the smaller verified amount (capping). Clients MUST NOT display or count the claimed amount when it exceeds the verified amount.
7. Unconfirmed transactions MAY be displayed as pending; clients MAY require confirmation before counting them toward public totals. Because unconfirmed transactions can be evicted (RBF, double-spend), clients SHOULD either exclude them from aggregate zap totals or clearly label them as pending.

When a client needs to attribute a multi-recipient event to one specific recipient (e.g. rendering a profile zap-history entry), it MAY sum only the tx outputs paying that one recipient's derived Taproot address. Per-recipient amounts are recomputed from the transaction at display time.

**Sender/recipient identity:** Clients SHOULD reject events where the sender's pubkey (`event.pubkey`) appears in **any** `p` tag. Self-zaps are trivial to fabricate (the sender already controls the destination address) and contribute nothing meaningful to zap totals.

**Deduplication:** Clients SHOULD deduplicate events that reference the same `txid` (an attacker could publish many events pointing at one real transaction). One kind 8333 event per (txid, target) pair is canonical — when multiple events reference the same `txid` for the same target, the earliest is preferred.

**Network scope:** This specification applies to Bitcoin **mainnet** only. Testnet, signet, and other networks are out of scope; addresses and txids on those networks MUST NOT be used in kind 8333 events.

### Comparison with NIP-57 (Lightning Zaps)

| Aspect | NIP-57 (kind 9735) | This spec (kind 8333) |
|--------|---------------------|------------------------|
| Settlement | Lightning Network | Bitcoin L1 |
| Invoice / payment | LNURL + BOLT-11 invoice | Raw Bitcoin tx |
| Event issuer | Recipient's LNURL provider | Sender |
| Availability | Requires `lud06`/`lud16` on recipient profile | Always available (every Nostr pubkey has a derived Taproot addr) |
| Verification | Recipient zap-provider pubkey + bolt11 amount | On-chain tx verified against derived recipient address |
| Finality | Instant | Confirms in ~10 min (mempool first) |
| Fees | Sub-satoshi typical | Significant at low amounts |

The two zap kinds are complementary. Clients SHOULD sum verified amounts from both kinds when displaying total zap stats for a post or profile.

---

## Kind 15683: Love List

### Summary

Replaceable event listing the people the user **truly loves** — a tier above an ordinary follow. Structured exactly like a NIP-51 standard people list (`p` tags), with one list per user (latest event wins).

The kind number spells **"1·LOVE"**: on a phone keypad L=5, O=6, V=8, E=3 → `5683`, with a leading `1` to land in the replaceable range (10000–19999) — *One Love*.

### Event Structure

```json
{
  "kind": 15683,
  "pubkey": "<author-pubkey>",
  "content": "",
  "tags": [
    ["p", "<loved-pubkey-1>"],
    ["p", "<loved-pubkey-2>"],
    ["alt", "Love list: the people this user truly loves"]
  ]
}
```

### Tags

| Tag   | Required | Description                                                          |
|-------|----------|----------------------------------------------------------------------|
| `p`   | Yes (≥0) | 32-byte hex pubkey of a loved person. Per NIP-51, new entries are appended to the end so the list stays in chronological order of being added. |
| `alt` | Yes      | NIP-31 human-readable fallback.                                      |

### Content

Empty by convention. Clients MAY use the NIP-51 private-items scheme (NIP-44-encrypted stringified tag array) for loves the user prefers to keep private; Ditto currently publishes public entries only and ignores ciphertext it cannot decrypt.

### Client Behavior

- **Feed priority:** people on the viewer's Love List get a dedicated **Loved** feed tab, placed before the Follows tab. The tab shows posts (and reposts/reactions/zaps) from loved people only — including people the viewer doesn't follow.
- **Updates as content:** a kind 15683 event itself renders in feeds as a "love letter" card listing the loved people (avatar + name per `p` tag).
- **Mutations** MUST follow read-modify-write: fetch the freshest kind 15683 for the author, rebuild the `p` tags, preserve unknown tags and `content`, and republish.
- Clients SHOULD hide kind 15683 events with zero `p` tags (an emptied list has nothing to display).

---

## Kind 10133: Payment Targets (NIP-A3)

**Author:** ATXMJ
**Spec:** https://github.com/ATXMJ/nips/blob/main/A3.md

### Summary

Replaceable event (one per user) that declares a user's donation endpoints — "payment targets" — as `(type, authority)` pairs in `payto` tags, following the [RFC-8905 `payto:` URI scheme](https://www.rfc-editor.org/rfc/rfc8905.html). In Ditto's UI this is surfaced as the **"Accept Donations"** section of the Edit Profile screen; the term *payment targets* is used only in code.

### Event Structure

```json
{
  "kind": 10133,
  "pubkey": "<user-pubkey>",
  "content": "",
  "tags": [
    ["payto", "bitcoin", "bc1qxq66e0t8d7ugdecwnmv58e90tpry23nc84pg9k"],
    ["payto", "lightning", "user@walletofsatoshi.com"],
    ["payto", "monero", "4..."],
    ["alt", "Payment targets"]
  ]
}
```

### Tags

| Tag     | Required | Description                                                                                  |
|---------|----------|----------------------------------------------------------------------------------------------|
| `payto` | Yes (≥1) | `["payto", "<type>", "<authority>", …]`. Element 1 is the lowercase payment type, element 2 the address/handle/lightning address. Elements beyond index 2 are reserved per RFC-8905 and ignored. |
| `alt`   | Recommended | NIP-31 human-readable fallback.                                                           |

`type` is case-insensitive and normalized to lowercase. `authority` format is payment-system-specific.

### Ditto Implementation Notes

Ditto restricts the **editable** set to a curated allowlist of recognized types and renders only those it recognizes (forward-compatible: unknown types in a fetched event are ignored, not rendered as garbage):

| Type       | Label      | Kind in Ditto | Clickable URI                         |
|------------|------------|---------------|----------------------------------------|
| `bitcoin`  | Bitcoin    | native        | n/a (uses the built-in send flow)      |
| `lightning`| Lightning  | native        | n/a (uses the built-in zap flow)       |
| `monero`   | Monero     | generic       | `monero:<address>`                     |
| `ethereum` | Ethereum   | generic       | `ethereum:<address>`                   |
| `nano`     | Nano       | generic       | `nano:<address>`                       |
| `cashme`   | Cash App   | generic       | `https://cash.app/$<handle>`           |
| `venmo`    | Venmo      | generic       | `https://venmo.com/u/<handle>`         |
| `revolut`  | Revolut    | generic       | `https://revolut.me/<handle>`          |

Rules Ditto enforces:

- **At most one target per type.** When parsing, the first valid target of each type wins; the editor enforces uniqueness on save.
- **Validation per type** — each authority is validated (bech32(m)/SP checksum for Bitcoin, lightning-address/LNURL shape for Lightning, base58 for Monero, etc.). Invalid entries are dropped on parse and rejected in the editor.
- **Precedence over derived/kind-0 values.** A `bitcoin` payment target overrides the recipient's pubkey-derived Taproot address in the zap flow; a `lightning` payment target takes precedence over the kind-0 `lud16`/`lud06`.
- **Bitcoin target rail.** A `bc1q…`/`bc1p…` Bitcoin target sends on-chain and still publishes a kind 8333 attribution. An `sp1…` (BIP-352 silent payment) Bitcoin target sends on the silent-payment rail and publishes **no** kind 8333 event, preserving unlinkability.
- **Native vs. generic rendering.** Bitcoin and Lightning reuse Ditto's existing purpose-built flows (no extra clickable button). Generic methods render a QR code, a copyable address, and a button that opens the **native URI** (preferred over `payto:` per the user's request) — falling back to the method's web payment page for custodial handles.
- **Zap dialog switcher.** When a recipient has more than one available method, the zap dialog's title becomes a dropdown switcher (Bitcoin icon + down chevron) for choosing between Bitcoin, Lightning, and any declared payment targets.

Ditto does **not** generate or render `payto://` URIs; it prefers each method's native scheme.

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

### Color Moments (Kind 3367)

**Author:** Chad Curtis
**Spec:** https://gitlab.com/chad.curtis/espy/-/blob/main/NIP.md
**App:** https://espy.you

Color palette posts capturing 3-6 colors from a beautiful moment, optionally accompanied by an emoji and layout preference. Supports horizontal, vertical, grid, star, checkerboard, and diagonal stripe layouts. A form of pre-verbal visual communication through color and emotion.

### Birdstar (Kinds 2473, 12473, 30621)

**Author:** Alex Gleason
**Spec:** https://gitlab.com/alexgleason/birdstar/-/blob/main/NIP.md
**App:** https://birdstar.app

Birdstar merges Birdsong Spotter (a bird-by-ear checklist) and Starpoint (an interactive sky map with community constellations) into a single client.

- **Kind 2473 — Bird Detection.** A regular event representing a single identified bird observation. The species is identified by a NIP-73 `i`/`k` pair pointing at the species' Wikidata entity URI (e.g. `https://www.wikidata.org/entity/Q26825` for the American Robin). The `content` field holds an optional freeform human note about the detection. Required tags: NIP-31 `alt`, NIP-73 `i` (Wikidata URL) + `k` (`web`). Ditto renders detections as a species card with the Wikipedia thumbnail, common/scientific name, and article summary.
- **Kind 12473 — Birdex.** A replaceable event (one per author) indexing every distinct species the author has ever confirmed via kind 2473. Each species is a positional `i`/`n` pair — the Wikidata entity URI followed immediately by the scientific binomial name — emitted in chronological order of first detection. Ditto renders a Birdex as a tiled grid of species, each tile showing the Wikipedia thumbnail with the common name overlaid. In feeds, only the most recent few tiles are shown with a "+N" capstone mirroring how kind 3 follow lists preview members; the post-detail page shows every species.
- **Kind 30621 — Custom Constellation.** An addressable event (`d` tag) representing a single user-drawn star figure. Each `edge` tag (`["edge", from, to]`) references two Hipparcos catalog numbers as decimal strings — e.g. `["edge", "32349", "37279"]` for Sirius → Procyon. Required tags: `d`, `title`, `alt`, and at least one valid `edge`. The `content` field is a freeform description. Ditto renders constellations as a stylized SVG star-map (gnomonically projected onto a tangent plane at the figure's centroid, with stars sized by magnitude) using a bundled Hipparcos catalog that is code-split so the data only loads when a constellation is actually viewed.

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

#### Kind 11125 `content` JSON — `missions` field

The `content` of kind 11125 is a JSON object. Ditto extends it with a `missions` field that tracks daily and evolution mission progress:

```jsonc
{
  "missions": {
    "date": "2026-04-16",       // ISO date string for the current daily mission set
    "daily": [ /* Mission[] */ ],
    "evolution": [ /* Mission[] — active hatch/evolve tasks, cleared on stage transition */ ],
    "rerolls": 2                // remaining daily mission rerolls
  }
  // ...other profile fields (coins, achievements, inventory, etc.)
}
```

Each `Mission` is either a **TallyMission** (`{ id, target, count }`) or an **EventMission** (`{ id, target, events: string[] }`) where `events` contains Nostr event IDs that satisfy the mission. Evolution missions are populated when incubation or evolution begins and cleared when the stage transition completes or is cancelled.

#### Kind 11125 `content` JSON — `room_layouts` field

The `content` of kind 11125 MAY include a `room_layouts` field for per-room visual customization:

```json
{
  "room_layouts": {
    "v": 1,
    "by_room": {
      "home": {
        "wall": {
          "style": "stripes",
          "palette": ["#2a1f4e", "#3d2d6b"],
          "variant": "narrow",
          "angle": 45
        },
        "floor": {
          "style": "wood",
          "palette": ["#8b5e3c", "#6b4226"],
          "variant": "medium"
        }
      }
    }
  }
}
```

**Top-level shape:**

| Field     | Type | Description |
|-----------|------|-------------|
| `v`       | `1`  | Schema version. MUST be `1`. |
| `by_room` | `Partial<Record<BlobbiRoomId, RoomLayout>>` | Per-room layouts keyed by room ID. |

**`RoomLayout` shape:** `{ wall: RoomSurfaceLayout, floor: RoomSurfaceLayout }`

**`RoomSurfaceLayout` fields:**

| Field     | Required | Description |
|-----------|----------|-------------|
| `style`   | Yes      | Surface style. Walls: `solid`, `stripes`, `dots`, `gradient`. Floors: `solid`, `wood`, `tile`, `carpet`. |
| `palette` | Yes      | Array of 1–4 hex colors. |
| `variant` | No       | One of: `soft`, `medium`, `bold`, `wide`, `narrow`. |
| `angle`   | No       | Pattern rotation in degrees, normalized to 0–359. |

**Hex color validation:** Colors MUST match `/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/` (3, 6, or 8 hex digits with a leading `#`).

**Angle validation:** Angles MUST be finite numbers. Clients normalize by rounding and wrapping into 0–359: `((Math.round(angle) % 360) + 360) % 360`.

**Parser behavior:** Unrecognized room IDs are skipped. Surfaces with an invalid `style` or `palette` cause the entire room entry to be discarded. Invalid `variant` or `angle` values are ignored (treated as absent). The parser never throws — malformed data falls back to defaults. If `v` is not `1`, the entire `room_layouts` object is ignored.

Clients MUST fall back to built-in defaults for any room without a valid layout entry.

#### Kind 11125 `content` JSON — `room_furniture` field

The `content` of kind 11125 MAY include a `room_furniture` field for per-room decorative furniture placements:

```json
{
  "room_furniture": {
    "v": 1,
    "by_room": {
      "home": [
        { "id": "official:plant-small", "x": 0.85, "y": 0.72, "layer": "front", "scale": 0.9 },
        { "id": "official:clock-wall", "x": 0.5, "y": 0.18, "layer": "back" },
        { "id": "official:picture-frame", "x": 0.3, "y": 0.3, "layer": "back", "content": { "imageUrl": "https://cdn.example.com/photo.jpg" } }
      ]
    }
  }
}
```

**Top-level shape:**

| Field     | Type | Description |
|-----------|------|-------------|
| `v`       | `1`  | Schema version. MUST be `1`. |
| `by_room` | `Partial<Record<BlobbiRoomId, FurniturePlacement[]>>` | Per-room placement arrays keyed by room ID. |

**`FurniturePlacement` fields:**

| Field     | Required | Description |
|-----------|----------|-------------|
| `id`      | Yes      | Namespaced furniture ID. MUST match `/^[a-z][a-z0-9]*:[a-z][a-z0-9-]*$/` (e.g. `official:plant-small`). |
| `x`       | Yes      | Horizontal position, normalized 0–1 (0 = left edge, 1 = right edge). Clamped to [0, 1]. |
| `y`       | Yes      | Vertical position, normalized 0–1 (0 = top of room, 1 = bottom). Clamped to [0, 1]. |
| `layer`   | Yes      | Rendering layer: `back` (wall-mounted), `floor` (behind Blobbi), or `front` (in front of Blobbi). |
| `scale`   | No       | Size multiplier. Clamped to [0.5, 2.0]. Default `1`. |
| `flip`    | No       | Horizontal mirror. Boolean. Default `false`. |
| `variant` | No       | Named variant string (1–32 chars), validated against the item's definition at render time. |
| `content` | No       | Dynamic per-instance content. See below. |

**`FurnitureContent` fields:**

| Field      | Required | Description |
|------------|----------|-------------|
| `imageUrl` | No       | Image URL for picture frames. MUST be a valid `https:` URL; non-https URLs are rejected. |

**Per-room cap:** A maximum of 20 placements per room is enforced. Excess items beyond the cap are dropped (first 20 kept).

**Parser behavior:** Unrecognized room IDs are skipped. Items with an invalid `id`, non-finite `x`/`y`, or unrecognized `layer` are silently dropped. Invalid optional fields (`scale`, `flip`, `variant`, `content`) are ignored (treated as absent). `imageUrl` values that are not valid `https:` URLs are rejected. The parser never throws — malformed data falls back to defaults. If `v` is not `1`, the entire `room_furniture` object is ignored.

Clients MUST fall back to built-in defaults for any room without a valid furniture entry.

#### Kind 1124: Blobbi Social Interaction

Immutable, regular (non-replaceable) event that logs a single interaction with a Blobbi. These events form an append-only interaction log. They do **not** directly mutate the canonical kind 31124 state — the owner's client consolidates pending interactions into canonical stats via a checkpoint-based system.

**Event structure:**

```json
{
  "kind": 1124,
  "content": "",
  "tags": [
    ["a", "31124:<owner-pubkey>:<blobbi-d-tag>"],
    ["p", "<owner-pubkey>"],
    ["action", "feed"],
    ["source", "blobbi-page"],
    ["blobbi", "<short-id>"],
    ["item", "<item-id>"],
    ["alt", "Blobbi interaction: feed"]
  ]
}
```

**Content:** Empty string (`""`).

**Required tags:**

| Tag      | Description                                                                     |
|----------|---------------------------------------------------------------------------------|
| `a`      | Coordinate of the target Blobbi: `31124:<owner-pubkey>:<blobbi-d-tag>`          |
| `p`      | Owner pubkey of the target Blobbi                                               |
| `action` | Interaction action. Values: `feed`, `play`, `clean`, `medicate`, `boost`        |
| `source` | UI surface that originated the interaction (e.g. `blobbi-page`, `companion`)    |

**Optional tags:**

| Tag      | Description                                                        |
|----------|--------------------------------------------------------------------|
| `blobbi` | Short Blobbi identifier (10-hex petId extracted from canonical d-tag) |
| `item`   | Shop item ID used in the interaction, when applicable              |
| `client` | Client identifier (added automatically by the publishing hook)     |

**Action values:**

| Action     | Description                              |
|------------|------------------------------------------|
| `feed`     | Feeding the Blobbi                       |
| `play`     | Playing with the Blobbi (includes music and singing) |
| `clean`    | Cleaning the Blobbi                      |
| `medicate` | Administering medicine to the Blobbi     |
| `boost`    | Recharging the Blobbi's energy           |

The `pet` action is reserved for a future version.

**Processing model:**

- Events are processed in ascending `created_at` order with event `id` (hex string comparison) as tie-breaker
- Cooldown, dedup, and clamping logic live in the projection layer, not at publish time
- Clients MUST apply a bounded recency window (6 hours) when querying kind 1124 events, regardless of checkpoint state. If a valid checkpoint `processed_until` is more recent than the window floor, clients use the checkpoint as the `since` bound instead. Interactions older than the recency window are considered stale and MUST NOT be projected onto current stats.
- Owner consolidation writes processed stats back to kind 31124 and advances the checkpoint (stored in the event's `content` JSON). This happens automatically when the owner opens the dashboard.
- After consolidation, kind 1124 events remain available as history but MUST NOT be re-applied to canonical stats. The checkpoint's `last_event_id` and `processed_until` fields delineate the boundary.

---

## Kind 33863: Fundraiser

**Author:** Agora
**App:** https://agora.spot

### Summary

Addressable event representing a **self-authored fundraising campaign**. A campaign carries marketing-style metadata (title, summary, banner image, markdown story, optional goal, optional deadline, optional country) and one or two Bitcoin wallet endpoints declared in `w` tags. Each wallet endpoint is either a public on-chain bech32(m) address (`bc1q…`, `bc1p…`) or a silent-payment code (`sp1…`, per BIP-352). The mode of each endpoint is inferred from the prefix — the client renders a QR code that combines the present endpoints and adjusts the donation-progress UI accordingly. A campaign MAY declare **at most one** endpoint per mode (at most one on-chain address and at most one silent-payment code).

The author of the event is also the beneficiary. Campaigns are never authored on behalf of someone else; the event creator owns the wallet declared in `w` and receives the donations. To stop accepting donations, the creator publishes a NIP-09 kind 5 deletion request referencing the campaign's `a` coordinate.

The kind is addressable so the creator can edit the story, banner, goal, deadline, and wallet over the life of the campaign without minting new identifiers. The `d` tag is the campaign's slug.

### Event Structure

```json
{
  "kind": 33863,
  "pubkey": "<creator-pubkey>",
  "content": "<markdown story>",
  "tags": [
    ["d", "save-the-last-bookstore"],

    ["title", "Save the Last Bookstore"],
    ["summary", "Help our 40-year-old neighborhood bookstore make rent through winter."],
    ["banner", "https://blossom.example/abc123.jpg"],
    ["imeta",
      "url https://blossom.example/abc123.jpg",
      "m image/jpeg",
      "x abc123def456...",
      "dim 1600x900",
      "blurhash LKO2?U%2Tw=w]~RBVZRi};RPxuwH",
      "alt Storefront of the Last Bookstore at dusk"
    ],
    ["alt", "Fundraising campaign: Save the Last Bookstore"],

    ["w", "bc1p7w2k3xq9...xyz"],
    ["w", "sp1qq...verylongsilentpaymentcode..."],

    ["goal", "25000"],
    ["deadline", "1735689600"],

    ["i", "iso3166:US"],
    ["k", "iso3166"],
    ["t", "legal-defense"],
    ["t", "mutual-aid"]
  ]
}
```

A silent-payment-only campaign omits the `bc1…` `w` tag and carries only the `sp1…`:

```json
["w", "sp1qq...verylongsilentpaymentcode..."]
```

An on-chain-only campaign omits the `sp1…` `w` tag and carries only the `bc1…`:

```json
["w", "bc1p7w2k3xq9...xyz"]
```

### Content

The `content` field is the **campaign story**, formatted as Markdown. Clients SHOULD render it with the same Markdown renderer they use for NIP-23 long-form content. Empty content is permitted (e.g. for a campaign that lives entirely in its summary).

### Tags

| Tag       | Required | Description                                                                                                                                                                                                                  |
|-----------|----------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `d`       | Yes      | Campaign slug, unique per author. Forms the addressable coordinate `33863:<pubkey>:<d>`.                                                                                                                                     |
| `title`   | Yes      | Display title of the campaign (plain text, max ~200 chars).                                                                                                                                                                  |
| `w`       | Yes      | Bitcoin wallet endpoint. The 2nd element is a single bech32(m) string: a mainnet on-chain address starting with `bc1q` (P2WPKH/P2WSH) or `bc1p` (P2TR), **or** a silent-payment code starting with `sp1` per BIP-352. A campaign MUST carry at least one `w` tag and MAY carry up to two — at most one per mode (on-chain and silent payment). |
| `summary` | Recommended | Short one-paragraph tagline shown in feed cards and previews.                                                                                                                                                              |
| `banner`  | Recommended | HTTPS URL of the wide banner image. Clients MUST sanitize the URL before rendering, and SHOULD pair the URL with a NIP-92 `imeta` tag for dimensions, blurhash, MIME type, and SHA-256.                                    |
| `imeta`   | Recommended | NIP-92 media metadata for the banner. The first `url <value>` pair MUST match the `banner` URL; clients SHOULD ignore an `imeta` whose URL does not match.                                                                  |
| `goal`    | Optional | Fundraising goal in **integer US Dollars** (no unit suffix, no decimals). Clients MAY display an estimated sat-equivalent at view time using a live exchange rate.                                                          |
| `deadline`| Optional | Unix timestamp (seconds) at which the campaign closes for new donations. After the deadline, clients SHOULD show the campaign as ended but MAY still accept donations.                                                       |
| `i`       | Recommended | NIP-73 country identifier. SHOULD be `iso3166:<code>` with an uppercase ISO 3166-1 alpha-2 country code (e.g. `iso3166:VE`).                                                                                          |
| `k`       | Recommended if `i` is present | NIP-73 external content kind. For country identifiers this SHOULD be `iso3166`.                                                                                                              |
| `t`       | Optional | User-entered discovery/category tags such as `legal-defense` or `mutual-aid`. Agora additionally tags every campaign with `t:agora` as its app marker. |
| `alt`     | Recommended | NIP-31 human-readable fallback.                                                                                                                                                                                            |

### Wallet Modes

The prefix of each `w` value selects one of two donation modes. Clients MUST detect the mode from the prefix; the event carries no other mode discriminator.

| Prefix              | Mode      | Description                                                                                                                              |
|---------------------|-----------|------------------------------------------------------------------------------------------------------------------------------------------|
| `bc1q…` / `bc1p…`   | On-chain  | Public mainnet bech32(m) address. Donations are traceable; clients show a progress bar, total raised, and donation list.                |
| `sp1…`              | Silent payment | BIP-352 silent-payment code. Donations are **unlinkable by design**. Clients MUST hide all aggregate totals and progress UI.          |

Other prefixes (`tb1…`, `bcrt1…`, `tsp1…`, lightning invoices, etc.) MUST be rejected at parse time; the campaign does not render. A campaign carrying two `w` tags of the same mode (e.g., two `bc1…` addresses) is invalid and MUST NOT render — only one endpoint per mode is permitted.

Clients SHOULD validate the bech32(m) checksum of each `w` value, not just its prefix.

### Combined QR

When a campaign declares both endpoints, clients SHOULD render a single BIP-21 URI that combines them:

```
bitcoin:<bc1-address>?sp=<sp1-code>
```

BIP-352-aware wallets pick the `sp=` parameter and use the silent-payment flow; legacy wallets fall back to the on-chain address. A single-endpoint campaign uses the standard form: `bitcoin:<bc1-address>` (on-chain only) or `bitcoin:?sp=<sp1-code>` (silent payment only).

### Donation Receipts

Donations to a campaign's on-chain endpoint MAY be acknowledged by publishing a kind 8333 receipt (see *Kind 8333: Onchain Zap* above) targeting the campaign's `a` coordinate. Receipts MUST NOT carry `p` tags — campaigns are not Nostr-identity recipients. The `amount` tag is the sum of tx outputs paying the campaign's `w` address (excluding the donor's change output).

Silent-payment donations MUST NOT publish a Nostr receipt. Doing so would defeat the unlinkability that the silent-payment mode is designed to provide.

### Querying

**Fetch a specific campaign:**

```json
{ "kinds": [33863], "authors": ["<creator-pubkey>"], "#d": ["<slug>"], "limit": 1 }
```

**Aggregate donations for an on-chain campaign:**

```json
{ "kinds": [8333], "#a": ["33863:<creator-pubkey>:<slug>"], "limit": 500 }
```

Clients MUST verify each kind 8333 event on-chain before counting it toward the campaign total, per the verification rules in the Kind 8333 section above. The campaign-wallet verification mode matches tx outputs against the campaign's declared `w` address rather than against derived Taproot addresses.

### Ditto Implementation Notes

Ditto is not a campaign-management app — Agora is the canonical place to author campaigns. Ditto renders kind 33863 events:

- in the home feed and profile feeds (toggle: `feedIncludeCampaigns`, default on);
- on a campaign's `/:nip19` route (its `naddr1…` link) via the standard addressable-event detail page, which renders the markdown story through the same pipeline as NIP-23 articles;
- as quote-embeds inside other notes, with banner + title + summary;
- as `Commenting on @{author}'s fundraiser` in NIP-22 comment threads anchored to the campaign coordinate.

Ditto **does** support donating to a campaign from inside the app:

- The action-bar zap button on a campaign post and the in-dialog **Zap** button route through `useCampaignZap` to send Bitcoin to the campaign's declared `w` endpoint. On-chain donations publish a campaign-mode kind 8333 receipt (with `a` and `K` tags, no `p` tag). Silent-payment donations publish no Nostr event, preserving SP unlinkability.
- The Donate dialog also exposes a BIP-21 QR + "Open native wallet" path for users without a PSBT-capable signer.
- The "raised" headline on the campaign card is fetched directly from the on-chain `w` address (cumulative `funded_txo_sum` from the configured Esplora endpoint, default mempool.space). Donations count regardless of whether the donor published a Nostr receipt; the number does not regress when the beneficiary spends from the address. Silent-payment-only campaigns show no aggregate.

Ditto does NOT consult `agora.moderation` labels for surfacing decisions — every parseable kind 33863 event renders.

---

## Music Tracks & Playlists

### Kind 36787: Music Track

An addressable event containing metadata about an audio file. Full spec maintained externally.

**Required tags:** `d`, `title`, `artist`, `url`, `t` (with value `"music"`)

**Optional tags:** `image`, `video`, `album`, `track_number`, `released`, `duration`, `format`, `bitrate`, `sample_rate`, `language`, `explicit`, `zap`, `alt`

### Kind 34139: Music Playlist

An addressable event containing an ordered list of music track references.

**Required tags:** `d`, `title`, `alt`

**Optional tags:** `description`, `image`, `a` (track references), `t`, `public`, `private`, `collaborative`

Track references use `a` tags in the format `["a", "36787:<pubkey>:<d-tag>"]`.

### Albums (Convention)

Albums are represented as kind 34139 playlist events with a `["t", "album"]` tag. This reuses the existing playlist infrastructure while allowing clients to distinguish albums from user-curated playlists.

**Additional optional tags for albums:**
- `released` — ISO 8601 release date (e.g. `"2024-06-15"`)
- `label` — Record label name

**Example album event:**

```json
{
  "kind": 34139,
  "content": "Debut studio album featuring 12 tracks of ambient electronic music.",
  "tags": [
    ["d", "endless-summer-2024"],
    ["title", "Endless Summer"],
    ["image", "https://cdn.blossom.example/img/album-art.jpg"],
    ["t", "album"],
    ["t", "electronic"],
    ["t", "ambient"],
    ["released", "2024-06-15"],
    ["label", "Sunset Records"],
    ["a", "36787:abc123...:track-1"],
    ["a", "36787:abc123...:track-2"],
    ["a", "36787:abc123...:track-3"],
    ["alt", "Album: Endless Summer by The Midnight Collective"]
  ]
}
```

**Client behavior:**
- Clients detect albums by checking for a `t` tag with value `"album"` (case-insensitive)
- Albums display release date and label information when available
- Track ordering follows the order of `a` tags in the event
- The same detail view, playback, and commenting features apply to both albums and playlists

