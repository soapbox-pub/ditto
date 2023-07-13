# Ditto

Ditto is a tiny but powerful social media server for the decentralized web. With Ditto you will be able to interact across protocols and networks, and build your own social media experience.

![Ditto](ditto-banner.png)

⚠️ This software is a work in progress.

## Supported protocols

- [x] Nostr
- [ ] ActivityPub

## Features

- [ ] Follow users across networks
- [ ] Post to multiple networks at once
- [x] Log in with any Mastodon app
- [x] Like and comment on posts
- [x] Share posts
- [ ] Reposts
- [ ] Notifications
- [x] Profiles
- [ ] Search
- [ ] Moderation
- [x] Customizable
- [x] Open source
- [x] Self-hosted
- [x] Decentralized
- [x] No ads
- [x] No tracking
- [x] No censorship

## Federation

Ditto is primarily a Nostr client, using a Nostr relay as its database. ActivityPub objects are translated into Nostr events in realtime and cached by the Ditto server. When you submit a post, it sends it to your Nostr relay and then fans it out to the ActivityPub network.

The main way to use Ditto is with a Mastodon app. Or you can connect directly to the Nostr relay with a Nostr client.

## Installation

TODO

## Development

1. Install [Deno](https://deno.land).
2. Clone this repo.
3. Run `deno task dev`

## License

© Alex Gleason & other Ditto contributors  

Ditto is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

Ditto is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with Ditto. If not, see <https://www.gnu.org/licenses/>.
