/**
 * Structured FAQ content for the Help section.
 *
 * This module is the single source of truth for all Help/FAQ data.
 * Any page can call `getFAQCategories(intl, appName)` or `getFAQItems(intl, appName)` to
 * render a full FAQ or a filtered subset (e.g. only "payments" questions on
 * a wallet settings page).
 *
 * Questions and answers are translatable message descriptors; the
 * helpers format them for the active locale, passing `appName` as an ICU
 * argument.
 */

import { defineMessage, type IntlShape, type MessageDescriptor } from 'react-intl';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FAQItem {
  /** Stable key used for accordion state and deep-linking. */
  id: string;
  /** The question (plain text). */
  question: string;
  /**
   * The answer, as an array of paragraph strings.
   * Strings may contain simple inline markup:
   *   **bold**  and  [link text](url)
   */
  answer: string[];
}

export interface FAQCategory {
  id: string;
  label: string;
  items: FAQItem[];
}

interface FAQTemplateItem {
  id: string;
  question: MessageDescriptor;
  answer: MessageDescriptor[];
}

interface FAQTemplateCategory {
  id: string;
  label: MessageDescriptor;
  items: FAQTemplateItem[];
}

// ── Data ──────────────────────────────────────────────────────────────────────

/**
 * Raw FAQ template content. Messages may use the `{appName}` argument,
 * which is supplied at read-time by `getFAQCategories()` and friends.
 */
