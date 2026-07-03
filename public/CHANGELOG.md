# Changelog

## [2.26.0] - 2026-07-03

Composing on mobile is a whole new experience — a full-screen editor with a slick animated emoji, GIF, and sticker tray. The Development feed now shows the full life of open-source projects: issues, pull requests, and status updates. Posts tagged #nsfw are tucked behind content warnings, and you can exempt people you follow from your muted words. Plus smarter search, a better mention autocomplete, and a proper eulogy for deleted posts.

### Added
- The Development feed now shows the full life of open-source projects — issues, pull requests, and status updates — with quick links to NostrHub and Gitworkshop and a feed toggle for each activity type
- Posts tagged with sensitive hashtags like #nsfw are now hidden behind a content warning
- A new synced setting to exempt people you follow from your muted words and hashtags
- When a post no longer exists, Ditto now tells you it was deleted by its author (and why, if they said) instead of offering futile retries — with a fitting word from Sartre
- Geocache found logs and comments now show the treasure they belong to at the top of the thread

### Changed
- Composing on mobile is now a full-screen, keyboard-aware experience
- The emoji, GIF, and sticker pickers open in a smoothly animated tray, and search results expand to fill the composer
- The home feed and content settings pages are cleaner and load instantly

### Fixed
- Search results now show recent posts first instead of old ones
- The mention autocomplete no longer closes while scrolling it, and picking a suggestion works reliably on touch screens
- Mentioning someone via a profile link now properly notifies them
- The sidebar's More menu no longer hides under the status bar on mobile

## [2.25.2] - 2026-07-02

A small fix so that "GM" notes wrapped in quotation marks now correctly trigger the sunrise celebration.

### Fixed
- GM sunrise animation now fires when note content is wrapped in quotes (e.g. "GM")

## [2.25.1] - 2026-07-02

A fresh login screen with a playful animated key that unlocks the Ditto planet, a one-tap login for browser extension users, and fixes for profile media galleries not showing Blossom-hosted content and a lag on Android taps.

### Added
- The login screen now greets you with an animated key unlocking Ditto
- If you have a Nostr browser extension installed, logging in is now a single tap — your account is detected and confirmed automatically

### Fixed
- Profile media galleries and the Photos feed now correctly display Blossom-hosted images and videos
- Tapping items on Android no longer feels sluggish due to an overly heavy haptic sequence

## [2.25.0] - 2026-07-02

Ditto feels instant now. Your posts pop into the feed the moment you hit publish, and bookmarking, pinning, muting, liking, and following all land right away instead of waiting on the network. Love a profile and hearts rain down over their header, with the love letter card getting its own gentle drift of floating hearts. Plus you can now unmute a conversation straight from the note menu, and a batch of little fixes and polish.

### Added
- Your new posts appear in the feed instantly when you publish, no waiting for the network
- Bookmarks, pins, mutes, likes, follows, and more now update the moment you tap, with a graceful undo if a publish fails
- Loving a profile now showers hearts across their header
- The love letter card comes alive with hearts that gently drift and float upward
- Unmute a conversation right from the note menu

### Changed
- Opening a note always plays its celebration now, even after a busy morning feed has used up the session's animations

### Fixed
- Selection haptics now work on Android
- Bookmarking a post now confirms with a toast and tells you if it failed

## [2.24.0] - 2026-07-01

Something wonderful happens on the feed now. Notifications are instant on every platform. Sharing into Ditto works when installed as a web app. Android users on persistent notifications can fix battery issues with one tap.

### Added
- Feed cards come alive with particle effects — confetti, balloons, sunrises, and more
- Reacting to a post sends a satisfying burst of particles from the heart
- Notifications are now instant on web and Android, powered by a live relay connection instead of polling
- Sharing from other apps now works when Ditto is installed as a web app
- iOS visitors to the web app see a native App Store banner
- Android: the persistent notification service now survives reboots
- Android: a one-tap button in notification settings to fix battery optimization issues

## [2.23.5] - 2026-07-01

Your feed now keeps up with the conversation in real time — a tappable pill appears when new posts arrive, so you never have to guess when to refresh. Search gains a "Ditto users only" filter, articles show a reading-time estimate and render as tidy preview cards in the feed, and editing your published articles is smoother than ever. Posts can now embed content-addressed images, video, and audio that stay reachable even if a server goes down. Plus a big speed-up to app startup and a batch of fixes.

### Added
- A live "new posts" pill appears on your feed when fresh posts arrive — tap it to refresh and jump to the top
- A "Ditto users only" filter in search scopes results to people posting from Ditto
- Articles show a "min read" estimate on feed cards and the article page
- Posts can embed content-addressed images, videos, and audio that fall back across servers if one is unavailable

### Changed
- Feed articles now appear as compact preview cards with cover image, summary, and a reading-time footer
- Editing your published articles now opens a dedicated page with the slug locked, fixing stale content and spurious errors when switching between articles
- The article editor's publish action is now a normal button next to Save Draft instead of a floating corner button
- Articles render with proper typographic quotes, dashes, and ellipses
- Highlights now scroll their quoted excerpt into view so you see the point of the highlight right away
- The app starts up faster by loading its Bitcoin signing tools only when you actually send an on-chain payment
- The suggested follow packs during onboarding are now a selectable grid — pick several and follow them all at once

### Fixed
- The follow button now updates instantly instead of reverting until you reload the page
- Search no longer stops loading more results prematurely
- Vivid, saturated theme colors now get readable text instead of unreadable dark text
- Your original companion no longer gets replaced by an egg after a profile hiccup

## [2.23.4] - 2026-06-18

A performance tune-up that makes profiles and feeds load faster by trimming away redundant background network requests. Tabs, dialogs, and zap buttons now only fetch what they need, when you need it.

### Changed
- Profiles and feeds load faster with fewer wasteful network requests

## [2.23.3] - 2026-06-18

A polish-focused update for how content shows up in your feed. Quoted posts now display their photos and videos inline, articles get rich preview cards, and short or media-heavy posts stop getting cut off early. Links to outside articles gain a one-tap "Open" button, Reddit embeds show at full height, and your home-screen widgets now stay in sync across all your devices. Plus assorted fixes to video previews, search, and embed spacing.

### Added
- Your sidebar widgets now sync across all your devices

### Changed
- Quoted posts now show their photos and videos inline, and articles render as rich preview cards
- Articles linked from outside Ditto show an "Open" button and a source chip with the site's name and icon
- Short posts, multi-image galleries, and video and audio posts are no longer cut off early in the feed
- Reddit embeds now render at their full height
- The profile "Posts" tab is now labeled "Feed"
- External link discussions now appear inline on comment pages
- The "Event not found" screen now has a "Try again" button
- Old-format companion (Blobbi) items from other apps are now hidden instead of showing up broken

### Fixed
- Video previews now play correctly in the mobile app
- Searching again while already on the search page now works

## [2.23.2] - 2026-06-14

Ditto feels faster. Posts and profiles you've already seen now load instantly from your device, your own posts show up the moment you publish them, and the app holds up better when your connection is spotty. App pages also gained an Active Users graph so you can see how busy an app is at a glance, and the music section has a fresh set of curated artists to discover.

### Added
- App pages now show an Active Users graph

### Changed
- The app now stores content on your device for instant loads, immediate display of your own posts, and smoother browsing on flaky connections
- Refreshed the curated artists and follows powering the music Discover section

## [2.23.1] - 2026-06-12

Profiles get more expressive. Your profile now shows how many people love you, linking straight to the list, and visitors can see at a glance when you follow them back or have them on your Love List. The Loved tab is tidier too, showing only original posts from the people you love. On Android, the back gesture on the home screen now minimizes the app like you'd expect, and a few rough edges in articles and feeds have been smoothed out.

