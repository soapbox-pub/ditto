import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSeoMeta } from '@/hooks/useSeoMeta';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { Bot, Send, Trash2, Palette, Type, Sparkles } from 'lucide-react';

import {
  getWidgetCreationSystemPrompt,
  toolToOpenAI,
  createAIClient,
  ReadCodeTool,
  WriteCodeTool,
  EditCodeTool,
  SearchNIPsTool,
  FetchNIPTool,
  SetTileTool,
  GetTileTool,
  PreviewTileTool,
  AskQuestionsTool,
  SetNotesTool,
  ReadSpecTool,
  ReadExamplesTool,
} from '@soapbox.pub/nostr-canvas/devkit';
import type OpenAI from 'openai';

import { PageHeader } from '@/components/PageHeader';
import { useShakespeare, useShakespeareCredits, type ChatMessage, type Model, type ChatCompletionTool, type ChatCompletionResponse } from '@/hooks/useShakespeare';
import { useChatSessions, type DisplayMessage, type ToolCall, type ChatSession } from '@/hooks/useChatSessions';
import { useAIProviders } from '@/hooks/useAIProviders';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useTheme } from '@/hooks/useTheme';
import { bundledFonts } from '@/lib/fonts';
import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

import { cn } from '@/lib/utils';
import { DorkThinking } from '@/components/DorkThinking';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

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
];

// ─── Tiles Tools ────────────────────────────────────────────────────────────

/**
 * The 12 devkit Tool classes exposed to the model for tiles sessions, converted
 * to OpenAI function-schema shape. Execution of these tools is a later ticket
 * (T10.2); for now a call to one simply falls through to the "Unknown tool"
 * case in `useToolExecutor`.
 *
 * The tool constructors need runtime dependencies (code access, a project id,
 * TIP fetchers). Those are stubbed here because `toolToOpenAI` only reads
 * `description` and `inputSchema` — `execute` is never called this ticket.
 * T10.2 replaces these stubs with the real tool registry wiring.
 */
const TILES_TOOLS: ChatCompletionTool[] = [
  toolToOpenAI('read_code', new ReadCodeTool(() => '')),
  toolToOpenAI('write_code', new WriteCodeTool(() => {})),
  toolToOpenAI('edit_code', new EditCodeTool(() => '', () => {})),
  toolToOpenAI('search_nips', new SearchNIPsTool()),
  toolToOpenAI('fetch_nip', new FetchNIPTool()),
  toolToOpenAI('set_tile', new SetTileTool('ditto', () => '')),
  toolToOpenAI('get_tile', new GetTileTool('ditto')),
  toolToOpenAI('preview_tile', new PreviewTileTool('ditto')),
  toolToOpenAI('ask_questions', new AskQuestionsTool()),
  toolToOpenAI('set_notes', new SetNotesTool(() => {})),
  toolToOpenAI('read_spec', new ReadSpecTool(async () => '')),
  toolToOpenAI('read_examples', new ReadExamplesTool(async () => '')),
].map((tool) => ({
  type: 'function' as const,
  function: {
    ...tool.function,
    parameters: tool.function.parameters ?? {},
  },
}));

// ─── Message Types ───

/** Error from the non-Shakespeare send path. Surfaced as a chat message. */
class ProviderSendError extends Error {}

/** Simple HSL format check: "H S% L%" where H is 0-360, S and L are 0-100%. */
function isValidHsl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return /^\d{1,3}\s+\d{1,3}%\s+\d{1,3}%$/.test(value.trim());
}

function useToolExecutor() {
  const { applyCustomTheme } = useTheme();

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
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  }, [applyCustomTheme]);

  return { executeToolCall };
}

// ─── System Prompt ───

/** Build the system prompt with the configured app name woven in. */
function buildSystemPrompt(appName: string): ChatMessage {
  return {
    role: 'system',
    content: `You are Dork, extraordinaire. You are an AI assistant integrated into ${appName}, a Nostr social client. You can help users with questions, conversations, and tasks.

You have a set_theme tool that applies a full custom theme. It supports:

**Colors** (required): Three HSL values without the "hsl()" wrapper (e.g. "228 20% 10%"):
- background: page background color
- text: main text/foreground color (must contrast well with background)
- primary: accent color for buttons, links, and highlights

**Font** (optional): Choose from bundled fonts to match the theme's mood. Available: ${AVAILABLE_FONTS}

**Background image** (optional): A URL to a publicly accessible image. Set mode to "cover" for full-bleed or "tile" for repeating patterns.

When the user asks to change the theme, be creative — combine colors, fonts, and backgrounds to create a cohesive aesthetic. Always set colors. Add a font when it enhances the mood. Add a background image only when you have a suitable URL or the user requests one.

Be concise and friendly. When you use a tool, briefly describe the theme you created.`,
  };
}

