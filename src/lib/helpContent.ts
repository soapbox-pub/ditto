/**
 * Structured FAQ content for the Help section.
 *
 * This module is the single source of truth for all Help/FAQ data.
 * Any page can import `FAQ_CATEGORIES` or use `getFAQItems()` to render
 * a full FAQ or a filtered subset (e.g. only "payments" questions on a
 * wallet settings page).
 */

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
  description?: string;
  items: FAQItem[];
}

// ── Data ──────────────────────────────────────────────────────────────────────

export const FAQ_CATEGORIES: FAQCategory[] = [
  // ── Getting Started ─────────────────────────────────────────────────────
  {
    id: 'getting-started',
    label: 'Getting Started',
    items: [
      {
        id: 'what-is-ditto',
        question: 'What is Ditto?',
        answer: [
          'Ditto is a social media platform built on Nostr \u2014 a new kind of open, decentralized network. Think of Ditto as the app you\'re using right now to connect with people, post, and discover content.',
          'Because Ditto is built on Nostr, your account isn\'t locked to this site. You own your identity and can take it to any other Nostr app. Learn more at [soapbox.pub/ditto](https://soapbox.pub/ditto).',
        ],
      },
      {
        id: 'what-is-nostr',
        question: 'What is Nostr?',
        answer: [
          'Nostr is a new kind of social network where **you** own your account, not a company. Think of it like email \u2014 you can use different apps, but your identity stays the same. Nobody can ban you from the entire network.',
          'Everything you post, every person you follow, and your entire identity is portable. You can take it with you anywhere. To learn more, check out [Nostr 101](https://soapbox.pub/blog/nostr101).',
        ],
      },
      {
        id: 'login-other-apps',
        question: 'Can I log into other Nostr apps with my Ditto account?',
        answer: [
          'Yes! Your Ditto account **is** a Nostr account. You can use the same keys to log into any Nostr app \u2014 Primal, Damus, Amethyst, Coracle, and many more. Your posts, followers, and profile carry over everywhere.',
          'Explore the full range of Nostr apps at [nostrapps.com](https://nostrapps.com/).',
        ],
      },
      {
        id: 'why-login-different',
        question: 'Why is my sign-in so different and long?',
        answer: [
          'Instead of a username and password controlled by a company, Nostr uses a pair of cryptographic keys \u2014 like a really secure digital ID.',
          'Your "public key" (starts with **npub**) is your username that everyone can see. Your "secret key" (starts with **nsec**) is your password. The long string of characters is what makes it virtually impossible to hack.',
        ],
      },
      {
        id: 'lose-secret-key',
        question: 'What happens if I lose my secret key?',
        answer: [
          '**There is no "forgot password" button.** No company stores your key or can reset it for you. If you lose it, your account is gone forever.',
          'This is the tradeoff for true ownership \u2014 nobody can take your account away, but nobody can recover it either. **Save your secret key somewhere safe right now.** For tips on keeping your key safe, read [Managing Your Nostr Keys](https://soapbox.pub/blog/managing-nostr-keys).',
        ],
      },
      {
        id: 'manage-secret-key',
        question: 'Can I save my secret key in my phone\'s password manager?',
        answer: [
          'Yes! You can save it in your device\'s password manager (like iCloud Keychain, 1Password, or Bitwarden). On iPhone, if you save it correctly in Passwords, you can even use Face ID or Touch ID to log in.',
          'For a full guide on the best ways to store and manage your keys, check out [Managing Your Nostr Keys](https://soapbox.pub/blog/managing-nostr-keys).',
        ],
      },
      {
        id: 'cost-to-use',
        question: 'Does Ditto cost anything?',
        answer: [
          '**Nope!** Ditto is completely free to use. Zaps (tips) are optional and just for fun. There are no premium tiers, no paywalls, no hidden fees.',
        ],
      },
      {
        id: 'beginner-guide',
        question: 'Is there a step-by-step guide for getting started?',
        answer: [
          'You\'re looking at it! This Help section covers everything you need. Start by saving your secret key, then explore your feed, follow some people, and try posting.',
          'Don\'t worry about getting everything perfect \u2014 you can always come back here.',
        ],
      },
    ],
  },

  // ── Apps & Access ───────────────────────────────────────────────────────
  {
    id: 'apps-access',
    label: 'Apps & Access',
    items: [
      {
        id: 'download-app',
        question: 'Can I download this on the App Store or Google Play?',
        answer: [
          'This site works as a web app right from your browser \u2014 no download needed! You can also "Add to Home Screen" on your phone to get an app-like experience.',
          'Native app store releases are planned for the future \u2014 stay tuned!',
        ],
      },
      {
        id: 'one-account-many-apps',
        question: 'Can I use my account on other apps?',
        answer: [
          'Yes! That\'s one of the best things about Nostr. Your account isn\'t locked to any single app.',
          'You can take your keys to Primal, Damus, Amethyst, Coracle, or any other Nostr app and everything carries over \u2014 your posts, your followers, all of it.',
        ],
      },
      {
        id: 'nostr-app-store',
        question: 'Is there a Nostr-specific app store?',
        answer: [
          'Yes! [Zap Store](https://zapstore.dev/) is a community-driven app store built specifically for the Nostr ecosystem. You can discover and download Nostr apps, and the apps are verified by the community rather than a corporation.',
          'You can also browse a directory of Nostr apps at [nostrapps.com](https://nostrapps.com/).',
        ],
      },
    ],
  },

  // ── Payments & Zaps ─────────────────────────────────────────────────────
  {
    id: 'payments',
    label: 'Payments & Zaps',
    items: [
      {
        id: 'what-are-zaps',
        question: 'What are zaps?',
        answer: [
          'Zaps are tips! They let you send tiny amounts of Bitcoin to someone as a way of saying "great post" or "thanks."',
          'Think of it like a super-powered Like button that actually sends real money. They use the Lightning Network, which makes them instant and nearly free. To learn more, check out [Understanding Zaps](https://nostr.how/en/zaps).',
        ],
      },
      {
        id: 'connect-wallet',
        question: 'How do I connect a wallet?',
        answer: [
          'To send or receive zaps, you need a Lightning wallet. Great options for beginners include [Alby](https://getalby.com/), [Zeus](https://zeusln.com/), and [Wallet of Satoshi](https://www.walletofsatoshi.com/).',
          'Once you have one, add your Lightning address to your profile settings, and you\'re ready to go.',
        ],
      },
      {
        id: 'only-bitcoin',
        question: 'Can I only use Bitcoin, or can I use regular money?',
        answer: [
          'Zaps use Bitcoin\'s Lightning Network. If you don\'t have Bitcoin, you can skip zaps entirely \u2014 they\'re completely optional.',
          'If you\'re curious, most Lightning wallets let you buy small amounts of Bitcoin right inside the app.',
        ],
      },
    ],
  },

  // ── Content & Safety ────────────────────────────────────────────────────
  {
    id: 'content-safety',
    label: 'Content & Safety',
    items: [
      {
        id: 'fyp',
        question: 'Will I have a "For You" page? How do I make my feed relevant?',
        answer: [
          'Your feed shows posts from people you follow \u2014 there\'s no algorithm deciding what you see. The more people you follow, the better your feed gets.',
          'Use the "Trends" page to discover popular content, and check out Follow Packs (curated groups of people) to quickly fill your feed with interesting voices.',
        ],
      },
      {
        id: 'what-are-relays',
        question: 'What are relays?',
        answer: [
          'Relays are the servers that store and deliver your posts. Think of them like different mail carriers \u2014 your messages get sent through them to reach other people.',
          'You don\'t need to think about relays to use Nostr; the defaults work great. But if you\'re curious, you can add or remove relays in Settings > Network.',
          'Using multiple relays means your content is backed up in more places, making it harder for anyone to silence you. To dive deeper, read [Understanding Nostr Relays](https://nostr.how/en/relays).',
        ],
      },
      {
        id: 'what-are-blossom',
        question: 'What are Blossom servers?',
        answer: [
          'Blossom servers are where your media files (photos, videos, audio) get stored when you upload them. Think of them like cloud storage for your files.',
          'Different Blossom servers are run by different people in different places. You can manage which servers you use in Settings > Network. To learn more about how Blossom works, read [The Blossom Protocol](https://onnostr.substack.com/p/the-blossom-protocol-supercharging).',
        ],
      },
      {
        id: 'media-content',
        question: 'What happens to media I upload? Can it be removed?',
        answer: [
          'When you upload media to Nostr, it gets stored on a Blossom server. That server has the right to remove any content for any reason, including based on the laws of their region.',
          'This is why it\'s important to use multiple Blossom servers, manage your server connections, and make informed choices about where you store your data.',
        ],
      },
      {
        id: 'report-content',
        question: 'How do I report harmful content?',
        answer: [
          'To report a post, tap the three-dot menu (**...**) on any post and select "Report." You can also mute or block individual users from the same menu.',
          'Because Nostr is decentralized, there\'s no single company reviewing reports \u2014 but relay operators can choose to remove content from their servers, and your mute list keeps your feed clean for you.',
        ],
      },
      {
        id: 'terms-of-service',
        question: 'Are there terms of service I need to agree to?',
        answer: [
          'Nostr itself is a protocol (like email or the web) \u2014 it doesn\'t have terms of service. Individual relays and apps may have their own rules.',
          'Since no single entity controls the network, the community largely self-moderates. Think of it less like a walled garden and more like the open internet.',
        ],
      },
    ],
  },

  // ── Why is this different from Big Tech? ────────────────────────────────
  {
    id: 'big-tech',
    label: 'Why Is This Different from Big Tech?',
    items: [
      {
        id: 'why-different',
        question: 'How is this different from Instagram, X, or Facebook?',
        answer: [
          'On traditional social media, a company owns your account, controls what you see, and can delete your profile at any time.',
          'On Nostr, **you** own your identity. No company can lock you out, shadowban you, or shut down your account. Your followers, your posts, and your identity belong to you \u2014 not a corporation. We take this seriously \u2014 read our [ethics pledge](https://soapbox.pub/ethics) to see what we stand for.',
        ],
      },
      {
        id: 'vs-mastodon-bluesky',
        question: 'How is this different from Mastodon or Bluesky?',
        answer: [
          'Mastodon and Bluesky are also alternatives to Big Tech, but they work very differently from Nostr. On Mastodon, your account is tied to a specific server \u2014 if that server shuts down or bans you, you lose your account and have to start over. On Bluesky, the network is technically decentralized but in practice almost everyone depends on a single company (bsky.social), which can block entire servers.',
          'Nostr is different because your identity is a cryptographic key that **you** control. It\'s not tied to any server, company, or app. No one can delete your account, and you can switch between apps freely while keeping your followers and posts.',
          'The good news is you don\'t have to choose just one \u2014 bridges like Mostr let you follow people across all three networks. For a deeper comparison, check out [Nostr vs. Fediverse vs. Bluesky](https://soapbox.pub/blog/comparing-protocols).',
        ],
      },
      {
        id: 'what-is-decentralization',
        question: 'What does "decentralized" actually mean?',
        answer: [
          'It means there\'s no single company or server running everything. Nostr is a network of independent relays and apps, all speaking the same language.',
          'If one relay goes down or kicks you off, your account still works everywhere else. It\'s like the difference between one company owning all the roads vs. having thousands of independent roads anyone can build and use. For more on why this matters, read [The Future Is Decentralized](https://soapbox.pub/blog/future-is-decentralized).',
        ],
      },
      {
        id: 'censorship-resistance',
        question: 'What does "censorship-resistant" mean?',
        answer: [
          'It means no single person, company, or government can stop you from posting.',
          'On traditional platforms, one decision by a content moderation team can erase your entire online presence. On Nostr, as long as there\'s at least one relay willing to host your content, you can keep posting. You may lose reach on some relays, but you can never be fully silenced.',
        ],
      },
      {
        id: 'open-source',
        question: 'What does "open source" mean, and why does it matter?',
        answer: [
          'Open source means the code that powers this app is publicly available for anyone to read, verify, and improve. There are no hidden algorithms, no secret data collection, and no backdoors.',
          'Anyone can check exactly what the software does. It\'s the digital equivalent of a restaurant with a glass kitchen \u2014 nothing to hide. You can browse the [Ditto source code](https://gitlab.com/soapbox-pub/ditto) yourself, or if you want to try editing Ditto, you can jump right in with [Shakespeare](https://shakespeare.diy/clone?url=https%3A%2F%2Fgitlab.com%2Fsoapbox-pub%2Fditto.git).',
        ],
      },
      {
        id: 'self-host',
        question: 'Can I self-host Ditto?',
        answer: [
          'Yes! Because Ditto is open source, anyone can run their own instance. You get full control over your server, your data, and your community.',
          'If you\'re interested, check out the [self-hosting guide](https://about.ditto.pub/guides/self-hosting) to get started.',
        ],
      },
      {
        id: 'who-made-this',
        question: 'Who made this?',
        answer: [
          'This platform is built by [Soapbox](https://soapbox.pub), a team of developers who believe social media should be owned by its users, not corporations.',
          'Soapbox builds open-source tools for the Nostr ecosystem, including Ditto (the server that powers this site). You can learn more about the team and their mission at [soapbox.pub](https://soapbox.pub).',
        ],
      },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Flat list of every FAQ item, optionally filtered by category ID. */
export function getFAQItems(categoryId?: string): FAQItem[] {
  const cats = categoryId
    ? FAQ_CATEGORIES.filter((c) => c.id === categoryId)
    : FAQ_CATEGORIES;
  return cats.flatMap((c) => c.items);
}

/** Look up a single FAQ item by its ID across all categories. */
export function getFAQItem(itemId: string): FAQItem | undefined {
  for (const cat of FAQ_CATEGORIES) {
    const found = cat.items.find((i) => i.id === itemId);
    if (found) return found;
  }
  return undefined;
}

/** The Team Soapbox follow pack coordinates (kind 39089 addressable event). */
export const TEAM_SOAPBOX_PACK = {
  kind: 39089,
  pubkey: '932614571afcbad4d17a191ee281e39eebbb41b93fac8fd87829622aeb112f4d',
  identifier: 'k4p5w0n22suf',
} as const;
