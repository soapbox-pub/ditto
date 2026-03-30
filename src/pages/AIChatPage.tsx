import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { Bot, Send, Trash2, Palette, Type } from 'lucide-react';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { useNostr } from '@nostrify/react';

import { NoteCard } from '@/components/NoteCard';
import { PageHeader } from '@/components/PageHeader';
import { useQuery } from '@tanstack/react-query';
import { useShakespeare, type ChatMessage, type Model, type ChatCompletionTool } from '@/hooks/useShakespeare';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useTheme } from '@/hooks/useTheme';
import { bundledFonts } from '@/lib/fonts';
import { LoginArea } from '@/components/auth/LoginArea';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { cn } from '@/lib/utils';
import { DorkThinking } from '@/components/DorkThinking';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

import type { NostrEvent } from '@nostrify/nostrify';
import type { ThemeConfig } from '@/themes';

// ─── Tool Definitions ───

/** Build the list of available bundled font names for the tool description. */
const AVAILABLE_FONTS = bundledFonts.map((f) => f.family).join(', ');

const TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
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
- "photos from people I follow" → authors: ["$contacts"], kinds: [20]
- "articles mentioning nostr" → kinds: [30023], search: "nostr"`,
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
        },
        required: ['name'],
      },
    },
  },
];

// ─── Message Types ───

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool_result';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  /** A Nostr event published by a tool, rendered inline in the chat. */
  nostrEvent?: NostrEvent;
}

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
}

// ─── Tool Executor Hook ───

/** Simple HSL format check: "H S% L%" where H is 0-360, S and L are 0-100%. */
function isValidHsl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return /^\d{1,3}\s+\d{1,3}%\s+\d{1,3}%$/.test(value.trim());
}

/** Build the kind:777 tags array from create_spell tool arguments. */
function buildSpellTags(args: Record<string, unknown>): string[][] {
  const tags: string[][] = [];

  if (typeof args.name === 'string') tags.push(['name', args.name]);

  const cmd = typeof args.cmd === 'string' ? args.cmd : 'REQ';
  tags.push(['cmd', cmd]);

  if (Array.isArray(args.kinds)) {
    for (const k of args.kinds) {
      if (typeof k === 'number') tags.push(['k', String(k)]);
    }
  }

  if (Array.isArray(args.authors)) {
    tags.push(['authors', ...(args.authors as string[])]);
  }

  if (Array.isArray(args.tag_filters)) {
    for (const tf of args.tag_filters as Array<{ letter: string; values: string[] }>) {
      if (tf.letter && Array.isArray(tf.values)) {
        tags.push(['tag', tf.letter, ...tf.values]);
      }
    }
  }

  if (typeof args.since === 'string') tags.push(['since', args.since]);
  if (typeof args.until === 'string') tags.push(['until', args.until]);
  if (typeof args.limit === 'number') tags.push(['limit', String(args.limit)]);
  if (typeof args.search === 'string') tags.push(['search', args.search]);

  if (Array.isArray(args.relays) && args.relays.length > 0) {
    tags.push(['relays', ...(args.relays as string[])]);
  }

  tags.push(['alt', `Spell: ${args.name ?? 'unnamed'}`]);

  return tags;
}

interface ToolExecutorResult {
  /** JSON string returned to the AI as the tool result. */
  result: string;
  /** A Nostr event published by the tool, to be rendered inline in the chat. */
  nostrEvent?: NostrEvent;
}

function useToolExecutor() {
  const { applyCustomTheme } = useTheme();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  const executeToolCall = useCallback(async (name: string, args: Record<string, unknown>): Promise<ToolExecutorResult> => {
    switch (name) {
      case 'set_theme': {
        const { background, text, primary, font, background_url, background_mode } = args;

        // Validate required color values
        if (!isValidHsl(background) || !isValidHsl(text) || !isValidHsl(primary)) {
          return { result: JSON.stringify({
            error: 'Invalid HSL color values. Each must be a string like "228 20% 10%".',
            received: { background, text, primary },
          }) };
        }

        // Build theme config
        const themeConfig: ThemeConfig = {
          colors: {
            background: background as string,
            text: text as string,
            primary: primary as string,
          },
        };

        // Add font if provided
        if (typeof font === 'string' && font.trim()) {
          const bundled = bundledFonts.find((f) => f.family.toLowerCase() === font.trim().toLowerCase());
          if (bundled) {
            themeConfig.font = { family: bundled.family };
          } else {
            return { result: JSON.stringify({
              error: `Unknown font "${font}". Available fonts: ${AVAILABLE_FONTS}`,
            }) };
          }
        }

        // Add background if provided (sanitize to prevent CSS injection via url())
        if (typeof background_url === 'string' && background_url.trim()) {
          const safeUrl = sanitizeUrl(background_url.trim());
          if (safeUrl) {
            themeConfig.background = {
              url: safeUrl,
              mode: background_mode === 'tile' ? 'tile' : 'cover',
            };
          }
        }

        applyCustomTheme(themeConfig);

        // Build result summary
        const resultData: Record<string, unknown> = {
          success: true,
          colors: { background, text, primary },
        };
        if (themeConfig.font) resultData.font = themeConfig.font.family;
        if (themeConfig.background) resultData.background = { url: themeConfig.background.url, mode: themeConfig.background.mode };

        return { result: JSON.stringify(resultData) };
      }

      case 'search_users': {
        try {
          const query = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
          if (!query) {
            return { result: JSON.stringify({ error: 'A search query is required.' }) };
          }

          interface ProfileMatch {
            pubkey: string;
            name?: string;
            display_name?: string;
            nip05?: string;
            about?: string;
            source: 'contacts' | 'relay';
          }

          const matches: ProfileMatch[] = [];

          // Phase 1: Search user's contacts
          if (user) {
            const contactEvents = await nostr.query(
              [{ kinds: [3], authors: [user.pubkey], limit: 1 }],
              { signal: AbortSignal.timeout(5000) },
            );

            const contactPubkeys = contactEvents[0]?.tags
              .filter(([t]) => t === 'p')
              .map(([, pk]) => pk) ?? [];

            if (contactPubkeys.length > 0) {
              // Fetch metadata for contacts in batches
              const batchSize = 100;
              for (let i = 0; i < contactPubkeys.length && matches.length < 5; i += batchSize) {
                const batch = contactPubkeys.slice(i, i + batchSize);
                const metaEvents = await nostr.query(
                  [{ kinds: [0], authors: batch }],
                  { signal: AbortSignal.timeout(8000) },
                );

                for (const event of metaEvents) {
                  try {
                    const meta = JSON.parse(event.content);
                    const name = (meta.name || '').toLowerCase();
                    const displayName = (meta.display_name || '').toLowerCase();
                    const nip05 = (meta.nip05 || '').toLowerCase();

                    if (name.includes(query) || displayName.includes(query) || nip05.includes(query)) {
                      matches.push({
                        pubkey: event.pubkey,
                        name: meta.name,
                        display_name: meta.display_name,
                        nip05: meta.nip05,
                        about: meta.about ? meta.about.slice(0, 100) : undefined,
                        source: 'contacts',
                      });
                    }
                  } catch {
                    // Skip events with invalid metadata JSON
                  }
                }
              }
            }
          }

          // Phase 2: NIP-50 relay search (if contacts didn't yield enough results)
          if (matches.length < 3) {
            try {
              const searchEvents = await nostr.query(
                [{ kinds: [0], search: args.query as string, limit: 10 }],
                { signal: AbortSignal.timeout(8000) },
              );

              const existingPubkeys = new Set(matches.map((m) => m.pubkey));

              for (const event of searchEvents) {
                if (existingPubkeys.has(event.pubkey)) continue;
                try {
                  const meta = JSON.parse(event.content);
                  matches.push({
                    pubkey: event.pubkey,
                    name: meta.name,
                    display_name: meta.display_name,
                    nip05: meta.nip05,
                    about: meta.about ? meta.about.slice(0, 100) : undefined,
                    source: 'relay',
                  });
                } catch {
                  // Skip events with invalid metadata JSON
                }
              }
            } catch {
              // NIP-50 search may not be supported by all relays
            }
          }

          // Return top 5
          const results = matches.slice(0, 5);

          if (results.length === 0) {
            return { result: JSON.stringify({ matches: [], message: `No users found matching "${args.query}". The user may need to provide an npub or NIP-05 address.` }) };
          }

          return { result: JSON.stringify({ matches: results }) };
        } catch (err) {
          return { result: JSON.stringify({ error: `Search failed: ${err instanceof Error ? err.message : 'Unknown error'}` }) };
        }
      }

      case 'create_spell': {
        try {
          if (typeof args.name !== 'string' || !args.name.trim()) {
            return { result: JSON.stringify({ error: 'A spell name is required.' }) };
          }

          const tags = buildSpellTags(args);
          const content = typeof args.description === 'string' ? args.description : '';

          // Generate ephemeral keypair
          const sk = generateSecretKey();
          const pubkey = getPublicKey(sk);

          // Finalize and sign with ephemeral key
          const spellEvent = finalizeEvent({
            kind: 777,
            content,
            tags,
            created_at: Math.floor(Date.now() / 1000),
          }, sk) as NostrEvent;

          // Publish a minimal kind:0 profile so the ephemeral key has an identity
          const profileEvent = finalizeEvent({
            kind: 0,
            content: JSON.stringify({ name: 'Dork Spellcaster', about: 'Spells created by Dork AI' }),
            tags: [],
            created_at: Math.floor(Date.now() / 1000),
          }, sk) as NostrEvent;

          await Promise.all([
            nostr.event(profileEvent, { signal: AbortSignal.timeout(5000) }),
            nostr.event(spellEvent, { signal: AbortSignal.timeout(5000) }),
          ]);

          return {
            result: JSON.stringify({
              success: true,
              event_id: spellEvent.id,
              pubkey,
              name: args.name,
            }),
            nostrEvent: spellEvent,
          };
        } catch (err) {
          return { result: JSON.stringify({
            error: `Failed to publish spell: ${err instanceof Error ? err.message : 'Unknown error'}`,
          }) };
        }
      }

      default:
        return { result: JSON.stringify({ error: `Unknown tool: ${name}` }) };
    }
  }, [applyCustomTheme, nostr, user]);

  return { executeToolCall };
}

// ─── System Prompt ───

const SYSTEM_PROMPT: ChatMessage = {
  role: 'system',
  content: `You are Dork, extraordinaire. You are an AI assistant integrated into Ditto, a Nostr social client. You can help users with questions, conversations, and tasks.