### Added
- Profiles show a "Loves you" pill when that person has you on their Love List
- Profiles show a "Follows you" pill when that person follows you

### Changed
- Profiles now show how many people love you, linking to the full list, in place of the old streak
- The Loved tab shows only original posts, hiding reposts and reactions
- Removed the reaction button from profile actions
- On Android, the back gesture on the home screen now minimizes the app instead of doing nothing

### Fixed
- Feeds no longer briefly collapse to an empty state while refreshing
- Article text spacing around links and list items now renders correctly

## [2.23.0] - 2026-06-11

Ditto now has a Love List — a tier above following, for the people you truly love. Add them from any profile and a dedicated Loved tab at the front of your feed shows only their posts. Updates to your Love List go out as a beautiful handwritten love letter card. You can also set up multiple ways for people to support you: configure Lightning, on-chain Bitcoin, or any other payment method in your profile settings, and your fans can pick whichever works best for them.

### Added
- Love List: mark the people you love from their profile, and a dedicated Loved tab on your home feed shows only their posts
- Love List updates are posted as handwritten love letter cards with hearts and a wax seal
- A heart badge appears next to loved authors' names in your feed
- Set up multiple payment methods in profile settings so supporters can choose how they send you money
- The send-money dialog now shows all of your payment methods with a switcher

### Fixed
- Live stream video no longer scrolls off-screen when scrolling through the chat

## [2.22.1] - 2026-06-11

A quick fix for Android: the app could fail to open on the latest version, getting stuck before it ever loaded. It now starts up reliably again.

### Fixed
- The Android app no longer fails to load on startup

## [2.22.0] - 2026-06-10

Make your Blobbi's room your own: a new room editor lets you decorate the walls and floors with patterns, colors, and angles, then fill the space with furniture you've collected. You can also highlight your favorite lines now -- just select any text in a post or article and tap Highlight to share the passage. Search is sharper too, with a new sort:top option for surfacing the best results.

### Added
- Decorate your Blobbi's room with custom wall and floor patterns, colors, and angles, then arrange the furniture you've collected
- Highlight a passage from any post or article by selecting the text and tapping Highlight to share it
- Add sort:top to a search to surface the most popular results first

### Changed
- Search results are quicker and steadier, without the old flicker while loading

### Fixed
- Profile and post links shared as web addresses no longer 404 on Android

## [2.21.0] - 2026-06-07

Share into Ditto from anywhere on Android: hit Share in any app and you can post the text straight to your feed, or jump into the conversation around a link. A new Nostr Clients widget in the sidebar lets you hop between the apps people are posting from, and every client page now shows how many people are active on it with a 30-day usage chart. The Trends page gains a Unique Users by Client chart so you can see which apps the community is posting from at a glance.

### Added
- Share text or links into Ditto from any Android app -- post it to your feed or join the comments on a shared link
- New Nostr Clients widget in the sidebar for jumping between the apps people post from
- Client pages now show active-user counts and a 30-day usage chart
- New Unique Users by Client chart on the Trends page

### Changed
- Client feeds now open on the Global tab by default and hide reposts and reactions, so you see original posts made through that app

## [2.20.0] - 2026-06-06

Every Nostr app now has its own page in Ditto -- see what it looks like, browse a live feed of everything posted through it, and join the conversation in a comments tab. Search got smarter too: the search box now turns up articles, lists, follow packs, and emoji packs alongside people. You can copy anyone's npub straight from their profile, and fullscreen videos finally fill the screen without getting cropped.

### Added
- App pages: every Nostr app now has its own showcase page with a live feed of posts made through it and a comments tab
- Search now finds articles, lists, follow packs, and emoji packs -- not just people
- Copy any user's npub directly from their profile with one tap

### Fixed
- Fullscreen videos now fit the whole screen instead of being cropped

## [2.19.0] - 2026-06-05

Ditto now works offline. Your profile, who you follow, and your feed are saved on your device, so they pop up instantly the next time you open the app -- and stick around even when the network can't be reached. Feeds no longer flash empty while refreshing, and when there's genuinely nothing to show you get a clearer message with a Try again button. Following and unfollowing people is more dependable too.

### Added
- Ditto saves content on your device, so profiles, your follow list, and your feed load instantly and remain available offline
- Empty feeds now explain why -- whether you're offline, following no one yet, or just waiting for posts -- with a Try again button to retry

### Changed
- Feeds stay on screen while refreshing instead of briefly flashing an empty state
- When sending bitcoin, typing a single clear recipient now creates the chip immediately instead of showing a one-item list, and the on-chain address option appears above the silent-payment option

### Fixed
- Following or unfollowing someone no longer occasionally wipes your follow list when the network hiccups
- Your profile and the profiles of others no longer briefly disappear when a relay returns nothing

## [2.18.4] - 2026-05-31

A maintenance release that makes loading your feed and other content more reliable.

### Changed
- Content now loads more reliably thanks to improvements in how Ditto fetches data from the network

## [2.18.3] - 2026-05-30

Tap a Nostr link anywhere on your phone and Ditto now opens straight to the right profile, post, or page. The wallet's Send dialog gains a Custom fee option so you can always set your own rate -- and fees that used to fail to load on mobile data now load reliably. People without a name now simply show as "Anonymous" instead of a random made-up handle.

### Added
- Tapping a `nostr:` link on iOS or Android opens it directly in Ditto, jumping to the matching profile, post, or page
- The wallet's Send dialog now has a "Custom" fee tier with an inline rate input, so you can always pick your own fee -- even when the network estimate is unavailable

### Changed
- People with no name set now appear as "Anonymous" instead of a randomly generated handle
- The Send dialog's fee picker now shows a clear loading or error state (with a Retry) instead of displaying a misleading "0 sat/vB", and blocks sending until a valid fee rate is available

### Fixed
- Wallet fees now load reliably on mobile data. They previously failed to appear on some cellular connections, leaving the Send dialog with no fee rates

## [2.18.2] - 2026-05-28

A small fix for tapping `bitcoin:` links. When a link offers both a private silent-payment address and a regular on-chain one, the Send dialog now lets you choose between privacy and compatibility instead of silently picking for you -- matching what pasting or scanning the same code already did.

### Fixed
- Tapping a `bitcoin:` link that carries both a silent-payment and an on-chain address now opens the recipient chooser so you can pick privacy vs. compatibility, instead of always defaulting to the silent-payment address

## [2.18.1] - 2026-05-28

Tap a `bitcoin:` link anywhere on your phone and Ditto opens its Send dialog with the payment pre-filled. The Send dialog also accepts BIP-21 URIs pasted into the recipient field, offers a chooser when a code carries both a silent-payment and on-chain address, and leads with the amount first. Quote-embedded polls, short videos, voice messages, and a dozen other content types now show proper preview cards instead of "not supported." Adding a second account also actually switches to it now.

### Added
- Tap a `bitcoin:` link on iOS or Android and Ditto opens its Send dialog with the address, silent-payment code, and amount pre-filled, ready to confirm

### Changed
- The Send dialog now accepts BIP-21 URIs (`bitcoin:bc1...?sp=sp1...`) pasted into the recipient field, matching what its QR scanner already understood. When the URI carries both a silent-payment address and an on-chain fallback, you get a chooser instead of being silently routed one way
- Send dialog reordered to lead with the amount, then the recipient -- matching how you actually think about a payment. The recipient input's icon switched from a camera to a QR-code mark, and the recipient dropdown now reopens on re-tap and floats above the dialog instead of getting clipped
- Profile-search suggestions no longer flash under the recipient field when you've pasted a raw Bitcoin address or BIP-21 URI, and the privacy notice for raw on-chain sends now reads as a friendly warning rather than a scolding
- Quote-embedded polls, poll votes, short videos, voice messages, color moments, found logs, reactions, reposts, nsites, Zapstore assets, and other known content types now render as compact kind-labeled cards instead of falling back to "This event kind is not supported"

