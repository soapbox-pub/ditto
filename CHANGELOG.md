# Changelog

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