You have a set_theme tool that applies a full custom theme. It supports:

**Colors** (required): Three HSL values without the "hsl()" wrapper (e.g. "228 20% 10%"):
- background: page background color
- text: main text/foreground color (must contrast well with background)
- primary: accent color for buttons, links, and highlights

**Font** (optional): Choose from bundled fonts to match the theme's mood. Available: ${AVAILABLE_FONTS}

**Background image** (optional): A URL to a publicly accessible image. Set mode to "cover" for full-bleed or "tile" for repeating patterns.

When the user asks to change the theme, be creative — combine colors, fonts, and backgrounds to create a cohesive aesthetic. Always set colors. Add a font when it enhances the mood. Add a background image only when you have a suitable URL or the user requests one.

You also have a create_spell tool that creates Nostr spells (NIP-A7) — saved queries that act as custom feeds. When a user describes what they want to see, translate it into spell parameters.

**How spells work:**
- A spell is a kind:777 event encoding a Nostr relay filter
- The user can click the spell to run it and see results, then add it to their sidebar for quick access
- Spells are published with an ephemeral key, not the user's identity

**Runtime variables** (resolved when the spell runs, not when created):
- "$me" — the logged-in user's pubkey
- "$contacts" — all pubkeys from the user's kind:3 follow list

**Relative timestamps** (subtracted from now at execution time):
- "24h", "7d", "2w", "1mo", "3mo", "1y", etc.