const FAQ_TEMPLATE: FAQTemplateCategory[] = [
  // ── Getting Started ─────────────────────────────────────────────────────
  {
    id: 'getting-started',
    label: defineMessage({ id: 'help.faq.category.gettingStarted', defaultMessage: 'Getting Started' }),
    items: [
      {
        id: 'what-is-ditto',
        question: defineMessage({ id: 'help.faq.whatIsDitto.question', defaultMessage: 'What is {appName}?' }),
        answer: [
          defineMessage({ id: 'help.faq.whatIsDitto.answer1', defaultMessage: '{appName} is a social media platform built on Nostr, a new kind of open, decentralized network. Think of {appName} as the app you\'re using right now to connect with people, post, and discover content.' }),
          defineMessage({ id: 'help.faq.whatIsDitto.answer2', defaultMessage: 'Because {appName} is built on Nostr, your account isn\'t locked to this site. You own your identity and can take it to any other Nostr app. Learn more at [soapbox.pub/ditto](https://soapbox.pub/ditto).' }),
        ],
      },
      {
        id: 'what-is-nostr',
        question: defineMessage({ id: 'help.faq.whatIsNostr.question', defaultMessage: 'What is Nostr?' }),
        answer: [
          defineMessage({ id: 'help.faq.whatIsNostr.answer1', defaultMessage: 'Nostr is a new kind of social network where **you** own your account, not a company. Think of it like email: you can use different apps, but your identity stays the same. Nobody can ban you from the entire network.' }),
          defineMessage({ id: 'help.faq.whatIsNostr.answer2', defaultMessage: 'Everything you post, every person you follow, and your entire identity is portable. You can take it with you anywhere. To learn more, check out [Nostr 101](https://soapbox.pub/blog/nostr101).' }),
        ],
      },
      {
        id: 'login-other-apps',
        question: defineMessage({ id: 'help.faq.loginOtherApps.question', defaultMessage: 'Can I log into other Nostr apps with my {appName} account?' }),
        answer: [
          defineMessage({ id: 'help.faq.loginOtherApps.answer1', defaultMessage: 'Yes! Your {appName} account **is** a Nostr account. You can use the same keys to log into any Nostr app, like Primal, Damus, Amethyst, Coracle, and many more. Your posts, followers, and profile carry over everywhere.' }),
          defineMessage({ id: 'help.faq.loginOtherApps.answer2', defaultMessage: 'Explore the full range of Nostr apps at [nostrapps.com](https://nostrapps.com/).' }),
        ],
      },
      {
        id: 'why-login-different',
        question: defineMessage({ id: 'help.faq.whyLoginDifferent.question', defaultMessage: 'Why is my sign-in so different and long?' }),
        answer: [
          defineMessage({ id: 'help.faq.whyLoginDifferent.answer1', defaultMessage: 'Instead of a username and password controlled by a company, Nostr uses a pair of cryptographic keys, like a really secure digital ID.' }),
          defineMessage({ id: 'help.faq.whyLoginDifferent.answer2', defaultMessage: 'Your "public key" (starts with **npub**) is your username that everyone can see. Your "secret key" (starts with **nsec**) is your password. The long string of characters is what makes it virtually impossible to hack.' }),
        ],
      },
      {
        id: 'lose-secret-key',
        question: defineMessage({ id: 'help.faq.loseSecretKey.question', defaultMessage: 'What happens if I lose my secret key?' }),
        answer: [
          defineMessage({ id: 'help.faq.loseSecretKey.answer1', defaultMessage: '**There is no "forgot password" button.** No company stores your key or can reset it for you. If you lose it, your account is gone forever.' }),
          defineMessage({ id: 'help.faq.loseSecretKey.answer2', defaultMessage: 'This is the tradeoff for true ownership: nobody can take your account away, but nobody can recover it either. **Save your secret key somewhere safe right now.** For tips on keeping your key safe, read [Managing Your Nostr Keys](https://soapbox.pub/blog/managing-nostr-keys).' }),
        ],
      },
      {
        id: 'manage-secret-key',
        question: defineMessage({ id: 'help.faq.manageSecretKey.question', defaultMessage: 'Can I save my secret key in my phone\'s password manager?' }),
        answer: [
          defineMessage({ id: 'help.faq.manageSecretKey.answer1', defaultMessage: 'Yes! You can save it in your device\'s password manager (like iCloud Keychain, 1Password, or Bitwarden). On iPhone, if you save it correctly in Passwords, you can even use Face ID or Touch ID to log in.' }),
          defineMessage({ id: 'help.faq.manageSecretKey.answer2', defaultMessage: 'For a full guide on the best ways to store and manage your keys, check out [Managing Your Nostr Keys](https://soapbox.pub/blog/managing-nostr-keys).' }),
        ],
      },
      {
        id: 'cost-to-use',
        question: defineMessage({ id: 'help.faq.costToUse.question', defaultMessage: 'Does {appName} cost anything?' }),
        answer: [
          defineMessage({ id: 'help.faq.costToUse.answer1', defaultMessage: '**Nope!** {appName} is completely free to use. Zaps (tips) are optional and just for fun. There are no premium tiers, no paywalls, no hidden fees.' }),
        ],
      },
      {
        id: 'beginner-guide',
        question: defineMessage({ id: 'help.faq.beginnerGuide.question', defaultMessage: 'Is there a step-by-step guide for getting started?' }),
        answer: [
          defineMessage({ id: 'help.faq.beginnerGuide.answer1', defaultMessage: 'You\'re looking at it! This Help section covers everything you need. Start by saving your secret key, then explore your feed, follow some people, and try posting.' }),
          defineMessage({ id: 'help.faq.beginnerGuide.answer2', defaultMessage: 'Don\'t worry about getting everything perfect. You can always come back here.' }),
        ],
      },
    ],
  },

  // ── Apps & Access ───────────────────────────────────────────────────────
  {
    id: 'apps-access',
    label: defineMessage({ id: 'help.faq.category.appsAccess', defaultMessage: 'Apps & Access' }),
    items: [
      {
        id: 'download-app',
        question: defineMessage({ id: 'help.faq.downloadApp.question', defaultMessage: 'Can I download this on the App Store or Google Play?' }),
        answer: [
          defineMessage({ id: 'help.faq.downloadApp.answer1', defaultMessage: 'This site works as a web app right from your browser, no download needed! You can also "Add to Home Screen" on your phone to get an app-like experience.' }),
          defineMessage({ id: 'help.faq.downloadApp.answer2', defaultMessage: 'On Android, you can download {appName} from [Zap Store](https://zapstore.dev/apps/pub.ditto.app), a community-driven app store for the Nostr ecosystem. iOS support is planned for the future, so stay tuned!' }),
        ],
      },
      {
        id: 'one-account-many-apps',
        question: defineMessage({ id: 'help.faq.oneAccountManyApps.question', defaultMessage: 'Can I use my account on other apps?' }),
        answer: [
          defineMessage({ id: 'help.faq.oneAccountManyApps.answer1', defaultMessage: 'Yes! That\'s one of the best things about Nostr. Your account isn\'t locked to any single app.' }),
          defineMessage({ id: 'help.faq.oneAccountManyApps.answer2', defaultMessage: 'You can take your keys to Primal, Damus, Amethyst, Coracle, or any other Nostr app and everything carries over: your posts, your followers, all of it.' }),
        ],
      },
      {
        id: 'nostr-app-store',
        question: defineMessage({ id: 'help.faq.nostrAppStore.question', defaultMessage: 'Is there a Nostr-specific app store?' }),
        answer: [
          defineMessage({ id: 'help.faq.nostrAppStore.answer1', defaultMessage: 'Yes! [Zap Store](https://zapstore.dev/) is a community-driven app store built specifically for the Nostr ecosystem. You can discover and download Nostr apps, and the apps are verified by the community rather than a corporation. {appName} is listed there. [Get it on Zap Store](https://zapstore.dev/apps/pub.ditto.app).' }),
          defineMessage({ id: 'help.faq.nostrAppStore.answer2', defaultMessage: 'You can also browse a directory of Nostr apps at [nostrapps.com](https://nostrapps.com/).' }),
        ],
      },
    ],
  },

  // ── Payments & Zaps ─────────────────────────────────────────────────────
  {
    id: 'payments',
    label: defineMessage({ id: 'help.faq.category.payments', defaultMessage: 'Payments & Zaps' }),
    items: [
      {
        id: 'what-are-zaps',
        question: defineMessage({ id: 'help.faq.whatAreZaps.question', defaultMessage: 'What are zaps?' }),
        answer: [
          defineMessage({ id: 'help.faq.whatAreZaps.answer1', defaultMessage: 'Zaps are tips! They let you send tiny amounts of Bitcoin to someone as a way of saying "great post" or "thanks."' }),
          defineMessage({ id: 'help.faq.whatAreZaps.answer2', defaultMessage: 'Think of it like a super-powered Like button that actually sends real money. They use the Lightning Network, which makes them instant and nearly free. To learn more, check out [Understanding Zaps](https://nostr.how/en/zaps).' }),
        ],
      },
      {
        id: 'send-bitcoin-onchain',
        question: defineMessage({ id: 'help.faq.sendBitcoinOnchain.question', defaultMessage: 'How does sending Bitcoin work?' }),
        answer: [
          defineMessage({ id: 'help.faq.sendBitcoinOnchain.answer1', defaultMessage: 'This sends real Bitcoin on-chain, using your Nostr key as your wallet, with no separate account, no top-up.' }),
          defineMessage({ id: 'help.faq.sendBitcoinOnchain.answer2', defaultMessage: 'Your send pays a small network fee to miners so the transaction gets confirmed. Faster confirmation costs a bit more; {appName} picks a sensible default.' }),
          defineMessage({ id: 'help.faq.sendBitcoinOnchain.answer3', defaultMessage: 'Once broadcast, it\'s public and irreversible. The creator\'s post gets tagged so they know the Bitcoin came from you.' }),
        ],
      },
      {
        id: 'send-bitcoin-lightning',
        question: defineMessage({ id: 'help.faq.sendBitcoinLightning.question', defaultMessage: 'How does sending Bitcoin over Lightning work?' }),
        answer: [
          defineMessage({ id: 'help.faq.sendBitcoinLightning.answer1', defaultMessage: 'Lightning is a faster, cheaper layer built on top of Bitcoin. Payments settle in seconds and fees are usually fractions of a cent.' }),
          defineMessage({ id: 'help.faq.sendBitcoinLightning.answer2', defaultMessage: 'You\'ll pay from your connected Lightning wallet. The creator receives the Bitcoin right away, and the payment is attached to their post as a zap so everyone can see the support.' }),
          defineMessage({ id: 'help.faq.sendBitcoinLightning.answer3', defaultMessage: 'To learn more, check out [Understanding Zaps](https://nostr.how/en/zaps).' }),
        ],
      },
      {
        id: 'connect-wallet',
        question: defineMessage({ id: 'help.faq.connectWallet.question', defaultMessage: 'How do I connect a wallet?' }),
        answer: [
          defineMessage({ id: 'help.faq.connectWallet.answer1', defaultMessage: 'To send or receive zaps, you need a Lightning wallet. Great options for beginners include [Alby](https://getalby.com/), [Zeus](https://zeusln.com/), and [Wallet of Satoshi](https://www.walletofsatoshi.com/).' }),
          defineMessage({ id: 'help.faq.connectWallet.answer2', defaultMessage: 'Once you have one, add your Lightning address to your profile settings, and you\'re ready to go.' }),
        ],
      },
      {
        id: 'only-bitcoin',
        question: defineMessage({ id: 'help.faq.onlyBitcoin.question', defaultMessage: 'Can I only use Bitcoin, or can I use regular money?' }),
        answer: [
          defineMessage({ id: 'help.faq.onlyBitcoin.answer1', defaultMessage: 'Zaps use Bitcoin\'s Lightning Network. If you don\'t have Bitcoin, you can skip zaps entirely. They\'re completely optional.' }),
          defineMessage({ id: 'help.faq.onlyBitcoin.answer2', defaultMessage: 'If you\'re curious, most Lightning wallets let you buy small amounts of Bitcoin right inside the app.' }),
        ],
      },
    ],
  },

  // ── Content & Safety ────────────────────────────────────────────────────
  {
    id: 'content-safety',
    label: defineMessage({ id: 'help.faq.category.contentSafety', defaultMessage: 'Content & Safety' }),
    items: [
      {
        id: 'fyp',
        question: defineMessage({ id: 'help.faq.fyp.question', defaultMessage: 'Will I have a "For You" page? How do I make my feed relevant?' }),
        answer: [
          defineMessage({ id: 'help.faq.fyp.answer1', defaultMessage: 'Your feed shows posts from people you follow. There\'s no algorithm deciding what you see. The more people you follow, the better your feed gets.' }),
          defineMessage({ id: 'help.faq.fyp.answer2', defaultMessage: 'Use the "Trends" page to discover popular content, and check out Follow Packs (curated groups of people) to quickly fill your feed with interesting voices.' }),
        ],
      },
      {
        id: 'what-are-relays',
        question: defineMessage({ id: 'help.faq.whatAreRelays.question', defaultMessage: 'What are relays?' }),
        answer: [
          defineMessage({ id: 'help.faq.whatAreRelays.answer1', defaultMessage: 'Relays are the servers that store and deliver your posts. Think of them like different mail carriers: your messages get sent through them to reach other people.' }),
          defineMessage({ id: 'help.faq.whatAreRelays.answer2', defaultMessage: 'You don\'t need to think about relays to use Nostr; the defaults work great. But if you\'re curious, you can add or remove relays in Settings > Network.' }),
          defineMessage({ id: 'help.faq.whatAreRelays.answer3', defaultMessage: 'Using multiple relays means your content is backed up in more places, making it harder for anyone to silence you. To dive deeper, read [Understanding Nostr Relays](https://nostr.how/en/relays).' }),
        ],
      },
      {
        id: 'what-are-blossom',
        question: defineMessage({ id: 'help.faq.whatAreBlossom.question', defaultMessage: 'What are Blossom servers?' }),
        answer: [
          defineMessage({ id: 'help.faq.whatAreBlossom.answer1', defaultMessage: 'Blossom servers are where your media files (photos, videos, audio) get stored when you upload them. Think of them like cloud storage for your files.' }),
          defineMessage({ id: 'help.faq.whatAreBlossom.answer2', defaultMessage: 'Different Blossom servers are run by different people in different places. You can manage which servers you use in Settings > Network. To learn more about how Blossom works, read [The Blossom Protocol](https://onnostr.substack.com/p/the-blossom-protocol-supercharging).' }),
        ],
      },
      {
        id: 'media-content',
        question: defineMessage({ id: 'help.faq.mediaContent.question', defaultMessage: 'What happens to media I upload? Can it be removed?' }),
        answer: [
          defineMessage({ id: 'help.faq.mediaContent.answer1', defaultMessage: 'When you upload media to Nostr, it gets stored on a Blossom server. That server has the right to remove any content for any reason, including based on the laws of their region.' }),
          defineMessage({ id: 'help.faq.mediaContent.answer2', defaultMessage: 'This is why it\'s important to use multiple Blossom servers, manage your server connections, and make informed choices about where you store your data.' }),
        ],
      },
      {
        id: 'report-content',
        question: defineMessage({ id: 'help.faq.reportContent.question', defaultMessage: 'How do I report harmful content?' }),
        answer: [
          defineMessage({ id: 'help.faq.reportContent.answer1', defaultMessage: 'To report a post, tap the three-dot menu (**...**) on any post and select "Report." You can also mute or block individual users from the same menu.' }),
          defineMessage({ id: 'help.faq.reportContent.answer2', defaultMessage: 'Because Nostr is decentralized, there\'s no single company reviewing reports, but relay operators can choose to remove content from their servers, and your mute list keeps your feed clean for you.' }),
        ],
      },
      {
        id: 'terms-of-service',
        question: defineMessage({ id: 'help.faq.termsOfService.question', defaultMessage: 'Are there terms of service I need to agree to?' }),
        answer: [
          defineMessage({ id: 'help.faq.termsOfService.answer1', defaultMessage: 'Nostr itself is a protocol (like email or the web), so it doesn\'t have terms of service. Individual relays and apps may have their own rules.' }),
          defineMessage({ id: 'help.faq.termsOfService.answer2', defaultMessage: 'Since no single entity controls the network, the community largely self-moderates. Think of it less like a walled garden and more like the open internet.' }),
        ],
      },
    ],
  },

  // ── Profile & Identity ───────────────────────────────────────────────────
  {
    id: 'profile-identity',
    label: defineMessage({ id: 'help.faq.category.profileIdentity', defaultMessage: 'Profile & Identity' }),
    items: [
      {
        id: 'profile-fields',
        question: defineMessage({ id: 'help.faq.profileFields.question', defaultMessage: 'What are profile fields?' }),
        answer: [
          defineMessage({ id: 'help.faq.profileFields.answer1', defaultMessage: 'Profile fields let you add extra info to your profile sidebar, like links, wallet addresses, music, photos, videos, and more. They\'re a way to express yourself and share what matters to you.' }),
          defineMessage({ id: 'help.faq.profileFields.answer2', defaultMessage: 'You can add fields from the profile settings page. Each field has a **label** (what it\'s called) and a **value** (the content). For media fields, you can upload files directly and they\'ll render as players or embeds on your profile.' }),
        ],
      },
      {
        id: 'profile-fields-music',
        question: defineMessage({ id: 'help.faq.profileFieldsMusic.question', defaultMessage: 'What audio formats can I upload for music fields?' }),
        answer: [
          defineMessage({ id: 'help.faq.profileFieldsMusic.answer1', defaultMessage: 'You can upload audio files in these formats: **MP3**, **OGG**, **WAV**, **FLAC**, **AAC**, **M4A**, and **Opus**. They\'ll appear as a mini audio player on your profile sidebar.' }),
        ],
      },
      {
        id: 'profile-fields-media',
        question: defineMessage({ id: 'help.faq.profileFieldsMedia.question', defaultMessage: 'What image and video formats are supported?' }),
        answer: [
          defineMessage({ id: 'help.faq.profileFieldsMedia.answer1', defaultMessage: 'For images: **JPG**, **PNG**, **GIF**, **WebP**, **SVG**, and **AVIF**. For video: **MP4**, **WebM**, and **MOV**.' }),
          defineMessage({ id: 'help.faq.profileFieldsMedia.answer2', defaultMessage: 'Images will display as linked thumbnails, and videos will be embedded inline on your profile.' }),
        ],
      },
    ],
  },

  // ── Why is this different from Big Tech? ────────────────────────────────
  {
    id: 'big-tech',
    label: defineMessage({ id: 'help.faq.category.bigTech', defaultMessage: 'Why Is This Different from Big Tech?' }),
    items: [
      {
        id: 'why-different',
        question: defineMessage({ id: 'help.faq.whyDifferent.question', defaultMessage: 'How is this different from Instagram, X, or Facebook?' }),
        answer: [
          defineMessage({ id: 'help.faq.whyDifferent.answer1', defaultMessage: 'On traditional social media, a company owns your account, controls what you see, and can delete your profile at any time.' }),
          defineMessage({ id: 'help.faq.whyDifferent.answer2', defaultMessage: 'On Nostr, **you** own your identity. No company can lock you out, shadowban you, or shut down your account. Your followers, your posts, and your identity belong to you, not a corporation. We take this seriously. Read our [ethics pledge](https://soapbox.pub/ethics) to see what we stand for.' }),
        ],
      },
      {
        id: 'vs-mastodon-bluesky',
        question: defineMessage({ id: 'help.faq.vsMastodonBluesky.question', defaultMessage: 'How is this different from Mastodon or Bluesky?' }),
        answer: [
          defineMessage({ id: 'help.faq.vsMastodonBluesky.answer1', defaultMessage: 'Mastodon and Bluesky are also alternatives to Big Tech, but they work very differently from Nostr. On Mastodon, your account is tied to a specific server. If that server shuts down or bans you, you lose your account and have to start over. On Bluesky, the network is technically decentralized but in practice almost everyone depends on a single company (bsky.social), which can block entire servers.' }),
          defineMessage({ id: 'help.faq.vsMastodonBluesky.answer2', defaultMessage: 'Nostr is different because your identity is a cryptographic key that **you** control. It\'s not tied to any server, company, or app. No one can delete your account, and you can switch between apps freely while keeping your followers and posts.' }),
          defineMessage({ id: 'help.faq.vsMastodonBluesky.answer3', defaultMessage: 'The good news is you don\'t have to choose just one. Bridges like Mostr let you follow people across all three networks. For a deeper comparison, check out [Nostr vs. Fediverse vs. Bluesky](https://soapbox.pub/blog/comparing-protocols).' }),
        ],
      },
      {
        id: 'what-is-decentralization',
        question: defineMessage({ id: 'help.faq.whatIsDecentralization.question', defaultMessage: 'What does "decentralized" actually mean?' }),
        answer: [
          defineMessage({ id: 'help.faq.whatIsDecentralization.answer1', defaultMessage: 'It means there\'s no single company or server running everything. Nostr is a network of independent relays and apps, all speaking the same language.' }),
          defineMessage({ id: 'help.faq.whatIsDecentralization.answer2', defaultMessage: 'If one relay goes down or kicks you off, your account still works everywhere else. It\'s like the difference between one company owning all the roads vs. having thousands of independent roads anyone can build and use. For more on why this matters, read [The Future Is Decentralized](https://soapbox.pub/blog/future-is-decentralized).' }),
        ],
      },
      {
        id: 'censorship-resistance',
        question: defineMessage({ id: 'help.faq.censorshipResistance.question', defaultMessage: 'What does "censorship-resistant" mean?' }),
        answer: [
          defineMessage({ id: 'help.faq.censorshipResistance.answer1', defaultMessage: 'It means no single person, company, or government can stop you from posting.' }),
          defineMessage({ id: 'help.faq.censorshipResistance.answer2', defaultMessage: 'On traditional platforms, one decision by a content moderation team can erase your entire online presence. On Nostr, as long as there\'s at least one relay willing to host your content, you can keep posting. You may lose reach on some relays, but you can never be fully silenced.' }),
        ],
      },
      {
        id: 'open-source',
        question: defineMessage({ id: 'help.faq.openSource.question', defaultMessage: 'What does "open source" mean, and why does it matter?' }),
        answer: [
          defineMessage({ id: 'help.faq.openSource.answer1', defaultMessage: 'Open source means the code that powers this app is publicly available for anyone to read, verify, and improve. There are no hidden algorithms, no secret data collection, and no backdoors.' }),
          defineMessage({ id: 'help.faq.openSource.answer2', defaultMessage: 'Anyone can check exactly what the software does. It\'s the digital equivalent of a restaurant with a glass kitchen, with nothing to hide. You can browse the [{appName} source code](https://gitlab.com/soapbox-pub/ditto) yourself, or if you want to try editing {appName}, you can jump right in with [Shakespeare](https://shakespeare.diy/clone?url=https%3A%2F%2Fgitlab.com%2Fsoapbox-pub%2Fditto.git).' }),
        ],
      },
      {
        id: 'self-host',
        question: defineMessage({ id: 'help.faq.selfHost.question', defaultMessage: 'Can I self-host {appName}?' }),
        answer: [
          defineMessage({ id: 'help.faq.selfHost.answer1', defaultMessage: 'Yes! Because {appName} is open source, anyone can run their own instance. You get full control over your server, your data, and your community.' }),
          defineMessage({ id: 'help.faq.selfHost.answer2', defaultMessage: 'If you\'re interested, check out the [self-hosting guide](https://about.ditto.pub/self-hosting) to get started.' }),
        ],
      },
      {
        id: 'who-made-this',
        question: defineMessage({ id: 'help.faq.whoMadeThis.question', defaultMessage: 'Who made this?' }),
        answer: [
          defineMessage({ id: 'help.faq.whoMadeThis.answer1', defaultMessage: 'This platform is built by [Soapbox](https://soapbox.pub), a team of developers who believe social media should be owned by its users, not corporations.' }),
          defineMessage({ id: 'help.faq.whoMadeThis.answer2', defaultMessage: 'Soapbox builds open-source tools for the Nostr ecosystem, including {appName} (the server that powers this site). You can learn more about the team and their mission at [soapbox.pub](https://soapbox.pub).' }),
        ],
      },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a single FAQ item for the active locale. */
function formatItem(intl: IntlShape, item: FAQTemplateItem, appName: string): FAQItem {
  return {
    id: item.id,
    question: intl.formatMessage(item.question, { appName }),
    answer: item.answer.map((p) => intl.formatMessage(p, { appName })),
  };
}

/** Format a single category (label, questions and answers). */
function formatCategory(intl: IntlShape, cat: FAQTemplateCategory, appName: string): FAQCategory {
  return {
    id: cat.id,
    label: intl.formatMessage(cat.label, { appName }),
    items: cat.items.map((i) => formatItem(intl, i, appName)),
  };
}

/**
 * Return the full list of FAQ categories, translated for the active locale
 * with `{appName}` resolved to the given `appName`.
 */
export function getFAQCategories(intl: IntlShape, appName: string): FAQCategory[] {
  return FAQ_TEMPLATE.map((c) => formatCategory(intl, c, appName));
}

/** Flat list of every FAQ item, optionally filtered by category ID. */
export function getFAQItems(intl: IntlShape, appName: string, categoryId?: string): FAQItem[] {
  const cats = categoryId
    ? FAQ_TEMPLATE.filter((c) => c.id === categoryId)
    : FAQ_TEMPLATE;
  return cats.flatMap((c) => c.items).map((i) => formatItem(intl, i, appName));
}

/** Look up a single FAQ item by its ID across all categories. */
export function getFAQItem(intl: IntlShape, appName: string, itemId: string): FAQItem | undefined {
  for (const cat of FAQ_TEMPLATE) {
    const found = cat.items.find((i) => i.id === itemId);
    if (found) return formatItem(intl, found, appName);
  }
  return undefined;
}

/** The Team Soapbox follow pack coordinates (kind 39089 addressable event). */
export const TEAM_SOAPBOX_PACK = {
  kind: 39089,
  pubkey: '932614571afcbad4d17a191ee281e39eebbb41b93fac8fd87829622aeb112f4d',
  identifier: 'k4p5w0n22suf',
} as const;
