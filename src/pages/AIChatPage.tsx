import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { Bot, Send, Trash2, Palette, Type } from 'lucide-react';
import type { SettingsField } from '@soapbox.pub/nostr-canvas';

import { PageHeader } from '@/components/PageHeader';
import { useShakespeare, useShakespeareCredits, type ChatMessage, type Model, type ChatCompletionTool } from '@/hooks/useShakespeare';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useTheme } from '@/hooks/useTheme';
import { bundledFonts } from '@/lib/fonts';
import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { cn } from '@/lib/utils';
import { DorkThinking } from '@/components/DorkThinking';
import { TileGenerationCard } from '@/components/ai/TileGenerationCard';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { buildLocalDraftIdentifier } from '@/lib/nostr-canvas/identifiers';
import { putTileDraft } from '@/lib/nostr-canvas/draftStore';

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
    type: 'function',
    function: {
      name: 'preview_tile',
      description: `Generate a nostr-canvas tile and show a live preview inline in the chat. A tile is a small sandboxed Lua 5.4 program that renders inside a host Nostr client: it can react to events, fetch URLs, publish events, sign/encrypt/decrypt, declare settings, and emit a declarative UI tree.

Use this tool when the user asks you to build, generate, prototype, design, or iterate on a tile. The preview renders live; the user can then install or publish the tile from the preview card.

**Lifecycle — the script exposes module-level Lua globals. Do NOT return a table.**

- \`register(rctx)\` — called once at install time. Only \`rctx.register_events(filter, opts)\` and \`rctx.register_nav_item(opts)\` are available. No scripting API, no \`get_scripting_api()\`, no state, no rendering.
- \`init()\` — called once when the tile is instantiated. Full scripting API is available. Set up listeners, subscriptions, timers, initial state here.
- \`render()\` — called whenever a fresh UI tree is needed. Takes **no arguments**. Returns a UI node.
- \`destroy()\` — optional cleanup.

**Scripting API** (available in \`init\`/\`render\`/\`destroy\` only):

\`\`\`lua
local api   = get_scripting_api()
local ctx   = api.ctx
local store = api.store
local util  = api.util
local ui    = api.ui
\`\`\`

**UI constructors (\`api.ui\`)** — build the UI tree only through these. Do NOT return raw \`{ type = "..." }\` tables.

- Containers: \`ui.Stack(children, opts)\`, \`ui.Row(children, opts)\`, \`ui.Scroll(children, opts)\`, \`ui.Spoiler(title, children, opts)\`. \`opts\`: \`align\`, \`justify\`, \`gap\` ("sm"/"md"/"lg"), \`surface\` (boolean), \`id\`.
- Leaves: \`ui.Text(text, opts)\` (opts: \`style\`, \`variant\`, \`text_size\`, \`truncate\`, \`md\`), \`ui.Markdown(content)\`, \`ui.Image(url, opts)\` (opts: \`max_width\`, \`max_height\`, \`avatar\`), \`ui.Button(text, opts)\` (opts: \`variant\`, \`action\`, \`payload\`, \`onclick\`, \`submit_form\`), \`ui.Divider()\`, \`ui.Color(hex)\`, \`ui.NEvent(nip19)\`.
- Forms: \`ui.Form(children, opts)\`, \`ui.Input({ name, label, placeholder, default_value })\`, \`ui.Dropdown({ name, label, options, default_value })\`, \`ui.Checkbox({ name, label, default_value })\`.
- Embed another tile: \`ui.Embedded(identifier, { props, compact })\`.

**\`ctx\` methods:**

- \`ctx.request_render()\` — redraw the tile after state changes.
- \`ctx.get_setting(key)\` → string | nil. Read a declared setting. **Never use \`ctx.settings.<key>\`.**
- \`ctx.on_settings_update(cb)\` → listener id.
- \`ctx.on_input(action, cb)\` → listener id. Handles button clicks where the button was made with \`ui.Button(label, { action = "<action>" })\`. cb receives the button's payload.
- \`ctx.on_form_submit(form_id, cb)\` — cb receives \`{ values = { ... } }\`.
- \`ctx.get_public_key(cb)\` — cb receives \`{ ok, pubkey }\`.
- \`ctx.request_profile(pubkey, cb)\` — cb receives \`(pubkey, metadata_table)\`.
- \`ctx.request_cache(filter)\` — filter looks like \`{ kinds = {1}, authors = {...}, limit = 20 }\`.
- \`ctx.on_relevant_event(cb)\` — cb receives an event for filters from past \`request_cache\` calls.
- \`ctx.fetch({ url, method, headers, body }, cb)\` — HTTPS only; cb receives \`{ ok, status, body, error }\`.
- \`ctx.publish_event(event, cb)\`, \`ctx.request_sign(event, cb)\`, \`ctx.nip44_encrypt(pubkey, plaintext, cb)\`, \`ctx.nip44_decrypt(pubkey, ciphertext, cb)\`.
- \`ctx.navigate(target, cb)\` — \`target\` is a nip19 pointer string or \`{ identifier = "<tile_id>", props = {...} }\`.
- \`ctx.show_toast(message, variant)\`, \`ctx.show_modal(opts, cb)\`.
- \`ctx.set_timeout(cb, ms)\` → id, \`ctx.clear_timeout(id)\`.
- \`ctx.emit(type, payload)\`, \`ctx.on(type, cb)\`, \`ctx.on_our(type, cb)\`, \`ctx.off(type, id)\`.
- \`ctx.identifier\`, \`ctx.placement\` ("widget" | "event" | "main"), \`ctx.props\`.

**\`store\`** (values are strings):

\`store.get(key)\`, \`store.set(key, value)\`, \`store.delete(key)\`, plus helpers \`store.get_number(key, default)\`, \`store.set_number(key, value)\`, \`store.get_json(key)\`, \`store.set_json(key, value)\`.

**\`util\`:** \`util.encode_json(v)\`, \`util.decode_json(s)\`, \`util.format_time(epoch_sec)\`, \`util.resolve_handle(pubkey)\`, \`util.debug(v)\`.

**Settings:** declared via this tool's \`settings\` parameter (not in Lua), read with \`ctx.get_setting("<key>")\`. Types: \`text\`, \`boolean\` (stored as \`"true"\`/\`"false"\`), \`dropdown\` (stored as the selected value string).

**Rules — follow strictly:**

- Use ONLY the functions, fields, and constructors listed in this description. If a helper isn't listed above, it does not exist — do not invent, guess, or extrapolate. No \`ctx.set_output\`, no \`ctx.settings.*\`, no \`ctx.request(capability, ...)\`, no \`render(props, settings, ctx)\` signature, no raw \`{ type = "stack" }\` tables.
- The script MUST expose \`init\` and \`render\` as module-level globals. Do NOT return a table from the script.
- \`render()\` takes no arguments. Mutate state from \`init\` callbacks (listeners, fetches, timers, input handlers), then call \`ctx.request_render()\`.
- \`register()\` runs in a restricted environment. Do not call \`get_scripting_api()\` or any \`ctx\`/\`store\`/\`util\`/\`ui\` function inside it.
- Keep the script self-contained and syntactically valid Lua 5.4.

**Identifier:** supply a short lowercase \`slug\` (letters, digits, hyphens). The runtime builds a draft identifier from the user's pubkey.`,
      parameters: {
        type: 'object' as const,
        properties: {
          slug: {
            type: 'string',
            description: 'Short lowercase slug for the tile, letters/digits/hyphens only (e.g. "weather", "pomodoro", "mood-tracker"). Becomes part of the tile identifier.',
          },
          name: {
            type: 'string',
            description: 'Human-friendly display name shown in the install UI (e.g. "Weather", "Pomodoro Timer").',
          },
          summary: {
            type: 'string',
            description: 'One-line plain-text summary of what the tile does. Shown in the browse list and above the preview.',
          },
          description: {
            type: 'string',
            description: 'Optional longer markdown description shown on the tile detail page. Use this to document features and how to use the tile.',
          },
          image_url: {
            type: 'string',
            description: 'Optional URL to a banner/icon image for the tile. Must be a direct link to a publicly accessible image file.',
          },
          source: {
            type: 'string',
            description: 'The full Lua source code for the tile. Must be syntactically valid Lua that returns a table with at least a `render` function.',
          },
          settings: {
            type: 'array',
            description: 'Optional list of settings fields the tile declares. Each becomes a configurable value under the tile\'s settings panel.',
            items: {
              type: 'object',
              properties: {
                key: { type: 'string', description: 'Setting key (used as `ctx.get_setting("<key>")` inside Lua).' },
                label: { type: 'string', description: 'Human-readable label shown in the settings UI.' },
                type: { type: 'string', enum: ['text', 'boolean', 'dropdown'], description: 'Field type.' },
                default: { type: 'string', description: 'Default value (string form; booleans accept "true"/"false").' },
                options: {
                  type: 'array',
                  description: 'For dropdown fields only: list of {label, value} options.',
                  items: {
                    type: 'object',
                    properties: {
                      label: { type: 'string' },
                      value: { type: 'string' },
                    },
                    required: ['label', 'value'],
                  },
                },
              },
              required: ['key', 'label', 'type'],
            },
          },
        },
        required: ['slug', 'name', 'summary', 'source'],
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

function useToolExecutor() {
  const { applyCustomTheme } = useTheme();
  const { user } = useCurrentUser();

  const executeToolCall = useCallback((name: string, args: Record<string, unknown>): string => {
    switch (name) {
      case 'set_theme': {
        const { background, text, primary, font, background_url, background_mode } = args;

        // Validate required color values
        if (!isValidHsl(background) || !isValidHsl(text) || !isValidHsl(primary)) {
          return JSON.stringify({
            error: 'Invalid HSL color values. Each must be a string like "228 20% 10%".',
            received: { background, text, primary },
          });
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
            return JSON.stringify({
              error: `Unknown font "${font}". Available fonts: ${AVAILABLE_FONTS}`,
            });
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
        const result: Record<string, unknown> = {
          success: true,
          colors: { background, text, primary },
        };
        if (themeConfig.font) result.font = themeConfig.font.family;
        if (themeConfig.background) result.background = { url: themeConfig.background.url, mode: themeConfig.background.mode };

        return JSON.stringify(result);
      }
      case 'preview_tile': {
        if (!user) {
          return JSON.stringify({ error: 'You must be logged in to generate tiles.' });
        }

        const { slug, name: tileName, summary, description, image_url, source, settings } = args;

        if (typeof slug !== 'string' || !slug.trim()) {
          return JSON.stringify({ error: 'Missing required field: slug.' });
        }
        if (typeof tileName !== 'string' || !tileName.trim()) {
          return JSON.stringify({ error: 'Missing required field: name.' });
        }
        if (typeof summary !== 'string' || !summary.trim()) {
          return JSON.stringify({ error: 'Missing required field: summary.' });
        }
        if (typeof source !== 'string' || !source.trim()) {
          return JSON.stringify({ error: 'Missing required field: source.' });
        }

        const identifier = buildLocalDraftIdentifier(user.pubkey, slug);

        // Only keep an image URL if it's a well-formed https URL.
        let safeImage: string | undefined;
        if (typeof image_url === 'string' && image_url.trim()) {
          const sanitized = sanitizeUrl(image_url.trim());
          if (sanitized) safeImage = sanitized;
        }

        // Parse + validate the settings array. The Lua runtime expects a
        // `SettingsField[]` shape; anything weird is dropped.
        const safeSettings: SettingsField[] = [];
        if (Array.isArray(settings)) {
          for (const raw of settings) {
            if (!raw || typeof raw !== 'object') continue;
            const entry = raw as Record<string, unknown>;
            const key = typeof entry.key === 'string' ? entry.key : '';
            const label = typeof entry.label === 'string' ? entry.label : '';
            const type = entry.type;
            if (!key || !label) continue;
            if (type === 'text') {
              safeSettings.push({
                key,
                label,
                type: 'text',
                default: typeof entry.default === 'string' ? entry.default : undefined,
              });
            } else if (type === 'boolean') {
              const def =
                typeof entry.default === 'boolean'
                  ? entry.default
                  : entry.default === 'true'
                  ? true
                  : entry.default === 'false'
                  ? false
                  : undefined;
              safeSettings.push({ key, label, type: 'boolean', default: def });
            } else if (type === 'dropdown' && Array.isArray(entry.options)) {
              const options = entry.options
                .map((opt) => {
                  if (!opt || typeof opt !== 'object') return null;
                  const o = opt as Record<string, unknown>;
                  if (typeof o.label !== 'string' || typeof o.value !== 'string') return null;
                  return { label: o.label, value: o.value };
                })
                .filter((o): o is { label: string; value: string } => o !== null);
              if (options.length === 0) continue;
              safeSettings.push({
                key,
                label,
                type: 'dropdown',
                options,
                default: typeof entry.default === 'string' ? entry.default : undefined,
              });
            }
          }
        }

        putTileDraft({
          identifier,
          name: tileName,
          summary,
          description: typeof description === 'string' ? description : undefined,
          image: safeImage,
          script: source,
          settings: safeSettings,
        });

        return JSON.stringify({
          success: true,
          identifier,
          name: tileName,
          summary,
        });
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  }, [applyCustomTheme, user]);

  return { executeToolCall };
}

// ─── System Prompt ───

/** Build the system prompt with the configured app name woven in. */
function buildSystemPrompt(appName: string): ChatMessage {
  return {
    role: 'system',
    content: `You are Dork, extraordinaire. You are an AI assistant integrated into ${appName}, a Nostr social client. You can help users with questions, conversations, and tasks.

You have two tools:

**set_theme** — apply a full custom theme.
- Colors (required): Three HSL values without the "hsl()" wrapper (e.g. "228 20% 10%"):
  - background: page background color
  - text: main text/foreground color (must contrast well with background)
  - primary: accent color for buttons, links, and highlights
- Font (optional): Choose from bundled fonts to match the theme's mood. Available: ${AVAILABLE_FONTS}
- Background image (optional): A URL to a publicly accessible image. Set mode to "cover" for full-bleed or "tile" for repeating patterns.

When the user asks to change the theme, be creative — combine colors, fonts, and backgrounds to create a cohesive aesthetic. Always set colors. Add a font when it enhances the mood. Add a background image only when you have a suitable URL or the user requests one.

**preview_tile** — generate a nostr-canvas tile and show a live preview inline. Tiles are small sandboxed Lua 5.4 programs that render a declarative UI tree inside the host client. Use this when the user asks you to build, design, prototype, or iterate on a tile.

Guidelines for writing tiles:
- Tile scripts expose **module-level Lua globals**: \`register(rctx)\` (install-time declarations, no scripting API), \`init()\` (one-shot setup, full API), \`render()\` → UI node (no arguments), and optional \`destroy()\`. **Do NOT** return a table from the script and **do NOT** define \`render(props, settings, ctx)\` — that signature is not valid.
- Inside \`init\`/\`render\`/\`destroy\`, reach the API via \`local api = get_scripting_api()\` and pull out \`api.ctx\`, \`api.store\`, \`api.util\`, \`api.ui\`. The tool description has the authoritative crib sheet — follow it exactly.
- Build UI with \`ui.Stack\`, \`ui.Row\`, \`ui.Text\`, \`ui.Markdown\`, \`ui.Image\`, \`ui.Button\`, \`ui.Form\`, \`ui.Input\`, \`ui.Dropdown\`, \`ui.Checkbox\`, \`ui.Spoiler\`, \`ui.Divider\`, \`ui.NEvent\`, \`ui.Embedded\`. Don't emit raw \`{ type = "stack", ... }\` tables.
- Handle button clicks via \`ctx.on_input("<action>", cb)\` inside \`init\`, where the button was created with \`ui.Button(label, { action = "<action>" })\`. Trigger a redraw with \`ctx.request_render()\`.
- Read settings with \`ctx.get_setting("<key>")\` (never \`ctx.settings.<key>\`). Settings are declared via the \`settings\` array parameter of this tool.
- Persist per-user state with \`store.get\`/\`store.set\` (strings) or \`store.get_number\`/\`store.set_number\`/\`store.get_json\`/\`store.set_json\`.
- Use \`ctx.fetch({ url, method, headers }, cb)\` for HTTPS requests; \`ctx.publish_event(event, cb)\` / \`ctx.request_sign(event, cb)\` for signing; \`ctx.nip44_encrypt\`/\`ctx.nip44_decrypt\` for encrypted content.
- Keep it self-contained, syntactically valid Lua. Pick a short lowercase slug, a friendly name, and a one-line summary.

When you use a tool, briefly describe what you did. After preview_tile, the preview is shown inline; let the user iterate before installing.

Be concise and friendly.`,
  };
}

// ─── Page Component ───

export function AIChatPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { sendChatMessage, getAvailableModels, isLoading: apiLoading, error: apiError, retryAfter, clearError } = useShakespeare();
  const hasCredits = useShakespeareCredits();
  const { executeToolCall } = useToolExecutor();

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
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
      .then((modelsResponse) => {
        if (cancelled) return;

        const sorted = modelsResponse.data.sort((a, b) => {
          const costA = parseFloat(a.pricing.prompt) + parseFloat(a.pricing.completion);
          const costB = parseFloat(b.pricing.prompt) + parseFloat(b.pricing.completion);
          return costA - costB;
        });

        setModels(sorted);

        // Default to the cheapest model
        if (sorted.length > 0 && !selectedModel) {
          setSelectedModel(sorted[0].fullId);
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
    const apiMessages: ChatMessage[] = [buildSystemPrompt(config.appName)];

    for (const msg of displayMsgs) {
      if (msg.role === 'tool_result') continue; // Tool results are internal
      apiMessages.push({ role: msg.role as 'user' | 'assistant' | 'system', content: msg.content });
    }

    return apiMessages;
  }, [config.appName]);

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
      // Build API messages
      const apiMessages = buildApiMessages(newMessages);

      // Send with tools
      const response = await sendChatMessage(apiMessages, selectedModel, {
        tools: TOOLS,
      });

      const choice = response.choices[0];
      const assistantMsg = choice.message;

      if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
        // Execute tool calls
        const toolCalls: ToolCall[] = assistantMsg.tool_calls.map((tc) => {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments);
          } catch {
            // If parsing fails, pass empty args
          }

          const result = executeToolCall(tc.function.name, args);

          return {
            id: tc.id,
            name: tc.function.name,
            arguments: args,
            result,
          };
        });

        // Add assistant message with tool calls noted
        const toolMsg: DisplayMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
           content: assistantMsg.content || '',
          timestamp: new Date(),
          toolCalls,
        };
        const messagesWithTool = [...newMessages, toolMsg];
        setMessages(messagesWithTool);

        // Build follow-up messages including tool results
        const followUpMessages: ChatMessage[] = buildApiMessages(newMessages);

        // Add the assistant message with tool_calls
        followUpMessages.push({
          role: 'assistant',
          content: assistantMsg.content || '',
        });

        // Add tool results
        for (const tc of toolCalls) {
          followUpMessages.push({
            role: 'user' as const,
            content: `[Tool "${tc.name}" returned: ${tc.result}]`,
          });
        }

        // Get follow-up response from AI
        const followUp = await sendChatMessage(followUpMessages, selectedModel);
        const followUpContent = followUp.choices[0]?.message?.content;

        if (followUpContent) {
          const followUpMsg: DisplayMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: typeof followUpContent === 'string' ? followUpContent : '',
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, followUpMsg]);
        }
      } else {
        // Normal response without tool calls
        const content = typeof assistantMsg.content === 'string' ? assistantMsg.content : '';
        const assistantMessage: DisplayMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
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
    clearError();
  }, [clearError]);

  // ─── Render ───

  if (!user) {
    return (
      <main className="flex flex-col items-center justify-center p-6 gap-6">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <pre className="text-4xl font-mono text-primary leading-none">{'<[o_o]>'}</pre>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Dork AI</h1>
            <p className="text-muted-foreground">Log in with your Nostr account to start chatting with Dork.</p>
          </div>
          <LoginArea className="mt-2" />
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col ai-chat-height sidebar:h-dvh overflow-hidden">
      {/* Header */}
      <PageHeader titleContent={
        <div className="hidden sidebar:flex items-center gap-2 flex-1 min-w-0">
          <Bot className="size-5" />
          <h1 className="text-xl font-bold truncate">AI Chat</h1>
        </div>
      }>
        {hasCredits && (
          <div className="flex items-center gap-2 ml-auto">
            {/* Model selector */}
            <Select value={selectedModel} onValueChange={setSelectedModel} disabled={modelsLoading}>
              <SelectTrigger className="w-48 h-8 text-xs">
                <SelectValue placeholder={modelsLoading ? 'Loading...' : 'Select model'} />
              </SelectTrigger>
              <SelectContent>
                {models.map((model) => (
                  <SelectItem key={model.fullId} value={model.fullId}>
                    {model.name}
                  </SelectItem>
                ))}
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
        )}
      </PageHeader>

      {/* Messages Area */}
      {messages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-4">
          <EmptyState hasCredits={hasCredits} />
        </div>
      ) : (
        <ScrollArea className="flex-1" ref={scrollRef}>
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* Loading indicator */}
            {(isStreaming || apiLoading) && messages[messages.length - 1]?.role === 'user' && (
              <DorkThinking className="text-sm" />
            )}

            {/* Error display */}
            {apiError && (
              retryAfter ? (
                <DorkErrorBanner
                  face=">[~_~]<"
                  heading="Whoa, slow down! Dork needs a breather."
                  body="You're sending messages a bit too fast. Want more brainpower? Grab some credits on"
                />
              ) : apiError.includes('run out of credits') ? (
                <DorkErrorBanner
                  face=">[o_o]<"
                  heading="You've run out of credits!"
                  body="Grab some more on"
                />
              ) : (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-3">
                  {apiError}
                </div>
              )
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      )}

      {/* Input Area — hidden when user has no credits */}
      {(hasCredits || hasCredits === null) && (
        <div className="shrink-0 px-4 pt-2 pb-4 sidebar:pb-3">
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
      )}
    </main>
  );
}