### Fixed
- Logging into a second account from "Add another account" now actually switches to that account. Previously the new account silently landed at the back of the queue while the prior account stayed current, which on the signup flow caused the new account's profile and follow list to overwrite the previous user's

## [2.18.0] - 2026-05-23

Agora Fundraisers now show up across Ditto -- in your feed, on profile pages, as quote embeds, and in comment threads. Open one to see the campaign story, a live "raised of goal" bar pulled straight from Bitcoin, and a Donate button that hands you a QR plus an "Open in Wallet" link, or lets you zap from Ditto's built-in wallet in one tap. The Send dialog's QR scanner also learned BIP-21's `sp=` parameter, so scanning a payment code that offers a silent-payment address will use it automatically.

### Added
- Agora Fundraisers in your feed and on profiles -- self-authored Bitcoin fundraising campaigns now render wherever Ditto shows Nostr content, including home and profile feeds, quote embeds, and comment threads. The campaign detail page shows the full markdown story, a "raised of goal" progress bar pulled live from the campaign's on-chain address (so donations count even when the donor doesn't publish a receipt), and a Donate button that opens a dialog with a QR code, an "Open in Wallet" link, and a "Zap" option that pays the campaign instantly from your Ditto wallet

### Changed
- The wallet's QR scanner now honors BIP-21's `sp=` silent-payment parameter -- scanning a `bitcoin:` URI that advertises a silent-payment address uses it automatically, giving you the private, reusable recipient instead of the raw on-chain address

## [2.17.0] - 2026-05-23

Tip a whole follow list in one Bitcoin transaction with "Zap all members" -- one signature, one fee, every member paid. Send Bitcoin to silent-payment (sp1...) addresses for a private, reusable recipient. Scan a QR code from the Send dialog to grab a Bitcoin address or Nostr identifier instantly. Highlights now flow into your home feed alongside posts and articles. And the wallet stays alive when mempool.space rate-limits you -- automatic failover across endpoints, configurable in settings.

### Added
- "Zap all members" on people-list events -- the lightning button on follow lists, follow sets, and follow packs now opens a small menu with "Zap author" and "Zap all members". The all-members option pays every member in a single Bitcoin transaction with one fee and one signature, splits the USD total evenly per recipient, and shows up in each recipient's notifications as their per-recipient share ("$X and N others") instead of the full batch total
- Send Bitcoin to silent-payment (BIP-352) addresses -- a reusable single-string `sp1...` recipient that derives a fresh on-chain output for every payment, so your wallet activity isn't trivially linkable on-chain. Works alongside the existing recipient picker for raw addresses and Nostr identities
- QR scan button in the wallet's Send dialog -- tap the camera icon next to the recipient field to scan an on-chain address, a `bitcoin:` payment URI, or a Nostr identifier (npub, nprofile, nip05, or hex). Bitcoin addresses fill in directly; Nostr identifiers route through the recipient picker for one-tap confirmation
- Bitcoin APIs editor in Wallet settings -- view, reorder, add, and remove the Esplora endpoints your wallet uses, with a "Restore defaults" button. Removal is blocked when only one endpoint is left
- "View" action on the post success toast -- after publishing, tap "View" in the toast to jump straight to your new post

### Changed
- Highlights from highlighting apps now appear in your home feed (Follows, Global, and Communities) and on profile feeds by default, alongside posts and articles. The toggle is still in Feed Settings if you'd rather hide them. Highlights render with a rich link preview of the source URL, a typographic quote icon, and replies to a highlight now read "Commenting on @author's highlight" with a hover preview
- The wallet automatically fails over between Esplora endpoints (mempool.space → mempool.emzy.de → blockstream.info by default), so a rate-limited or unreachable host no longer freezes balance, fee, address, or zap-verification calls. Failed endpoints cool down with exponential backoff and rejoin rotation as soon as they recover
- The wallet's Send dialog now shows a privacy warning whenever the recipient is a raw `bc1...` address with no Nostr identity attached -- Bitcoin's public ledger means an on-chain send is traceable forever. Tick "I understand" and tap Send twice to confirm

### Fixed
- Visiting another user's profile by their raw hex pubkey URL now shows the profile correctly instead of "Please log in to view your profile"

## [2.16.0] - 2026-05-16

Send Bitcoin straight to anyone on Nostr from a redesigned wallet Send dialog -- start typing a name, pick from the suggestions, set the amount in dollars, and go. Tipping a person now shows up in feeds and notifications as a first-class zap with their avatar and name, the same shape as a note zap. After you send, "View transaction" opens the in-app Bitcoin page instead of bouncing out to mempool.space, so the on-chain zap, the sender, and any comments all stay one tap away.

### Added
- Tip anyone on Nostr from the wallet -- the Send dialog now has a profile-autocomplete recipient picker that searches your follows and the wider network as you type, plus paste support for npub, nprofile, nip05, and hex pubkeys. Raw bitcoin addresses still work as before
- Profile zaps render as first-class activity -- when someone tips a person rather than a specific note, the zap appears in feeds and notifications with the recipient's avatar, display name, and the standard action bar, instead of being silently dropped

### Changed
- Wallet Send dialog redesigned to match the on-chain zap UI -- single screen with a big editable USD amount, preset chips, a fee-speed picker, and a two-tap confirm for large sends, replacing the previous three-step BTC-denominated wizard
- After sending Bitcoin, "View transaction" now opens the in-app Bitcoin page so you can see the on-chain zap attestation, the sender's Nostr identity, and any comments -- not just the raw mempool view
- Comment threads rooted on a zap now read e.g. "Commenting on $100 zap by @Alex" with links to the zap and the sender, instead of dumping the raw zap description

### Fixed
- On-chain zaps in the feed and in thread ancestors now show the sender's name and the correct sats amount, instead of "Anonymous zapped" and a value one thousandth of the real tip
- Zaps no longer disappear from your feed when the post they targeted is missing from the current relay page -- they fall back to a profile-zap card so the activity still surfaces

## [2.15.2] - 2026-05-15

Reactions and zaps from people you follow now show up in your home feed by default -- catch up on the moments your friends loved without flipping a switch. A malformed post can no longer take down your feed or a thread: broken events are replaced with a small tombstone and everything around them keeps working. Comment notifications get their own speech-bubble icon, distinct from replies.

### Changed
- Reactions and zaps from people you follow now appear in your home feed by default, the same way reposts do. Both toggles still live in Content Settings if you'd rather turn them off
- Comment notifications now use a speech-bubble icon, visually distinct from thread replies

### Fixed
- A single broken post can no longer blank out your feed, a thread, or an entire page. Malformed events render as a small "This post could not be displayed" tombstone, the rest of the feed stays interactive, and the sidebar and navigation remain usable even if a route handler crashes
- Profiles with malformed badge sets, people lists with malformed entries, and posts referencing malformed event ids no longer crash the surrounding card

## [2.15.1] - 2026-05-14

Badge sets with lots of badges -- like RetroAchievements game sets with 100+ icons -- now load every tile instead of falling back to a wall of anonymous trophies.

### Fixed
- Large badge sets (e.g. RetroAchievements game collections with 100+ badges) now render every tile with its real artwork and name instead of falling back to a grid of generic trophy icons

## [2.15.0] - 2026-05-14

