# Changelog

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
- Immersive full-screen vines experience on both mobile and desktop with floating controls
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