// ─── Sub-Components ───

// DorkThinking is imported from the shared component

function DorkErrorBanner({ face, heading, body }: { face: string; heading: string; body: string }) {
  const shakespeareLink = (
    <a
      href="https://shakespeare.diy"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-primary hover:underline"
    >
      <span>&#x1F3AD;</span>
      <span>Shakespeare</span>
    </a>
  );

  return (
    <div className="rounded-2xl bg-secondary/60 border border-border px-4 py-4 text-sm space-y-2">
      <p className="font-medium text-foreground">
        <code className="text-base font-mono text-primary leading-none whitespace-pre">{face}</code>
        {' '}{heading}
      </p>
      <p className="text-muted-foreground">
        {body} {shakespeareLink} to keep chatting with Dork.
      </p>
    </div>
  );
}

const DORK_GREETINGS = [
  "Hi, I'm Dork! What would you like me to do?",
  "Dork here! What do you need?",
  "Hey, it's Dork! What do you want to do?",
];

function EmptyState({ hasCredits }: { hasCredits: boolean | null }) {
  const greeting = useMemo(() => DORK_GREETINGS[Math.floor(Math.random() * DORK_GREETINGS.length)], []);

  return (
    <div className="flex flex-col items-center justify-center gap-8 text-center select-none animate-in fade-in duration-500">
      <pre className="text-4xl font-mono text-primary leading-none">{'<[o_o]>'}</pre>
      <div className="space-y-2">
        <h2 className="text-base font-semibold tracking-tight text-foreground">Dork AI</h2>
        <p className="text-sm text-muted-foreground">{greeting}</p>
      </div>
      {hasCredits === false && (
        <div className="flex flex-col items-center gap-4 max-w-xs">
          <p className="text-sm text-muted-foreground leading-relaxed">
            You need credits to chat with Dork. Grab some on Shakespeare to get started.
          </p>
          <a
            href="https://shakespeare.diy"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <span>&#x1F3AD;</span>
            Get Credits
          </a>
        </div>
      )}
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
    identifier?: string;
    name?: string;
    summary?: string;
  } = {};
  try {
    resultParsed = JSON.parse(toolCall.result || '{}');
  } catch {
    // ignore
  }

  const isSuccess = resultParsed.success === true;

  // Inline tile preview — render the full generation card instead of a badge.
  if (toolCall.name === 'preview_tile') {
    if (!isSuccess || !resultParsed.identifier) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-500/20">
          {resultParsed.error ?? 'Tile preview failed'}
        </span>
      );
    }
    return (
      <TileGenerationCard
        draftIdentifier={resultParsed.identifier}
        className="w-full mt-1"
      />
    );
  }

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
