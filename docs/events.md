# Ditto custom events

## Users

Ditto user events describe a pubkey's relationship with the Ditto server. They are parameterized replaceable events of kind `30361` where the `d` tag is a pubkey. These events are published by Ditto's internal admin keypair.

User events have the following tags:

- `d` - pubkey of the user.
- `name` - NIP-05 username granted to the user, without the domain.
- `role` - one of `admin` or `user`.
- `origin` - the origin of the user's NIP-05, at the time the event was published.

Example:

```json
{
  "id": "d6ae2f320ae163612bf28080e7c6e55b228ee39bfa04ad50baab2e51022d4d59",
  "kind": 30361,
  "pubkey": "4cfc6ceb07bbe2f5e75f746f3e6f0eda53973e0374cd6bdbce7a930e10437e06",
  "content": "",
  "created_at": 1691568245,
  "tags": [
    ["d", "79c2cae114ea28a981e7559b4fe7854a473521a8d22a66bbab9fa248eb820ff6"],
    ["name", "alex"],
    ["role", "user"],
    ["origin", "https://ditto.ngrok.app"],
    ["alt", "@alex@ditto.ngrok.app's account was updated by the admins of ditto.ngrok.app"]
  ],
  "sig": "fc12db77b1c8f8aa86c73b617f0cd4af1e6ba244239eaf3164a292de6d39363f32d6b817ffff796ace7a103d75e1d8e6a0fb7f618819b32d81a953b4a75d7507"
}
```

## NIP-78

[NIP-78](https://github.com/nostr-protocol/nips/blob/master/78.md) defines events of kind `30078` with a globally unique `d` tag. These events are queried by the `d` tag, which allows Ditto to store custom data on relays. Ditto uses reverse DNS names like `pub.ditto.<thing>` for `d` tags.

The sections below describe the `content` field. Some are encrypted and some are not, depending on whether the data should be public. Also, some events are user events, and some are admin events.

### `pub.ditto.blocks`

An encrypted array of blocked pubkeys, JSON stringified in `content` and encrypted with `nip04.encrypt`.

### `pub.ditto.frontendConfig`

JSON data for Pleroma frontends served on `/api/pleroma/frontend_configurations`. Each key contains arbitrary data used by a different frontend.