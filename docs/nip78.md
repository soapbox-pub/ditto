# Ditto NIP-78 events

[NIP-78](https://github.com/nostr-protocol/nips/blob/master/78.md) defines events of kind `30078` with a globally unique `d` tag. These events are queried by the `d` tag, which allows Ditto to store custom data on relays. Ditto uses reverse DNS names like `pub.ditto.<thing>` for `d` tags.

The sections below describe the `content` field. Some are encrypted and some are not, depending on whether the data should be public. Also, some events are user events, and some are admin events.

## `pub.ditto.blocks`

An encrypted array of blocked pubkeys, JSON stringified and encrypted with `nip07.encrypt`.

## `pub.ditto.frontendConfig`

JSON data for Pleroma frontends served on `/api/pleroma/frontend_configurations`. Each key contains arbitrary data used by a different frontend.