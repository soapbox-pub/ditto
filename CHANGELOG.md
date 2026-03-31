# Changelog

## [2.2.7] - 2026-03-31

### Fixed
- Nushu script in encrypted letters now renders correctly on Android and iOS

## [2.2.6] - 2026-03-31

### Added
- Encrypted letters now appear as interactive 3D envelopes with Nushu script -- flip and open them to reveal the secret writing inside
- Zap receipts and profile metadata events now render in feeds and detail pages
- Remote signer callback page for NIP-46 login flows (Amber, Primal)

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
- Dedicated photo upload flow for sharing photos as NIP-68 kind 20 events
- Pull-to-refresh on all feed pages
- 3D tilt effect on badge images -- hover over badges to see them pop
- Multi-select badge awarding with indicators for already-sent badges
- Badge list recovery dialog for restoring kind 10008 profile badge lists
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
- Addressable event routing now works correctly for replaceable events (kind 10000-19999)
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
- NIP-11 relay information panel on the network settings page
- Link preview cards now display inside quoted posts instead of raw URLs
- Nsec paste guard warns you before accidentally pasting private keys outside the login field
- Remote signer UX improvements for Amber and NIP-46 users on Android
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
