# Ditto NIP-78 events

[NIP-78](https://github.com/nostr-protocol/nips/blob/master/78.md) defines events of kind `30078` with a globally unique `d` tag. These events are queried by the `d` tag, which allows Ditto to store custom data on relays. Ditto uses reverse DNS names like `pub.ditto.<thing>` for `d` tags.

## `pub.ditto.blocks`

An encrypted array of blocked pubkeys, JSON stringified and encrypted with `nip07.encrypt`.