// ─── Page Component ───

export function AIChatPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { sendChatMessage, getAvailableModels, isLoading: apiLoading, error: apiError, retryAfter, clearError } = useShakespeare();
  const hasCredits = useShakespeareCredits();
  const { executeToolCall } = useToolExecutor();
  const { activeSession, activeSessionId, sessions, createSession, setActiveSessionId, updateSession } = useChatSessions();
  const { profiles } = useAIProviders();

  const messages = activeSession.messages;
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
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

        // Default to the cheapest model for the active session.
        if (sorted.length > 0 && !activeSession.modelId) {
          updateSession(activeSessionId, { modelId: sorted[0].fullId });
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
  const buildApiMessages = useCallback((displayMsgs: DisplayMessage[], isTiles: boolean): ChatMessage[] => {
    const systemPrompt = isTiles
      ? getWidgetCreationSystemPrompt({ placement: 'widget' })
      : buildSystemPrompt(config.appName).content;
    const apiMessages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];

    for (const msg of displayMsgs) {
      if (msg.role === 'tool_result') continue; // Tool results are internal
      apiMessages.push({ role: msg.role as 'user' | 'assistant' | 'system', content: msg.content });
    }

    return apiMessages;
  }, [config.appName]);

  /**
   * Send a chat completion for a session, routing to the session's provider.
   * Shakespeare uses the existing NIP-98 flow; any other provider is called
   * through devkit's OpenAI SDK client. Real tool execution remains a later
   * ticket — only the HTTP client is routed here.
   */
  const sendViaSession = useCallback(async (
    apiMessages: ChatMessage[],
    session: ChatSession,
    tools?: ChatCompletionTool[],
  ): Promise<ChatCompletionResponse | OpenAI.Chat.Completions.ChatCompletion> => {
    if (session.providerId === 'shakespeare') {
      return sendChatMessage(apiMessages, session.modelId, tools ? { tools } : undefined);
    }

    const profile = profiles.find((p) => p.id === session.providerId);
    if (!profile) {
      throw new ProviderSendError(`Unknown AI provider: ${session.providerId}. Pick a provider from the list or switch back to Shakespeare.`);
    }

    try {
      const client = await createAIClient({
        id: profile.kind,
        name: profile.name,
        baseURL: profile.baseURL,
        apiKey: profile.apiKey,
        models: [],
      });
      // handleSend only ever produces string content with user/assistant/system
      // roles, which is a subset of the SDK's accepted message shapes.
      return await client.chat.completions.create({
        model: session.modelId,
        messages: apiMessages as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        tools: tools?.length ? tools : undefined,
      });
    } catch (err) {
      throw new ProviderSendError(err instanceof Error ? err.message : String(err));
    }
  }, [profiles, sendChatMessage]);

  // Handle sending a message
  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || !activeSession.modelId || isStreaming) return;

    clearError();
    setInput('');

    const isTiles = activeSession.abilities.includes('tiles');
    // Base tools are always available; the tiles ability bundle is additive.
    const sessionTools = isTiles ? [...TOOLS, ...TILES_TOOLS] : TOOLS;

    const userMessage: DisplayMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    const newMessages = [...messages, userMessage];
    let latestMessages = newMessages;
    updateSession(activeSessionId, { messages: latestMessages });
    setIsStreaming(true);

    try {
      // Build API messages
      const apiMessages = buildApiMessages(newMessages, isTiles);

      // Send through the session's provider
      const response = await sendViaSession(apiMessages, activeSession, sessionTools);

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
        latestMessages = [...newMessages, toolMsg];
        updateSession(activeSessionId, { messages: latestMessages });

        // Build follow-up messages including tool results
        const followUpMessages: ChatMessage[] = buildApiMessages(newMessages, isTiles);

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
        const followUp = await sendViaSession(followUpMessages, activeSession, sessionTools);
        const followUpContent = followUp.choices[0]?.message?.content;

        if (followUpContent) {
          const followUpMsg: DisplayMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: typeof followUpContent === 'string' ? followUpContent : '',
            timestamp: new Date(),
          };
          latestMessages = [...latestMessages, followUpMsg];
          updateSession(activeSessionId, { messages: latestMessages });
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
        latestMessages = [...latestMessages, assistantMessage];
        updateSession(activeSessionId, { messages: latestMessages });
      }
    } catch (err) {
      if (err instanceof ProviderSendError) {
        // Routing/API failures on the non-Shakespeare path have no banner of
        // their own, so surface them inside the conversation.
        const errorMessage: DisplayMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Error: ${err.message}`,
          timestamp: new Date(),
        };
        updateSession(activeSessionId, { messages: [...latestMessages, errorMessage] });
      } else {
        console.error('Chat error:', err);
      }
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, messages, activeSession, activeSessionId, buildApiMessages, sendViaSession, executeToolCall, clearError, updateSession]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // Clear conversation
  const handleClear = useCallback(() => {
    updateSession(activeSessionId, { messages: [] });
    clearError();
  }, [activeSessionId, clearError, updateSession]);

  // ─── Session Controls ───

  // Provider / model selection writes into the active session. Real
  // multi-provider sending is a later ticket; the send path still uses the
  // Shakespeare model picked in the header.
  const handleProviderChange = useCallback((value: string) => {
    let modelId = '';
    if (value === 'shakespeare') {
      // Zero-config: default to the cheapest fetched Shakespeare model.
      modelId = models.length > 0 ? models[0].fullId : '';
    } else {
      const profile = profiles.find((p) => p.id === value);
      modelId = profile?.models[0]?.id ?? '';
    }
    updateSession(activeSessionId, { providerId: value, modelId });
  }, [activeSessionId, models, profiles, updateSession]);

  const handleModelChange = useCallback((value: string) => {
    updateSession(activeSessionId, { modelId: value });
  }, [activeSessionId, updateSession]);

  // Toggling an ability forks a new session carrying over the current
  // provider/model. The new session becomes active automatically.
  const handleTilesToggle = useCallback((checked: boolean | 'indeterminate') => {
    createSession({
      abilities: checked === true ? ['tiles'] : [],
      providerId: activeSession.providerId,
      modelId: activeSession.modelId,
    });
  }, [activeSession.providerId, activeSession.modelId, createSession]);

  const modelOptions = useMemo(() => {
    if (activeSession.providerId === 'shakespeare') {
      return models.map((m) => ({ value: m.fullId, label: m.name }));
    }
    const profile = profiles.find((p) => p.id === activeSession.providerId);
    return (profile?.models ?? []).map((m) => ({ value: m.id, label: m.name }));
  }, [activeSession.providerId, models, profiles]);

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

      {/* Session tabs */}
      <div className="flex items-center gap-1 px-4 pt-2 overflow-x-auto">
        {sessions.map((session, index) => {
          const isActive = session.id === activeSessionId;
          const label = session.abilities.includes('tiles') ? `Tiles ${index + 1}` : `Chat ${index + 1}`;
          return (
            <Button
              key={session.id}
              variant={isActive ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setActiveSessionId(session.id)}
              className={cn('shrink-0 rounded-full text-xs', isActive && 'font-medium')}
            >
              {label}
            </Button>
          );
        })}
      </div>

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
          <div className="max-w-2xl mx-auto">
            {/* Provider / model selector row */}
            <div className="flex items-center gap-2 pb-2">
              <Select value={activeSession.providerId} onValueChange={handleProviderChange}>
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shakespeare">Shakespeare</SelectItem>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={activeSession.modelId} onValueChange={handleModelChange} disabled={modelOptions.length === 0}>
                <SelectTrigger className="h-8 w-48 text-xs">
                  <SelectValue placeholder={modelsLoading ? 'Loading...' : 'Select model'} />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.map((model) => (
                    <SelectItem key={model.value} value={model.value}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end gap-2">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={!activeSession.modelId ? 'Select a model first...' : 'Send a message...'}
                disabled={!activeSession.modelId || isStreaming}
                className="min-h-[44px] max-h-40 resize-none bg-secondary/50 border-border focus-visible:ring-1"
                rows={1}
              />
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'size-11 shrink-0 rounded-xl',
                      activeSession.abilities.includes('tiles') && 'text-primary',
                    )}
                    title="Abilities"
                  >
                    <Sparkles className="size-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Abilities</p>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="ability-tiles"
                      checked={activeSession.abilities.includes('tiles')}
                      onCheckedChange={handleTilesToggle}
                    />
                    <Label htmlFor="ability-tiles" className="font-normal cursor-pointer">Tiles</Label>
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                onClick={handleSend}
                disabled={!input.trim() || !activeSession.modelId || isStreaming}
                size="icon"
                className="size-11 shrink-0 rounded-xl"
              >
                <Send className="size-4" />
              </Button>
            </div>
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
