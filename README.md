# Ditto

Ditto is a Nostr server for building resilient communities online.
With Ditto, you can create your own social network that is decentralized, customizable, and free from ads and tracking.

For more info see: https://docs.soapbox.pub/ditto/

<img width="400" src="ditto-planet.png">

## Features

- [x] Built-in Nostr relay
- [x] Log in with any Mastodon app
- [x] Like and comment on posts
- [x] Share posts
- [x] Reposts
- [x] Notifications
- [x] Profiles
- [x] Search
- [x] Moderation
- [x] Zaps
- [x] Customizable
- [x] Open source
- [x] Self-hosted
- [x] Decentralized
- [x] No ads
- [x] No tracking
- [x] No censorship

## Development

1. Install [Deno](https://deno.land).
2. Clone this repo.
3. Download [Soapbox](https://dl.soapbox.pub/) or another web-based Mastodon client of your choice.
4. Put the frontend files inside the `public` directory.
5. Create an `.env` file.
6. Define `DITTO_NSEC=<value>` in your .env file. You can generate an nsec by running `deno task nsec`.
7. Run `deno task dev`.

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
