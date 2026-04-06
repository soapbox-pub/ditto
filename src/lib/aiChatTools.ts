import { bundledFonts } from '@/lib/fonts';
import type { NostrEvent } from '@nostrify/nostrify';

// ─── Font list for tool descriptions ───

/** Build the list of available bundled font names for the tool description. */
const AVAILABLE_FONTS = bundledFonts.map((f) => f.family).join(', ');

// Re-export for use in tool executor
export { AVAILABLE_FONTS };

// ─── Message Types ───

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool_result';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  /** For tool_result messages: the tool_call_id this result corresponds to. */
  toolCallId?: string;
  /** A Nostr event published by a tool, rendered inline in the chat. */
  nostrEvent?: NostrEvent;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
}

/** Result returned by a tool executor. */
export interface ToolExecutorResult {
  /** JSON string returned to the AI as the tool result. */
  result: string;
  /** A Nostr event published by the tool, to be rendered inline in the chat. */
  nostrEvent?: NostrEvent;
}

// ─── Tool Definitions ───

export const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'set_theme',
      description: `Set a custom theme for the application. You can set colors, a font, and a background image — all in one call. Colors are required; font and background are optional.

Color values must be HSL strings WITHOUT the "hsl()" wrapper — just raw values like "228 20% 10%". Choose colors that work well together and ensure good contrast between background and text.

For fonts, choose from the available bundled fonts: ${AVAILABLE_FONTS}. Pick a font that matches the mood of the theme.

For backgrounds, provide a URL to a publicly accessible image. Choose images that complement the color scheme. Use mode "cover" for full-bleed backgrounds or "tile" for repeating patterns.`,
      parameters: {
        type: 'object' as const,
        properties: {
          background: {
            type: 'string',
            description: 'Background color as an HSL string (e.g. "228 20% 10%" for dark blue, "0 0% 100%" for white). This is the main page background.',
          },
          text: {
            type: 'string',
            description: 'Text/foreground color as an HSL string (e.g. "210 40% 98%" for near-white, "0 0% 10%" for near-black). Must contrast well with the background.',
          },
          primary: {
            type: 'string',
            description: 'Primary accent color as an HSL string (e.g. "258 70% 60%" for purple, "142 70% 45%" for green). Used for buttons, links, and interactive elements.',
          },
          font: {
            type: 'string',
            description: `Optional font family name. Must be one of the available bundled fonts: ${AVAILABLE_FONTS}. Choose a font that matches the theme's mood and aesthetic.`,
          },
          background_url: {
            type: 'string',
            description: 'Optional URL to a background image. Should be a direct link to a publicly accessible image file (JPEG, PNG, WebP, etc.).',
          },
          background_mode: {
            type: 'string',
            description: 'How to display the background image. "cover" fills the viewport (good for photos/landscapes). "tile" repeats the image (good for patterns/textures). Defaults to "cover".',
            enum: ['cover', 'tile'],
          },
        },
        required: ['background', 'text', 'primary'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_users',
      description: `Search for Nostr users by name. Returns matching profiles with their pubkeys, display names, NIP-05 identifiers, and bios. Use this when you need to resolve a person's name to their Nostr pubkey — for example, when creating a spell that targets a specific author.

The search checks the user's follow list first (contacts), then falls back to a broader relay search. Results from contacts are prioritized since they're more likely to be the person the user means.`,
      parameters: {
        type: 'object' as const,
        properties: {
          query: {
            type: 'string',
            description: 'The name or display name to search for (e.g. "Derek Ross", "fiatjaf", "jb55").',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_follow_packs',
      description: `Search for Nostr follow packs by title. Follow packs (kind 39089) are curated lists of people. Use this when the user mentions a follow pack or starter pack by name — for example, "team soapbox pack" or "bitcoin developers pack".

Returns matching packs with their title, description, member count, and the hex pubkeys of all members. Use the returned pubkeys directly in the spell's authors array to create a feed based on the pack's members.`,
      parameters: {
        type: 'object' as const,
        properties: {
          query: {
            type: 'string',
            description: 'The follow pack title to search for (e.g. "team soapbox", "bitcoin developers", "nostr OGs").',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_spell',
      description: `Create a Nostr spell — a saved query that acts as a custom feed. The spell is published as a kind:777 event and can be added to the sidebar for quick access.

Spells define a Nostr relay filter with optional runtime variables that resolve when executed:
- "$me" expands to the logged-in user's pubkey
- "$contacts" expands to the user's follow list (kind:3 contacts)

Timestamps can be relative durations subtracted from now: "7d" (7 days ago), "2w" (2 weeks), "1mo" (1 month), "1y" (1 year), "24h" (24 hours), or "now" for the current time.

Examples:
- "friends talking about bitcoin" → authors: ["$contacts"], tag_filters: [{letter: "t", values: ["bitcoin"]}]
- "my mass deletions" → authors: ["$me"], kinds: [5]
- "popular zap receipts this week" → kinds: [9735], since: "7d"
- "photos from people I follow" → authors: ["$contacts"], kinds: [20], media: "images"
- "trending posts this week" → since: "7d", sort: "trending"
- "articles mentioning nostr" → kinds: [30023], search: "nostr"
- "english posts from follows" → authors: ["$contacts"], language: "en"`,
      parameters: {
        type: 'object' as const,
        properties: {
          name: {
            type: 'string',
            description: 'Short human-readable name for the spell (e.g. "fren bitcoin", "my mass deletions").',
          },
          description: {
            type: 'string',
            description: 'Optional longer description of what the spell does.',
          },
          cmd: {
            type: 'string',
            description: 'Command type. "REQ" returns matching events as a feed (default). "COUNT" returns just the count of matches.',
            enum: ['REQ', 'COUNT'],
          },
          kinds: {
            type: 'array',
            items: { type: 'number' },
            description: 'Event kind numbers to filter (e.g. [1] for text notes, [20] for photos, [30023] for articles, [9735] for zap receipts).',
          },
          authors: {
            type: 'array',
            items: { type: 'string' },
            description: 'Author filter. Use "$me" for the logged-in user, "$contacts" for their follow list, or hex pubkeys.',
          },
          tag_filters: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                letter: { type: 'string', description: 'Single-letter tag name (e.g. "t" for hashtags, "e" for event references, "p" for pubkey references).' },
                values: { type: 'array', items: { type: 'string' }, description: 'Tag values to match. Supports "$me" and "$contacts" variables.' },
              },
              required: ['letter', 'values'],
            },
            description: 'Tag-based filters. Each entry becomes a #<letter> filter in the Nostr query.',
          },
          since: {
            type: 'string',
            description: 'Only include events after this time. Accepts relative durations ("7d", "2w", "1mo", "1y", "24h") or "now".',
          },
          until: {
            type: 'string',
            description: 'Only include events before this time. Same format as since.',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return.',
          },
          search: {
            type: 'string',
            description: 'Full-text search query (NIP-50). Filters events by content text.',
          },
          relays: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific relay WebSocket URLs to query (e.g. ["wss://relay.damus.io"]). If omitted, uses the user\'s default relays.',
          },
          media: {
            type: 'string',
            description: 'Media filter. "images" = only posts with images, "videos" = only videos, "vines" = short-form video, "none" = text only. Omit for all content.',
            enum: ['all', 'images', 'videos', 'vines', 'none'],
          },
          language: {
            type: 'string',
            description: 'Language filter (ISO 639-1 code, e.g. "en", "ja", "es"). Only returns posts in this language. Requires Ditto relay.',
          },
          platform: {
            type: 'string',
            description: 'Protocol filter. "nostr" = native Nostr only (default), "activitypub" = bridged from ActivityPub, "atproto" = bridged from AT Protocol.',
            enum: ['nostr', 'activitypub', 'atproto'],
          },
          sort: {
            type: 'string',
            description: 'Sort order. "recent" = newest first (default), "hot" = trending recently, "trending" = most popular. Non-recent sorts require Ditto relay.',
            enum: ['recent', 'hot', 'trending'],
          },
          include_replies: {
            type: 'boolean',
            description: 'Whether to include reply posts. Default true. Set false to exclude replies and show only top-level posts.',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'fetch_page',
      description: `Fetch a web page and extract its content. Returns the page text and a list of image URLs found on the page. Use this when the user provides a URL and wants to download content from it — for example, to find emoji images on a page.

The page is fetched through a CORS proxy so it works in the browser. Images are extracted from <img> tags in the HTML. Relative URLs are resolved to absolute URLs.`,
      parameters: {
        type: 'object' as const,
        properties: {
          url: {
            type: 'string',
            description: 'The URL to fetch (e.g. "https://www.jamfoo.com/aim-emoticons/").',
          },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'upload_from_url',
      description: `Download images from URLs and upload them to Blossom file servers. Returns the resulting Blossom URLs.

Use this after fetch_page to upload discovered images. Each image is fetched via CORS proxy, converted to a File, and uploaded to Blossom. The user must be logged in.

Handles up to 50 images per call. Returns an array of objects with the original URL, the Blossom URL, and a suggested shortcode derived from the filename.`,
      parameters: {
        type: 'object' as const,
        properties: {
          urls: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of image URLs to download and upload (max 50).',
          },
        },
        required: ['urls'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_emoji_pack',
      description: `Create and publish a NIP-30 custom emoji pack (kind 30030 event). The pack is published as the logged-in user.

Takes a pack name and an array of emoji entries (shortcode + image URL). Shortcodes must be alphanumeric with hyphens and underscores only. The image URLs should be Blossom URLs from a prior upload_from_url call.

After publishing, the emoji pack appears in the user's feed and can be added to their emoji collection.`,
      parameters: {
        type: 'object' as const,
        properties: {
          name: {
            type: 'string',
            description: 'Human-readable name for the emoji pack (e.g. "AIM Emoticons", "Retro Smileys").',
          },
          emojis: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                shortcode: { type: 'string', description: 'Shortcode for the emoji (alphanumeric, hyphens, underscores). E.g. "smiley", "heart-eyes".' },
                url: { type: 'string', description: 'URL to the emoji image (should be a Blossom URL).' },
              },
              required: ['shortcode', 'url'],
            },
            description: 'Array of emoji entries to include in the pack.',
          },
        },
        required: ['name', 'emojis'],
      },
    },
  },
];