Reactions and zaps from people you follow can now show up in your feed as a header above the post they targeted -- two new toggles, off by default. Zap amounts now appear in dollars by default with a single bolt icon for Lightning and on-chain alike, switchable in Advanced Settings. Every Follow All button gains a Mute All sibling, so any people list can become a mute source. Badge sets render as poster-style cards, and zap notifications finally show the amount.

### Added
- Reaction and zap overlays in your feed -- two new toggles in Content Settings (off by default) let reactions and zaps from people you follow surface as a header above the post they targeted, the same way reposts already do. The reaction overlay renders the actual emoji (including custom ones), the zap overlay shows the amount, and tapping the verb jumps to the underlying reaction or zap. Works in the home feed, profile feeds, custom tabs, follow-page feeds, people-list feeds, and search results
- Mute All next to every Follow All -- people lists, follow packs, follow sets, badges, and the Team Soapbox page now have a caret next to Follow All with a Mute All option that adds every pubkey in the list to your mute list at once. Feeds you're following are filtered by your mute list at query time too, so muting someone you already followed actually quiets them
- Currency preference -- a new Currency section in Advanced Settings switches zap amounts between USD (the new default) and sats, and the preference rides along on encrypted settings sync so it follows you across devices

### Changed
- Zap amounts now display as dollars by default everywhere -- feed overlays, notifications, embedded zap cards, the Zaps tab of the interactions modal, music and podcast totals, and the bolt counter on every post. On-chain zaps share the same bolt icon and "Zap" label as Lightning zaps in feeds, since the social meaning is identical -- the Bitcoin icon stays on the zap dialog's tab strip and on profile BTC address rows where the rail actually matters
- Zap notifications now show the amount in the header instead of a bare "X zapped you", reading zaps whose amount is only encoded in the bolt11 invoice. The verbs in "reacted to", "reposted", and "zapped" notifications are now links to the underlying event
- Badge sets render as a poster-style card with the artwork as a full-bleed banner and the title and description overlaid, distinct from the legacy profile-badge layout. The feed action header reads e.g. "Alice updated Super Mario Bros. badges" with the set title interpolated in
- The block explorer URL is now configurable in Advanced Settings, so self-hosted Esplora deployments (or Blockstream's) work without code changes. Bitcoin price data also comes from mempool.space now, consolidating wallet network calls onto a single host

### Fixed
- The "What's new" toast after an update now truncates long release summaries on a word boundary instead of rendering the entire paragraph

## [2.14.4] - 2026-05-11

The Wikipedia featured-article card on your home feed now shows article titles cleanly without the underscores, and tapping it opens the article right inside Ditto instead of bouncing you out to a new browser tab.

### Fixed
- The Wikipedia featured-article widget now shows the article's normalized title (e.g. "Japan Cup" instead of "Japan_Cup") and opens in the in-app article view instead of an external browser tab

## [2.14.3] - 2026-05-11

A behind-the-scenes maintenance release with no user-facing changes.

### Changed
- Behind-the-scenes maintenance release. No user-facing changes.

## [2.14.2] - 2026-05-11

Your Blobbi gets some attention this release. Switch between Blobbis without leaving the home widget, find new energy items and a "Needs Now" summary in the shop, and visit friends knowing your help only lands where it's actually needed. Also fixes a missed reaction animation when you care for a friend's Blobbi.

### Added
- Switch Blobbis straight from the home widget -- a new arrow button below the companion icon opens a popover of all your Blobbis with horizontal scroll, a close button, and accessible labels, so you can flip between them without leaving your feed
- Two new energy items in the Blobbi shop -- an Energy Drink and a Power Nap Pillow -- plus a "Needs Now" summary in the activity tab that surfaces what your Blobbi is asking for right now, with priority badges

### Changed
- Visiting friends can only help a Blobbi with stats that are actually in visual distress, so social care goes where it's needed instead of stacking on a Blobbi that's already thriving

### Fixed
- Caring for a friend's Blobbi reliably triggers the companion's reaction layer again -- the action context is now wired through the Blobbi page so feedback animations land where you tap

## [2.14.1] - 2026-05-10

On-chain zaps now appear in your notifications next to Lightning zaps, stacked avatars across follow lists are tappable so you can jump straight to a profile, follow lists always show their latest version, and the "X reposted" header shows up properly when reactions, zaps, reposts, or poll votes are reposted.

### Added
- On-chain zaps now show up in your notifications alongside Lightning zaps, with the same header, sats label, and bolt icon -- and the Zaps notification toggle controls both at once

### Changed
- Stacked avatars in follow lists, follow sets, and follow packs are now clickable -- tap any face to jump straight to that person's profile, with a visible focus ring for keyboard navigation
- Follow list links now point to the live, stable list instead of a frozen revision, so you always see the latest version when you open one from a feed

### Fixed
- When someone reposts a reaction, zap, repost, or poll vote, the "X reposted" attribution now shows above the activity card instead of being silently dropped

## [2.14.0] - 2026-05-09

### Added
- Restore previous versions -- the post 3-dots menu now has a "Restore previous version" option for replaceable content you own, opening a dialog that lets you browse every past snapshot of a profile, list, article, or any other replaceable event and republish the one you want
- On-chain zaps now render as zaps everywhere -- detail pages, quote embeds, the reply composer's parent preview, and the Zaps tab of the interactions modal -- with the same amber bolt, sender, amount, and comment as Lightning zaps, plus a "verifying..." hint while the transaction is checked against the blockchain
- A grand success screen after a zap with an animated check, the amount, and the recipient -- and for on-chain zaps a "View transaction" link to the block explorer

### Changed
- The bolt button on the post action bar now fills in after you zap a post (matching how the repost and reaction buttons already work), and reflects both Lightning and on-chain zaps

### Fixed
- Deleting a draft article now reliably removes it from relays that key off event-id rather than the addressable coordinate

## [2.13.1] - 2026-05-05

### Fixed
- Remote signer login now falls back to the full default relay list when you don't have any write relays configured, giving your signer more chances to connect during the handshake

## [2.13.0] - 2026-05-05

### Added
- Drag-to-feed Kitchen -- drag a food item straight to your Blobbi's mouth to feed it, with a chewing animation, crumb particles, a happy reaction, and a soft feeding sound
- Blobbi social interactions -- feed, play, clean, and medicate other people's Blobbis, with facial reactions, sparkles, floating hearts, and an Activity tab showing who cared for your Blobbi. Owners can toggle whether their Blobbi is open to visitors
- Highlight events -- pull-quote excerpts from articles and notes now render as attributed blockquotes in feeds, post details, quote embeds, and notifications, with their own toggleable feed and notification category
- Commenting on any identifier -- every `/i/` page (books, Bitcoin transactions, geohashes, ISBNs, and more) now has a full comment thread with a compose box, and books get the same curved-tab styling as the rest of the app
- nsite sidebar pinning -- pin nsite preview links from a post's "More" menu; clicking the sidebar item auto-launches the preview, complete with the site's favicon and title
- Run nsites as logged in -- nsite previews now inject a Nostr signer into the sandboxed site, with a shield-icon permission manager that remembers per-site choices for sign, encrypt, and decrypt requests
- Birdex chorus button -- play every recorded song for a species in sequence, straight from the species page

### Changed
- Zap dialog redesigned -- both on-chain and Lightning tabs lead with a big editable dollar amount, a shared preset row, and a single `Send $X` button. Lightning presets now start at $0.10 for tip-sized sends, the $100 two-tap confirmation applies to both flows, and insufficient-balance shows directly on the amount and button
- Share button removed from the post action bar -- share lives in the post "More" menu instead, leaving reply, repost, react, and zap front and center

### Fixed
- Sing-to-Blobbi mic access works on Android and preview playback works on iOS
- Blobbi sleepy-eye animation no longer breaks when the same Blobbi appears in multiple places on screen
- Search dropdown highlight icons now have enough contrast to read against the selected row

## [2.12.2] - 2026-05-04

### Added
- Blobbi vomit escalation -- shake your Blobbi past the dizzy threshold and it'll throw up, with puddles that linger in the room until you clean them up
- Articles now render Nostr mentions, quoted notes, links, hashtags, and custom emoji inline instead of showing them as raw text, matching how regular notes already behave
- Remote signer login now shows live handshake progress so you can see when your signer has connected instead of staring at a blank dialog

### Changed
- Personal relay list is now off by default -- fresh installs and new accounts use the app's default relays until you opt in via Settings > Network
- Page-load screens show a neutral spinner instead of a feed-shaped skeleton, so non-feed pages no longer flash the wrong layout

### Fixed
- Short-form videos now play with sound when autoplay is turned off and you tap to play, instead of staying silent
- Egg tap-to-wiggle works again on the Blobbi page
- Blobbi evolution progress no longer resets when activity state changes mid-flight
- Shake reaction is more stable -- dizzy eyes stay animated, stacked shakes register correctly, and the debug bypass is gone

## [2.12.1] - 2026-05-01

### Changed
- The right widget sidebar now appears on iPad-landscape (1024px) viewports, and both sidebars scale fluidly with the window instead of snapping at fixed widths
- Hashtags with internal hyphens like `#bitcoin-conference` and `#70-706` now render as a single tag instead of being cut off at the dash

### Fixed
- Comments on country, book, and Bitcoin transaction/address pages now load correctly instead of showing an empty thread

## [2.12.0] - 2026-04-30

### Added
- Bitcoin wallet -- a new Wallet tab in the sidebar shows your balance in USD with BTC underneath, a transaction history that collapses when empty, and a 3-step send flow with a two-tap confirmation for amounts over $100
- Bitcoin zaps -- send on-chain Bitcoin directly to anyone on Nostr as a native alternative to Lightning, with an automatic QR-code fallback when your signer does not support Bitcoin
- Detail pages for Bitcoin transactions and addresses, with the block explorer URL configurable per deployment
- Evolve ceremony -- Blobbis now transform from baby to adult through an immersive full-screen animation with energy particles, a flash-to-reveal, and a typewriter reveal text
- Birdex life lists -- a compact species tile strip in feeds and a full responsive grid on the post-detail page, so visitors can browse an author's whole collection
- Bird-song recordings play inline on Wikipedia species pages, with an emerald play button next to the title and a credit link in the footer

### Changed
- Display names now use a consistent `name` then `display_name` fallback everywhere, so the same user renders the same way across the whole UI
- Hatching ceremony reveal background is now tinted by the baby Blobbi's color instead of a hardcoded blue, with a vignette overlay so the blobbi pops against same-hue backgrounds
- Bird Detection cards prefer the authoritative scientific name tag published by Birdstar, so cards stay labeled even when the post's alt text is generic

### Fixed
- "Discover people to follow" now lands on a populated Global tab instead of another empty Follows view
- Blobbi daily bounty progress is no longer wiped by profile writes, and persists reliably across page refreshes and app restarts
- Blobbi profile content (name, avatar, custom fields) is preserved across every profile update instead of being silently dropped by some write paths
- Blobbi hatch and evolve mission progress no longer resets from concurrent writes racing against each other

## [2.11.2] - 2026-04-28

### Fixed
- Unsupported event kinds no longer leak opaque identifiers or raw post content into previews and hover cards -- when an author-written description is missing, the card shows the "not supported" tombstone instead of an internal lookup string

## [2.11.1] - 2026-04-28

### Fixed
- Unsupported event kinds now show a clean fallback card with the author's description (or a "not supported" tombstone) instead of rendering raw JSON or empty content through the text-note parser -- applies in feeds, post detail, embedded quotes, reply context, compose previews, notifications, and inline nostr: mentions

## [2.11.0] - 2026-04-28

### Added
- Birdstar bird detections and hand-drawn constellations now render inline in feeds -- species cards with Wikipedia summaries, and gnomonic star maps backed by the Hipparcos catalog, with a "View on Birdstar" deep-link and a Discuss button that routes species comments to the shared Wikidata identifier
- Magic: The Gathering cards render from Gatherer URLs -- card art with a 3D mouse tilt and specular glare, face toggle for double-faced cards, lightbox, and hover-card previews across comments, detail pages, and external content
- Touch support for the Magic card 3D tilt -- press and drag to rock the card on mobile
- Wikidata entity URLs on the external content page render the entity's English Wikipedia article, falling back to a generic link preview when no article exists
- Webxdc embeds now render as a tilted Game Boy-style cartridge tinted by the app icon's dominant color, with the launch icon centered on the label
- Segmented Blobbi stat rings -- babies show 4 bars and adults show 10, so progress is visible at a glance instead of as a continuous sweep, and the ring gaps are now symmetrical
- Sleep is now restorative for Blobbis -- energy regenerates faster, hunger, happiness, and hygiene decay at a fraction of their awake rates, and health stops degrading entirely while asleep
- Blobbi rooms and carousel focus are remembered per-Blobbi across refreshes and Blobbi switches
- Action and fridge previews show segment impact alongside raw stat changes, so it's clear how much a bar will fill
- Profile recovery now shows follow-list snapshots as avatar stacks with the newest follows first, making different historical versions distinguishable at a glance
- Google Play and App Store listings are declared in the web manifest so browsers can surface the native apps

### Changed
- The "Follow Packs" feed toggle is now called "People Lists" and its description explains that it also covers follow lists and people sets
- Blobbi care thresholds are aligned to the new segment model -- attention and urgent states fire on clear bar boundaries instead of arbitrary numbers, and the care badge triggers when any stat is urgent or multiple stats need attention
- Awake decay rates rebalanced so growing up feels like increased resilience -- babies hit their first "okay" stat around 2.7 hours and adults around 5-6 hours
- Item effects rebalanced around the segment model -- basic items restore roughly one baby bar, medium items offer meaningful upgrades, and premium items deliver strong multi-stat effects

### Fixed
- Profile feeds now filter out deprecated follow sets, unlisted decks, hidden treasures, and empty emoji packs before rendering, matching the main feed's behavior
- Onboarding no longer clobbers a returning user's feed preferences with a hardcoded preset when their encrypted settings fetch comes back empty

## [2.10.5] - 2026-04-25

### Added
- Blobbi eye tracking -- your companion's eyes follow content on your feed and post detail pages, including touch support on mobile
- Blobbi overstimulation reaction -- tap your Blobbi too many times and it zooms in with a shockwave, blocking interactions until it calms down
- Shake-to-dizzy reaction -- shake your phone to make your Blobbi go woozy with a nausea fill effect
- Blobbi route-transition reactions -- your companion glances at where you tapped before looking at new content when navigating
- Guided care flow -- low-status indicators glow to get your attention, and tapping any stat icon walks you to the right room to help
- Drag-to-clean shovel -- swipe poop away instead of tapping a button, with poops now visible across all rooms
- Pandi color customizer with tinted-white body and dark-tinted patches
- Vines now appear in feeds -- short videos render inline with volume control
- Infinite scroll pagination on the search page
- Right-to-left text support expanded to articles, compose box, and letters

### Changed
- Blobbi colors are now generated from the seed instead of fixed palettes, giving every Blobbi a unique look
- Adult Blobbi type is now derived from the seed for fully deterministic visual identity

### Fixed
- Content warnings were not applied on the video and vine feed pages -- videos with sensitive tags played without blur or filtering
- Compose textarea lost its expanded height when toggling the markdown preview on and off
- Crysti Blobbi was missing sparkle animations, had a broken pink facet path, and mismatched sleeping opacities
- Adopting another Blobbi could create a duplicate egg due to a race condition in the hatching ceremony

## [2.10.4] - 2026-04-23

### Added
- Right-to-left text support for Arabic, Hebrew, and other RTL languages across posts, bios, and direct messages
- Blobbis now close their eyes when falling asleep and open them when waking up with smooth one-shot animations

### Changed
- Eye color and secondary color now apply consistently across all adult Blobbi forms
- Blobbi mission progress is now tracked per-Blobbi instead of per-account, so evolving multiple Blobbis no longer conflicts

### Fixed
- Swiping to dismiss a full-screen image could leave the controls flickering or locked in place
- Sleeping Blobbis appeared with open eyes in the Blobbies tab grid
- Catti reaction mouths rendered off-center instead of aligned with the face
- Catti whiskers disappeared when showing a reaction mouth
- Pandi eye tracking could lock onto ear patches instead of actual eyes
- Adult Blobbi eyebrows floated away from the eyes on certain body shapes
- Some adult Blobbi body shapes were not detected correctly for visual effects
- Poll and spoiler menu in the compose modal was clipped off-screen on mobile
- Duplicate Blobbis could appear when the legacy-to-new-format migration ran more than once

## [2.10.3] - 2026-04-20

### Added
- Music discovery page with a curated Discover tab, artist profiles, playlist detail pages with full playback, genre browsing, and hot/top/new sorting
- Swipe-to-dismiss gesture on full-screen image lightboxes -- flick up or down to close instead of reaching for the X button
- Autoplay videos setting in Content preferences (off by default) that plays videos muted in feeds and profiles
- Replies are now delivered to tagged users' inbox relays so they're more likely to see your response

### Fixed
- Status bar text could appear unreadable on light themes
- Envelope cards in the Letters inbox were hard to tap on mobile
- Wall compose box kept showing the previous post's text after submitting from the modal

## [2.10.2] - 2026-04-18

### Fixed
- Sleep and wake actions on Blobbis no longer wipe out evolution progress, and existing Blobbis that got stuck are recovered automatically
- Pages no longer crash when a post contains a malformed blurhash; a placeholder is shown instead
- External content links (books, locations, and other identifiers) and relay pages no longer crash on unusual or malformed URLs
- Custom profile themes with invalid color values no longer break the page

## [2.10.1] - 2026-04-17

### Fixed
- QR codes, copy-link actions, and remote-login callbacks on the iOS and Android apps now produce real shareable URLs instead of broken `capacitor://localhost` ones

## [2.10.0] - 2026-04-17

### Added
- Follow lists, follow sets, and follow packs now share a unified detail view with Feed, Members, and Comments tabs, plus infinite scroll through posts from everyone on the list
- Follow All button lets you follow everyone on someone's list or pack in a single tap, and a Save button copies any list to your own account
- Tapping the "Following" count on a profile now opens a proper shareable page for that follow list instead of a modal

### Changed
- Quote posts, replies, and hover cards now show rich previews when someone shares a follow list or pack
- Blobbi care actions in your feed now read as "cared for their Blobbi" instead of "updated their Blobbi"

### Fixed
- Stuck pinch-to-zoom on iOS that could lock the app in a zoomed-out state after a stray gesture
- Profile and follow-list links that point at legacy replaceable events now resolve correctly instead of showing a "not found" state

## [2.9.0] - 2026-04-17

### Added
- Compose box overhaul: emoji, GIF, and sticker pickers now appear inline right where you're typing, drafts autosave so you never lose a post mid-thought, and the box guards against accidental dismissal
- Badge awards now appear inline in your home, profile, and Badges feeds with a one-tap accept button
- Reaction, repost, zap, and poll-vote detail views now show the full list of who interacted, not just a count

### Changed
- Hatching and evolving Blobbis no longer requires posting -- focus on the care actions that matter

## [2.8.0] - 2026-04-16

### Added
- Back up your secret key right from Profile settings -- reveal, copy, and save it to iCloud Keychain, Android Credential Manager, or a local file
- Blobbi mission progress now persists across page refreshes, so your hatching and evolution journey picks up right where you left off

### Changed
- AI chat has been overhauled with a cleaner layout, the Dork mascot across empty states, and a clear path to grab Shakespeare credits when you run out
- Friendly error banners now explain when you've hit the rate limit or run out of AI credits, instead of cryptic failures

### Fixed
- Avatar shape selection during signup now actually saves to your profile
- Blobbi interaction missions now tally correctly the moment you start incubating or evolving
- Blobbi task progress displays the right numbers immediately on page load instead of showing 0 until everything catches up

## [2.7.1] - 2026-04-16

### Added
- Tap the Home tab while already on Home to scroll to the top and refresh your feed
- Blobbi hatch and evolve missions now count your existing posts, themes, and color moments retroactively -- no need to start from scratch
- New Blobbis begin incubating and evolving immediately after adoption, so every care action counts toward your next milestone

### Changed
- Signup's save-key step is clearer: the button now reads "Save Key", shows a spinner while saving, and warns you before the key is revealed on screen
- On de-Googled Android devices without a password manager, your key now safely falls back to a file in the app's Documents folder
- Wallet connections and device keys are now stored in the iOS Keychain and Android KeyStore for stronger at-rest protection
- Android's automatic cloud backup now excludes your wallet credentials

### Fixed
- Scroll position is preserved when you navigate back from a post, profile, or any other page -- no more getting bounced to the top of your feed
- Custom saved feeds now cache content and support infinite scroll like the Home, Ditto, and Global feeds
- Various security hardening across themes, letters, profile banners, direct messages, and sandboxed apps to protect against malformed data

## [2.7.0] - 2026-04-14

### Added
- Customizable widget sidebar -- drag, drop, and rearrange widgets on your feed including Trending, Hot Posts, Bluesky, AI Chat, Blobbi, Music, Photos, Wikipedia, and more
- Blobbi rooms -- swipe between living spaces, clean up after your pet, and earn XP from daily care routines
- Native push notifications on iOS with author names, content previews, and smart grouping by category
- Haptic feedback throughout the app -- taps, buzzes, and pulses when you react, zap, repost, pull to refresh, play games, and interact with your Blobbi
- Hot Posts widget showing the most popular posts from your feed at a glance

### Changed
- Sidebar widgets are now clickable links that take you to their full pages
- Blobbi widget shows live stats with circular ring indicators and quick action buttons

### Fixed
- Zaps embedded in posts now render as proper inline cards instead of blank space
- Quote posts display media and Blobbi companions correctly
- Deep linking on Google Play works again
- Game controller buttons no longer trigger text selection on long-press on iOS

## [2.6.6] - 2026-04-12

### Fixed
- Emoji and mention autocomplete dropdowns no longer get clipped by the compose box
- Emoji shortcodes now render as color emoji instead of plain text glyphs
- Dialogs and input fields on Android are no longer obscured by the virtual keyboard
- Signing requests on Android are more reliable and no longer silently fail after switching apps

## [2.6.5] - 2026-04-11

### Changed
- Apps and games load significantly faster on Android with smarter prefetching and server affinity
- Native loading spinners replace HTML-based ones on iOS and Android for a smoother experience

### Fixed
- External API requests on Android no longer fail due to hostname restrictions
- iOS App Store compliance issues resolved

## [2.6.4] - 2026-04-11

### Added
- iCloud Keychain integration on iOS -- your login credentials are now saved and restored automatically across devices

### Changed
- Empty feeds show a friendlier state with a discover button to help you find people to follow
- Signup flow simplified -- cleaner profile step with a single Continue button

### Fixed
- Avatar fallback now shows the user's initial instead of a question mark
- Android 16+ devices no longer have content hidden behind system bars
- Signup dialog background clears properly when switching between light and dark themes
- Sticky compose button stays anchored to the bottom even on empty feeds

## [2.6.3] - 2026-04-10

### Added
- Lightning invoices embedded in posts now render as tappable payment cards
- Blobbi companions in the feed reflect their current condition and projected health

### Changed
- Profile headers are cleaner -- lightning addresses and verification badges moved out of the way, and website URLs no longer show a trailing slash
- Login credentials are saved to your browser's built-in password manager for easier sign-in across sessions
- "Request to Vanish" renamed to "Delete Account" for clarity

### Fixed
- Badge image uploads now show a recommended 1:1 aspect ratio hint so your badges don't get cropped unexpectedly
- Security hardening for URLs and styles sourced from the network

## [2.6.2] - 2026-04-08

### Added
- Share follow packs and follow sets via link -- recipients see an immersive preview with member avatars, a "Follow All" button, and a combined feed from everyone in the pack
- Curated home feed with a mix of photos, short videos, livestreams, and music -- content types are spaced out so your timeline stays fresh and varied
- "Write a letter" option on profile menus for a more personal way to reach out
- Push vs persistent notification delivery option on Android

### Changed
- Webxdc games and apps always open fullscreen for a more immersive experience
- Login credentials are now stored in the device's secure keychain on iOS and Android instead of plain local storage
- Profile fields now appear inline instead of in a separate right sidebar
- Trending hashtags removed from the logged-out homepage for a cleaner first impression

### Fixed
- Webxdc and nsites work natively on iOS and Android without relying on browser sandboxing tricks
- File downloads now save directly to Documents on iOS and Android instead of silently failing
- Mobile search no longer scrolls the page behind it and properly hides the bottom navigation bar
- iOS swipe-back navigation works correctly throughout the app
- Blobbi companions appear reliably on profiles instead of sometimes going missing
- IndexedDB no longer crashes on devices with Lockdown Mode enabled

## [2.6.1] - 2026-04-06

### Added
- Manage your interest tabs (hashtags and locations) from the settings page
- Edit button on custom profile tabs so you can tweak them without recreating from scratch
- Follow packs and follow sets now show author info and action headers in the feed
- Posts now show whether they were created or updated, so you can tell when something's been edited

### Changed
- Webxdc games and apps run in a more secure sandbox with stricter content policies and private subdomains
- Nsite previews now use the same secure sandbox as webxdc apps
- Blobbi items work as instant abilities instead of consumable inventory -- no more fiddly quantity pickers

### Fixed
- Desktop tab bar no longer overflows when you have lots of tabs -- scroll arrows appear automatically
- Mobile compose box no longer randomly collapses or becomes unclickable
- Profile avatar and banner lightbox no longer hides behind the right sidebar
- Infinite scroll on custom profile tab feeds no longer reloads the same content
- Reaction emoji are now visible on each row in the interactions modal
- Missing bottom border on collapsed thread expand button restored

## [2.6.0] - 2026-04-05

### Added
- Follow links and QR codes -- share a link or scannable code that lets anyone follow you with one tap, complete with your themed profile preview and recent posts
- Immersive Blobbi hatching ceremony -- crack your egg through cinematic stages with shaking animations, a burst of light, sparkles, typewriter dialog, and a naming moment

### Changed
- Footer links redesigned as compact icon chips for a cleaner look
- Custom emoji now render crisp at small sizes with pixel-perfect scaling

### Fixed
- Custom themes now apply correctly when logging in on a new device
- Settings and preferences sync reliably across devices
- Mobile sidebar links no longer clip into the safe area
- Blobbi page background overlay now appears properly on custom themes
- Blobbi companion state no longer resets unexpectedly from stale cache data
- Letter compose picker no longer gets hidden behind the top navigation arc

## [2.5.2] - 2026-04-04

### Added
- See who voted on each poll option -- tap the vote count to open a voters list with avatar stacks and per-option filter tabs
- Poll votes now appear as activity cards in feeds and on detail pages

### Fixed
- Threads and replies load more reliably by following relay and author hints when fetching parent events

## [2.5.1] - 2026-04-03

### Fixed
- Lightbox now reliably appears above all content, not just when opened from photo galleries

## [2.5.0] - 2026-04-03

### Added
- Run nsites and web apps directly inside Ditto -- hit the "Run" button on any nsite or app card to preview it in an overlay without leaving your feed
- File uploads in the poll composer -- attach images and media to your polls
- Blobbi posts now appear in the homepage feed

### Changed
- Profile media sidebar fills remaining slots with photos from text posts when there aren't enough dedicated media posts
- App cards now show banner images and improved layout

### Fixed
- Lightbox no longer appears behind the right sidebar
- Compose box corners are properly rounded
- Clicking buttons or links inside a post card no longer accidentally navigates to the post detail page

## [2.4.1] - 2026-04-02

### Added
- Rich cards for Zapstore app releases and assets -- see download links, version info, platform badges, and hashes right in your feed

### Fixed
- First-hatch tour now shows for accounts that were onboarded before the tour existed, so no one misses the hatching moment

## [2.4.0] - 2026-04-02

### Added
- First-hatch tour: a guided experience for hatching your very first Blobbi egg, with progressive crack animations, an inline card flow, and a reveal moment
- Customizable bottom bar: rearrange or hide any item in the navigation bar to make Ditto feel like yours
- Mission surface card in the feed that surfaces your active quests at a glance

### Changed
- Missions redesigned as a quest board with collapsible cards and a lighter aesthetic
- "Edit Profile" mission now completes when you update any profile field, not just wall-specific edits
- Media tab on profiles now shows only photos, videos, and other media -- not plain text posts
- Blobbi onboarding state now syncs to your profile so it follows you across devices

### Fixed
- Notification dot no longer reappears after you've already marked notifications as read
- Dialogs no longer fly up when the mobile keyboard opens

## [2.3.1] - 2026-04-02

### Changed
- Drafts now save instantly to your device and sync to relays in the background, with a cloud sync indicator so you always know the status

### Fixed
- Dialogs stay visible above the keyboard on mobile instead of getting hidden behind it
- Editing an existing article no longer incorrectly warns about a duplicate slug
- Switching between rich text and markdown source mode no longer clears your content
- Fix crash when editing in markdown source mode

## [2.3.0] - 2026-04-02

### Added
- In-app article editor with a rich text toolbar, image uploads, auto-saving drafts, and a "My Articles" tab to manage drafts and published articles

### Fixed
- Custom emoji no longer stretch to fill their container
- Mobile drawer now closes when tapping footer links like Changelog or Privacy
- Logged-out users now default to the global tab on content feeds instead of seeing an empty follows tab

## [2.2.11] - 2026-04-02

### Fixed
- Fix crash caused by the "What's new" toast firing outside the router

## [2.2.10] - 2026-04-02

### Added
- App cards for Nostr apps now display in feeds and detail pages with hero images, icons, and quick-launch buttons
- "What's new" toast appears after an app update with a changelog preview and link to the full changelog

### Changed
- Changelog page redesigned with a hero section for the latest release, collapsible older entries, and category icons inline with each item

### Fixed
- Compose box now fully resets to its collapsed state after posting, including poll options and media trays

## [2.2.9] - 2026-04-01

### Added
- Emoji pack creator and editor with drag-and-drop image upload, auto-generated identifiers, and description field
- Blobbi companions now appear in feeds and post detail pages

### Changed
- Blobbi shop redesigned with a tile layout and instant buy -- no more categories or accessory tabs
- Emoji packs without any valid emojis are now hidden from feeds
- Custom emoji shortcode collisions across packs are automatically resolved with pack-prefixed names

## [2.2.8] - 2026-04-01

### Added
- Full threaded reply trees on post detail pages with collapsible deep branches and "Show X more replies" for sibling threads
- Broadcast button in the Event JSON dialog to re-publish any event to your relays

### Changed
- My Badges tab overhauled with drag-and-drop reordering, a scrollable list, and a showcase-style carousel for pending badges
- Encrypted letter envelopes now show the mailing side first (sender and recipient), then flip to reveal the wax seal
- Blobbi companions are more expressive -- richer status reactions, sleeping visuals, and body effects like dirt and hunger cues

### Fixed
- Notification dot not clearing after marking notifications as read
- Followers/following modal staying open after navigating to a profile

## [2.2.7] - 2026-03-31

### Fixed
- Nushu script in encrypted letters now renders correctly on Android and iOS

## [2.2.6] - 2026-03-31

### Added
- Encrypted letters now appear as interactive 3D envelopes with Nushu script -- flip and open them to reveal the secret writing inside
- Zap receipts and profile metadata events now render in feeds and detail pages
- Remote signer callback page for login flows with Amber, Primal, and other signing apps

### Changed
- Post action buttons extracted into a reusable PostActionBar component
- Badge detail page streamlined with unified tab bar

### Fixed
- Hashtags now support accented and Unicode characters
- Letter compose opens correctly from notifications and the letters page
- Letter font picker loads fonts so each option previews in the correct typeface
- Zap comment positioned inside the right column instead of floating with offset
- Safe-area padding on pinned SubHeaderBar only applies when scrolled to top

## [2.2.5] - 2026-03-30

### Fixed
- Crash when dragging profile tabs to reorder them

## [2.2.4] - 2026-03-30

### Changed
- Profiles now have an emoji reaction button instead of a zap button -- express yourself with any emoji or custom emoji right on someone's profile
- Zap moved to the profile overflow menu so it's still one tap away

### Fixed
- Crash on the notifications page caused by malformed badge award tags
- Deleting a badge now also deletes all awards you issued for it
- Custom emoji reactions missing their image tag no longer render as broken shortcodes
- Deletion requests for addressable events now include both `e` and `a` tags for broader relay compatibility
- Profile reactions no longer collapse into a single grouped notification
- Oversized reaction emoji in comment context headers

## [2.2.3] - 2026-03-30

### Added
- Letters now have an overflow menu, reply button, and a grid layout for browsing
- Independent feed toggles for comments and generic reposts in content settings
- Sidebar items are now visible to logged-out users so newcomers can explore everything

### Changed
- Compose textarea expands smoothly as you type instead of snapping to a new height
- Blobbi stickers auto-shrink near card edges and clip cleanly at rounded boundaries

### Fixed
- Feed gaps when replies are disabled no longer cause missing posts
- Avatar shape no longer flashes on load
- Top bar arc no longer flickers during navigation transitions
- Letter drawing-only sends, sticker drag bounds, and theme event preservation
- Notification rendering for badges and letters
- Duplicate React keys in content settings
- Layout rendering warning when switching views

## [2.2.2] - 2026-03-29

### Added
- Dedicated photo upload flow for sharing photos
- Pull-to-refresh on all feed pages
- 3D tilt effect on badge images -- hover over badges to see them pop
- Multi-select badge awarding with indicators for already-sent badges
- Badge list recovery dialog for restoring profile badge lists
- Compact badge row preview in embedded profile badges events
- Custom emoji usage tracking so your most-used custom emojis appear in the quick-react bar
- Release notes now included in Zapstore publishing
- Changelog link in the app footer

### Changed
- "Vines" renamed to "Divines" everywhere in the app
- Custom emojis appear first in the emoji picker, right after recent
- Threaded comment view now shows the parent event as a NoteCard with kind action headers

### Fixed
- Delete post dialog no longer freezes the feed on desktop
- Amber login on Android now properly retries when returning from the background
- Key downloads on Android save to the correct location
- Custom emoji SVGs render correctly in the emoji-mart picker
- Double-tap reactions now properly show the emoji on the post
- Emoji shortcode autocomplete text and highlight colors
- Profile skeleton no longer flickers for brand-new users with no metadata
- Event links now route correctly for all event types
- Badge notifications are now clickable
- Custom profile tab form no longer retains fields from a previously edited tab
- Double line under profile tabs in edit mode
- Inconsistent use of "geocache" vs "treasures" terminology
- Search page "N new posts" pill no longer shows unfiltered count
- Stale-cache overwrites in replaceable event mutations
- Click-through on delete confirmation and note menu items

## [2.2.1] - 2026-03-28

### Fixed
- New posts no longer cause scroll jumps -- they buffer while you're reading and appear with a tap
- Mobile header no longer shows double-layered backgrounds on notched devices
- Pinned tabs stay properly positioned when scrolling on mobile
- Signer approval toasts no longer fire in rapid succession on unstable connections
- Toasts are easier to swipe away on mobile
- Content warnings now blur thumbnails in the media grid

## [2.2.0] - 2026-03-28

### Added
- Blobbi virtual pets -- adopt an egg, hatch it, evolve it into one of 16 adult forms, and care for it with feeding, cleaning, medicine, music, and singing
- Blobbi companion that follows you around the app, tracks your cursor, blinks, expresses emotions, and reacts to what you're doing
- Blobbi shop and inventory system with items that affect your pet's stats
- Daily missions with reroll, care streaks, and stage-based rewards
- Immersive full-screen divines experience on both mobile and desktop with floating controls
- Relay information panel on the network settings page
- Link preview cards now display inside quoted posts instead of raw URLs
- Nsec paste guard warns you before accidentally pasting private keys outside the login field
- Remote signer UX improvements for Amber users on Android
- Badge awards now trigger push notifications
- Badges display in profile bio section with a "Give badge" option in the profile menu

### Changed
- Notification "Mentions" tab now shows only pure mentions, filtering out replies
- Notification preferences ("only from people I follow") now properly apply to push notifications, native Android notifications, and the unread dot
- Upgraded from React 18 to React 19
- Reduced initial bundle size by ~50% with improved code splitting and lazy loading

### Fixed
- Zapping Primal users no longer produces an error
- Hashtag feeds now match case-insensitively for parity with search results
- Mobile top bar arc no longer lingers on pages without tabs
- Give Badge dialog and profile menu action handlers

## [2.1.1] - 2026-03-27

### Added
- Emoji picker and shortcode autocomplete in zap comment box
- Zap button on badge detail view
- Theme descriptions now display on "updated their theme" posts and detail pages
- Badge thumbnail previews in award notifications
- Letter notifications with envelope card preview
- Kind-specific labels in notification text instead of generic "post"

### Fixed
- Compose modal no longer closes when dismissing emoji picker on mobile
- Compose preview overflow is now scrollable in modal
- Toast notifications swipe up to dismiss on mobile instead of sideways
- File downloads and URL opening work correctly on iOS
- Badges page no longer shows infinite skeleton when logged out

## [2.1.0] - 2026-03-26

### Added
- Letters -- a Wii Mail-inspired inbox for sending decorated letters to friends, complete with custom stationery, hand-drawn stickers, emoji stickers, fonts, and a send animation with envelope and wax seal
- Attach a color moment or theme to your letter as a gift -- recipients can tap to apply it instantly
- Stationery picker pulls from your color moments, followed users' themes, and built-in presets
- Freehand drawing canvas for creating one-of-a-kind sticker doodles
- Letters page added to the sidebar with a custom mailbox icon

## [2.0.1] - 2026-03-26

### Added
- Tap the version number in settings to see what's new

## [2.0.0] - 2026-03-26

Initial release of Ditto 2.0 -- a complete rewrite of Ditto.
