---
name: nostr-kind-design
description: Decide whether to reuse an existing NIP or mint a new kind, design tag structures that relays can index, choose what goes in content vs. tags, and document new kinds or extensions in NIP.md. Load when authoring a new schema — not when wiring up rendering for a kind that already exists (use nostr-kind-rendering for that).
---

# Nostr Kinds — Design and Schema

Load this skill when:

- Minting a new event kind for a Ditto feature.
- Extending an existing NIP with new tags.
- Deciding whether an existing NIP covers a use case or whether a custom kind is warranted.
- Documenting a custom kind or extension in `NIP.md`.

**Not this skill** — if an existing NIP/kind covers your use case and you only need to render it in Ditto's UI, use the **`nostr-kind-rendering`** skill instead.

## Choosing Between Existing NIPs and Custom Kinds

1. **Thorough NIP review first.** Browse the NIP index, then read candidate NIPs in detail. The goal is to find the closest existing solution.
2. **Prefer extending existing NIPs** over creating custom kinds, even at the cost of minor schema compromises. Custom kinds fragment the ecosystem.
3. **When an existing NIP is close but not perfect**, use its kind as the base and add domain-specific tags. Document the extension in `NIP.md`.
4. **Only mint a new kind** when no existing NIP covers the core functionality, the data structure is fundamentally different, or the use case requires different storage characteristics (regular vs. replaceable vs. addressable).
5. **If a tool to generate a new kind number is available, you MUST call it.** Never pick an arbitrary number.
6. **Custom kinds MUST include a NIP-31 `alt` tag** with a human-readable description of the event's purpose.

**Example decision:**

```
Need: Equipment marketplace for farmers
Options:
  1. NIP-15 (Marketplace)   — too structured for peer-to-peer sales
  2. NIP-99 (Classifieds)   — good fit, extensible with farming tags
  3. Custom kind            — perfect fit, no interoperability

Decision: NIP-99 + farming-specific tags.
```

## Kind Ranges

An event's kind number determines storage semantics:

- **Regular** (1000 ≤ kind < 10000) — stored permanently by relays. Notes, articles, etc.
- **Replaceable** (10000 ≤ kind < 20000) — only the latest event per `pubkey+kind` is kept. Profile metadata, contact lists, mute lists.
- **Addressable** (30000 ≤ kind < 40000) — identified by `pubkey+kind+d-tag`; only the latest per combo is kept. Long-form content, products, definitions.

Kinds below 1000 are "legacy"; storage is per-kind (e.g. kind 1 is regular, kind 3 is replaceable).

## Tag Design Principles

- **Kind = schema, tags = semantics.** Don't mint a new kind just to represent a different category of the same data.
- **Relays only index single-letter tags.** Use `t` for categories so filters like `'#t': ['electronics']` work at the relay level. Multi-letter tags (`product_type`, etc.) force inefficient client-side filtering.
- **Filter at the relay**, not in JavaScript:

  ```ts
  // ❌ Fetch everything, filter locally
  const events = await nostr.query([{ kinds: [30402] }]);
  const filtered = events.filter((e) => hasTag(e, 'product_type', 'electronics'));

  // ✅ Filter at the relay
  const events = await nostr.query([{ kinds: [30402], '#t': ['electronics'] }]);
  ```

- **For Ditto-specific niches** (community apps, regional variants), tag events with a `t` value and query on it. Don't do this for generic platforms — it would silo content.

## Content vs. Tags

- **`content`** — large freeform text or existing industry-standard JSON (GeoJSON, FHIR, Tiled maps). Kind 0 is the one exception where structured JSON goes in content.
- **Tags** — queryable metadata, structured data, anything you might filter on.
- **Empty content is fine.** `content: ""` is idiomatic for tag-only events.
- **If you need to filter by a field, it must be a tag** — relays don't index content.

```json
// ✅ Queryable
{ "kind": 30402, "content": "",
  "tags": [["d", "product-123"], ["title", "Camera"], ["price", "250"], ["t", "photography"]] }

// ❌ Structured data buried in content
{ "kind": 30402, "content": "{\"title\":\"Camera\",\"price\":250}", "tags": [["d", "product-123"]] }
```

## `NIP.md`

`NIP.md` documents Ditto's custom kinds and any extensions to existing NIPs. Whenever you mint a new kind or change a custom schema, **create or update `NIP.md`** with the tag list, content format, and intended usage. If a kind you add is effectively the same shape as an existing NIP, note the NIP reference rather than duplicating the spec.

Standard NIPs (like NIP-84 Highlights, NIP-23 Articles) do **not** go in `NIP.md` — only Ditto-custom kinds and Ditto-specific extensions.

## After Designing — What's Next?

Once you've settled on a kind number and tag shape, you still need to render it in Ditto's UI. Load the **`nostr-kind-rendering`** skill for the full multi-location registration checklist (feed cards, detail pages, embedded previews, kind-label maps, notifications, feed-toggle registration).