**Common kinds:**
- 1 = text notes, 6 = reposts, 7 = reactions, 20 = photos
- 30023 = articles, 9735 = zap receipts, 5 = deletions, 30402 = classifieds

**Tag filters vs search:**
- Use search for broad topic matching in content text (e.g. search: "bitcoin")
- Use tag_filters with letter "t" for hashtag filtering (e.g. #bitcoin, #nostr)
- Note: search relies on NIP-50 relay support; hashtags are more universally supported

**Translation examples:**
- "feed of my friends talking about bitcoin" → authors: ["$contacts"], kinds: [1], search: "bitcoin"
- "posts tagged nostr and dev" → kinds: [1], tag_filters: [{letter: "t", values: ["nostr", "dev"]}]
- "my mass deletions" → authors: ["$me"], kinds: [5]
- "photos from people I follow" → authors: ["$contacts"], kinds: [20]
- "articles about nostr from the past month" → kinds: [30023], search: "nostr", since: "1mo"
- "zaps this week" → kinds: [9735], since: "7d"
- "what I've been posting lately" → authors: ["$me"], kinds: [1], since: "30d"

Keep spell names short and descriptive (2-4 words). When you create a spell, briefly explain what it will show.

You also have a search_users tool for resolving names to Nostr pubkeys. When a user mentions a specific person by name (e.g. "Derek Ross", "fiatjaf"), use search_users to find their pubkey before creating a spell that references them. The search checks the user's contacts first, then does a broader relay search. If multiple matches are found, ask the user to confirm which one they meant. Use the hex pubkey from the results directly in the spell's authors array.

Be concise and friendly. When you use a tool, briefly describe what you created.`,
};

// ─── Chat Persistence ───

const CHAT_STORAGE_KEY = 'ditto:ai-chat-messages';

/** Serialized shape stored in localStorage (Date → ISO string). */
interface StoredMessage extends Omit<DisplayMessage, 'timestamp'> {
  timestamp: string;
}

function loadMessages(): DisplayMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return [];
    const stored: StoredMessage[] = JSON.parse(raw);
    return stored.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }));
  } catch {
    return [];
  }
}

function saveMessages(messages: DisplayMessage[]): void {
  try {
    const stored: StoredMessage[] = messages.map((m) => ({ ...m, timestamp: m.timestamp.toISOString() }));
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

// ─── Page Component ───

export function AIChatPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { sendChatMessage, getAvailableModels, getCredits, isLoading: apiLoading, error: apiError, clearError } = useShakespeare();
  const { executeToolCall } = useToolExecutor();

  const [messages, setMessages] = useState<DisplayMessage[]>(loadMessages);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [modelsLoading, setModelsLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useSeoMeta({
    title: `AI Chat | ${config.appName}`,
    description: 'Chat with AI assistant',
  });

  useLayoutOptions({ noOverscroll: true });

  // Persist messages to localStorage
  useEffect(() => {
    saveMessages(messages);
  }, [messages]);

  // Scroll to bottom on new messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Fetch available models on mount
  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    setModelsLoading(true);

    getAvailableModels()
      .then((response) => {
        if (cancelled) return;
        const sorted = response.data.sort((a, b) => {
          const costA = parseFloat(a.pricing.prompt) + parseFloat(a.pricing.completion);
          const costB = parseFloat(b.pricing.prompt) + parseFloat(b.pricing.completion);
          return costA - costB;
        });
        setModels(sorted);
        if (sorted.length > 0 && !selectedModel) {
          setSelectedModel(sorted[0].id);
        }
      })
      .catch((err) => {
        if (!cancelled) console.error('Failed to fetch models:', err);
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });

    return () => { cancelled = true; };
  }, [user, getAvailableModels]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build the chat messages array for the API (includes system prompt + conversation history)
  const buildApiMessages = useCallback((displayMsgs: DisplayMessage[]): ChatMessage[] => {
    const apiMessages: ChatMessage[] = [SYSTEM_PROMPT];

    for (const msg of displayMsgs) {
      if (msg.role === 'tool_result') continue; // Tool results are internal
      apiMessages.push({ role: msg.role as 'user' | 'assistant' | 'system', content: msg.content });
    }

    return apiMessages;
  }, []);

  // Handle sending a message
  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || !selectedModel || isStreaming) return;

    clearError();
    setInput('');

    const userMessage: DisplayMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setIsStreaming(true);

    try {
      const MAX_TOOL_ROUNDS = 10;
      let apiMessages = buildApiMessages(newMessages);
      let currentMessages = newMessages;

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        // Send with tools
        const response = await sendChatMessage(apiMessages, selectedModel, {
          tools: TOOLS,
        });

        const choice = response.choices[0];
        const assistantMsg = choice.message;

        if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
          // No tool calls — final text response, done
          const content = typeof assistantMsg.content === 'string' ? assistantMsg.content : '';
          const assistantMessage: DisplayMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
          break;
        }

        // Execute tool calls
        let nostrEvent: NostrEvent | undefined;
        const toolCalls: ToolCall[] = [];

        for (const tc of assistantMsg.tool_calls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments);
          } catch {
            // If parsing fails, pass empty args
          }

          const execResult = await executeToolCall(tc.function.name, args);

          if (execResult.nostrEvent) {
            nostrEvent = execResult.nostrEvent;
          }

          toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            arguments: args,
            result: execResult.result,
          });
        }

        // Add assistant message with tool calls to display
        const toolMsg: DisplayMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
           content: assistantMsg.content || '',
          timestamp: new Date(),
          toolCalls,
          nostrEvent,
        };
        currentMessages = [...currentMessages, toolMsg];
        setMessages(currentMessages);

        // Build follow-up messages with tool results for the next round
        apiMessages = buildApiMessages(currentMessages);

        // Add the assistant message that contained tool_calls
        apiMessages.push({
          role: 'assistant',
          content: assistantMsg.content || '',
        });

        // Add tool results
        for (const tc of toolCalls) {
          apiMessages.push({
            role: 'user' as const,
            content: `[Tool "${tc.name}" returned: ${tc.result}]`,
          });
        }

        // Loop continues — next iteration sends follow-up with tools available
      }
    } catch (err) {
      console.error('Chat error:', err);
    } finally {
      setIsStreaming(false);
    }
  }, [input, selectedModel, isStreaming, messages, buildApiMessages, sendChatMessage, executeToolCall, clearError]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // Clear conversation
  const handleClear = useCallback(() => {
    setMessages([]);
    localStorage.removeItem(CHAT_STORAGE_KEY);
    clearError();
  }, [clearError]);

  // ─── Render ───

  if (!user) {
    return (
      <main className="flex flex-col items-center justify-center p-6 gap-6">
        <div className="flex flex-col items-center gap-3 text-center max-w-sm">
          <div className="size-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Bot className="size-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">AI Chat</h1>
          <p className="text-muted-foreground">Log in with your Nostr account to start chatting with AI.</p>
          <LoginArea className="mt-2" />
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-secondary/50 sidebar:h-dvh">
      {/* Header */}
      <div className="shrink-0 px-4 py-2.5 flex flex-col gap-2 sidebar:flex-row sidebar:items-center sidebar:justify-between sidebar:gap-3">
        <PageHeader title="AI Chat" icon={<Bot className="size-5" />} className="px-0 mt-0 mb-0" />

        <div className="flex items-center gap-2">
          <CreditsBadge getCredits={getCredits} />
          {/* Model selector */}
          <Select value={selectedModel} onValueChange={setSelectedModel} disabled={modelsLoading}>
            <SelectTrigger className="h-8 w-full text-base md:text-xs sidebar:w-44">
              <SelectValue placeholder={modelsLoading ? 'Loading models...' : 'Select model'} />
            </SelectTrigger>
            <SelectContent>
              {models.map((model) => {
                const totalCost = parseFloat(model.pricing.prompt) + parseFloat(model.pricing.completion);
                const isFree = totalCost === 0;
                return (
                  <SelectItem key={model.id} value={model.id}>
                    <span className="flex items-center gap-1.5">
                      {model.name}
                      {isFree && (
                        <span className="text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-500/10 px-1 rounded">
                          FREE
                        </span>
                      )}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={handleClear}
            disabled={messages.length === 0}
            title="Clear conversation"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="min-h-0 flex-1" ref={scrollRef}>
        <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-end px-4 py-4">
          <div className="space-y-6">
          {messages.length === 0 ? (
            <EmptyState />
          ) : (
            messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))
          )}

          {/* Loading indicator */}
          {(isStreaming || apiLoading) && messages[messages.length - 1]?.role === 'user' && (
            <DorkThinking className="text-sm" />
          )}

          {/* Error display */}
          {apiError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-3">
              {apiError}
            </div>
          )}

          <div ref={messagesEndRef} />
          </div>
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="shrink-0 px-4 pb-[calc(1rem+var(--bottom-nav-height)+env(safe-area-inset-bottom,0px))] pt-3 sidebar:p-4">
        <div className="max-w-2xl mx-auto flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={!selectedModel ? 'Select a model first...' : 'Send a message...'}
            disabled={!selectedModel || isStreaming}
            className="min-h-[44px] max-h-40 resize-none bg-secondary/50 border-border focus-visible:ring-1"
            rows={1}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || !selectedModel || isStreaming}
            size="icon"
            className="size-11 shrink-0 rounded-xl"
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </main>
  );
}

// ─── Sub-Components ───

// DorkThinking is imported from the shared component

const DORK_GREETINGS = [
  "Hi, I'm Dork! What would you like me to do?",
  "Dork here! What do you need?",
  "Hey, it's Dork! What do you want to do?",
];

function EmptyState() {
  const greeting = useMemo(() => DORK_GREETINGS[Math.floor(Math.random() * DORK_GREETINGS.length)], []);

  return (
    <div className="flex flex-col items-center justify-center py-20 gap-8 text-center select-none animate-in fade-in duration-500">
      <pre className="text-4xl font-mono text-primary leading-none">{'<[o_o]>'}</pre>
      <div className="space-y-2">
        <h2 className="text-base font-semibold tracking-tight text-foreground">Dork AI</h2>
        <p className="text-sm text-muted-foreground">{greeting}</p>
      </div>
    </div>
  );
}



function MessageBubble({ message }: { message: DisplayMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex items-start', isUser && 'justify-end')}>
      <div className={cn('flex flex-col gap-1 max-w-[85%] min-w-0', isUser && 'items-end')}>
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm',
            isUser
              ? 'bg-primary text-primary-foreground rounded-tr-md'
              : 'bg-secondary/60 border border-border rounded-tl-md',
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          ) : (
            <div className="prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-2 prose-code:text-xs prose-a:text-primary">
              <Markdown rehypePlugins={[rehypeSanitize]}>
                {message.content}
              </Markdown>
            </div>
          )}
        </div>

        {/* Inline Nostr event (e.g. a spell created by a tool) */}
        {message.nostrEvent && (
          <div className="w-full rounded-xl overflow-hidden border border-border mt-1">
            <NoteCard event={message.nostrEvent} compact />
          </div>
        )}

        {/* Tool call indicators */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {message.toolCalls.map((tc) => (
              <ToolCallBadge key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        <span className="text-[10px] text-muted-foreground/60 px-1">
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}

function ToolCallBadge({ toolCall }: { toolCall: ToolCall }) {
  let resultParsed: {
    success?: boolean;
    error?: string;
    colors?: { background?: string; text?: string; primary?: string };
    font?: string;
    background?: { url?: string; mode?: string };
  } = {};
  try {
    resultParsed = JSON.parse(toolCall.result || '{}');
  } catch {
    // ignore
  }

  const isSuccess = resultParsed.success === true;
  const colors = resultParsed.colors;

  if (toolCall.name !== 'set_theme' || !isSuccess) {
    return (
      <span className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium',
        isSuccess
          ? 'bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20'
          : 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-500/20',
      )}>
        <Palette className="size-3" />
        {resultParsed.error || toolCall.name}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-medium bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20">
      {/* Color swatches */}
      {colors && (
        <span className="flex items-center gap-0.5">
          <span className="size-2.5 rounded-full border border-black/10" style={{ backgroundColor: `hsl(${colors.background})` }} />
          <span className="size-2.5 rounded-full border border-black/10" style={{ backgroundColor: `hsl(${colors.text})` }} />
          <span className="size-2.5 rounded-full border border-black/10" style={{ backgroundColor: `hsl(${colors.primary})` }} />
        </span>
      )}
      Theme applied
      {resultParsed.font && (
        <span className="inline-flex items-center gap-0.5 opacity-80">
          <Type className="size-2.5" />
          {resultParsed.font}
        </span>
      )}
    </span>
  );
}

function CreditsBadge({ getCredits }: { getCredits: () => Promise<{ amount: number }> }) {
  const { data, isLoading } = useQuery({
    queryKey: ['shakespeare-credits'],
    queryFn: getCredits,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const formatted = data?.amount != null
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(data.amount)
    : null;

  return (
    <Badge variant="secondary" className="text-xs tabular-nums shrink-0">
      {isLoading ? '...' : formatted ?? '--'}
    </Badge>
  );
}
