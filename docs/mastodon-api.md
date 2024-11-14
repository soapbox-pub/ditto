# Mastodon API

Ditto implements Mastodon's client-server API, a REST API used by Mastodon mobile apps and frontends to interact with Mastodon servers. While it was originally designed for Mastodon, it has been adopted by other ActivityPub servers such as Pleroma, Mitra, Friendica, and many others.

Note that Mastodon API is **not** ActivityPub. It is not the API used to federate between servers. Instead, it enables user interfaces, mobile apps, bots, and other clients to interact with Mastodon servers.

Mastodon is built in Ruby on Rails, and its API is inspired by Twitter's legacy REST API. Rails, being an MVC framework, has "models", which it maps directly to "Entities" in its API.

Endpoints return either a single Entity, or an array of Entities. Entities Entities are JSON objects with a specific structure, and are documented in the [Mastodon API documentation](https://docs.joinmastodon.org/api/).
