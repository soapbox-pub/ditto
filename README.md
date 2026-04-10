# Ditto

Your content. Your vibe. Your rules. A fun, customizable [Nostr](https://nostr.com/) client that puts you in control.

**[ditto.pub](https://ditto.pub)** | **[Docs](https://docs.ditto.pub)** | **[Source](https://gitlab.com/soapbox-pub/ditto)**

## About

Ditto is an open-source, decentralized social media client built on the Nostr protocol. It's designed for people who want to have fun online without feeding the Big Tech machine. Express yourself with custom themes, Lightning payments, and an ever-growing set of content types -- all while owning your identity and data.

Made by [Soapbox](https://soapbox.pub).

## Features

- **Theming** -- 9 built-in theme presets, 19 CSS token properties for full customization, and the ability to publish and share themes as Nostr events
- **Infinite Content Types** -- Text notes, articles, short-form videos (Divines), live streams, polls, follow packs, color moments, magic decks, geocaching, and Webxdc mini-apps
- **Lightning Payments** -- Zap posts and profiles with sats via Nostr Wallet Connect (NWC) or WebLN
- **Private Messaging** -- End-to-end encrypted DMs (NIP-04 and NIP-17)
- **Comments** -- Comment on anything: posts, URLs, profiles, hashtags, books, and more (NIP-22)
- **Self-Hosting** -- Builds to static HTML/JS/CSS. Deploy anywhere -- GitHub Pages, Netlify, Vercel, a VPS, or a Raspberry Pi
- **Mobile** -- Android native app via Capacitor, responsive design for all screen sizes

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 22+
- npm 10.9.4+

### Development

```sh
git clone https://gitlab.com/soapbox-pub/ditto.git
cd ditto
npm install
npm run dev
```

The dev server starts at `http://localhost:8080`.

### Build

```sh
npm run build
```

The built site is output to `dist/`.

### Test

Runs type-checking, linting, unit tests, and a production build:

```sh
npm test
```

## Configuration

Ditto is configured through a `ditto.json` file at the project root, read at build time. This file is gitignored so each deployment can have its own configuration.

```jsonc
{
  "theme": "dark",
  "relayMetadata": {
    "relays": [
      { "url": "wss://relay.ditto.pub", "read": true, "write": true }
    ]
  },
  "blossomServers": ["https://blossom.ditto.pub"],
  "feedSettings": {
    "showPosts": true,
    "showReposts": true,
    "showArticles": true
    // ...and more content type toggles
  }
}
```

Configuration is resolved in three layers (highest priority first):

1. **User settings** stored in localStorage
2. **Build config** from `ditto.json`
3. **Hardcoded defaults**

Use an alternate config file path with: `CONFIG_FILE=./my-config.json npm run build`

### Custom Branding

For self-hosted instances:

- Replace `public/logo.svg` and `public/logo.png` with your logo
- Update the app name in `index.html` and `public/manifest.webmanifest`
- Replace `public/og-image.jpg` for social sharing previews
- Set default relays and upload servers in `ditto.json`

## Deployment

Ditto builds to static files and can be deployed anywhere that serves HTML.

- **GitHub Pages / GitLab Pages** -- Push to `main` and CI auto-deploys
- **Netlify / Vercel** -- Connect your fork and deploy. A `_redirects` file is included for SPA routing
- **VPS / Any web server** -- Build and copy `dist/` to your server. Configure SPA routing (e.g., Nginx `try_files $uri $uri/ /index.html`)

### Android

Build a native Android app with [Capacitor](https://capacitorjs.com/):

```sh
npm run build
npx cap sync
npx cap open android
```

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 |
| Build | Vite |
| Language | TypeScript |
| Styling | TailwindCSS 3 + shadcn/ui |
| Routing | React Router 6 |
| Data | TanStack Query |
| Nostr | Nostrify + nostr-tools |
| Mobile | Capacitor |
| Testing | Vitest + React Testing Library |

## Project Structure

```
src/
  components/     UI components (100+), including shadcn/ui primitives
  hooks/          Custom React hooks (65+)
  pages/          Page components for each route (30+)
  contexts/       React context providers
  lib/            Utilities and shared logic
  test/           Test setup and helpers
public/           Static assets, icons, manifest
```

## Contributing

We welcome contributions but have high standards. Please read the full [Contributing Guide](CONTRIBUTING.md) before submitting a merge request. The short version:

- **Bug fixes**: One bug, one MR. Keep it small and focused.
- **New features**: Must link to an existing issue and align with the [Ditto Philosophy](https://about.ditto.pub/philosophy).
- **Required**: Live preview URL, before/after screenshots, completed self-review checklist.
- **Required tools**: Claude Opus 4.6 (or latest frontier model), an AI coding agent with plan mode.

Read the [Ditto Philosophy](https://about.ditto.pub/philosophy) to understand what Ditto is and isn't.

## License

[AGPL-3.0](LICENSE)
