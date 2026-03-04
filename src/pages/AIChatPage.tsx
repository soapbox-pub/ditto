import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { Bot, Send, Sparkles, Trash2, Palette, Type } from 'lucide-react';

import { useShakespeare, type ChatMessage, type Model } from '@/hooks/useShakespeare';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useTheme } from '@/hooks/useTheme';
import { bundledFonts } from '@/lib/fonts';
import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import type { ThemeConfig } from '@/themes';

// ─── Tool Definitions ───

/** Build the list of available bundled font names for the tool description. */
const AVAILABLE_FONTS = bundledFonts.map((f) => f.family).join(', ');

const TOOLS = [
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

        // Add background if provided
        if (typeof background_url === 'string' && background_url.trim()) {
          themeConfig.background = {
            url: background_url.trim(),
            mode: background_mode === 'tile' ? 'tile' : 'cover',
          };
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

Be concise and friendly. When you use a tool, briefly describe the theme you created.`,
};

// ─── Page Component ───

export function AIChatPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { sendChatMessage, getAvailableModels, isLoading: apiLoading, error: apiError, clearError } = useShakespeare();
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
      // Build API messages
      const apiMessages = buildApiMessages(newMessages);

      // Send with tools
      const response = await sendChatMessage(apiMessages, selectedModel, {
        tools: TOOLS,
      } as Partial<Record<string, unknown>>);

      const choice = response.choices[0];
      const assistantMsg = choice.message;

      // Check for tool calls
      const rawMessage = assistantMsg as unknown as {
        content?: string;
        tool_calls?: Array<{
          id: string;
          function: { name: string; arguments: string };
        }>;
      };

      if (rawMessage.tool_calls && rawMessage.tool_calls.length > 0) {
        // Execute tool calls
        const toolCalls: ToolCall[] = rawMessage.tool_calls.map((tc) => {
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
          content: rawMessage.content || '',
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
          content: rawMessage.content || '',
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
    <main className="flex flex-col ai-chat-height sidebar:h-dvh">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-background/80 backdrop-blur-md px-4 py-3 flex flex-col sidebar:flex-row sidebar:items-center sidebar:justify-between gap-2 sidebar:gap-3">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="size-4 text-primary" />
          </div>
          <h1 className="font-semibold text-lg">AI Chat</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Model selector */}
          <Select value={selectedModel} onValueChange={setSelectedModel} disabled={modelsLoading}>
            <SelectTrigger className="w-full sidebar:w-44 h-8 text-xs">
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
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          {messages.length === 0 ? (
            <EmptyState />
          ) : (
            messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))
          )}

          {/* Loading indicator */}
          {(isStreaming || apiLoading) && messages[messages.length - 1]?.role === 'user' && (
            <div className="flex items-start gap-3">
              <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="size-4 text-primary" />
              </div>
              <div className="space-y-2 pt-1">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
          )}

          {/* Error display */}
          {apiError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-3">
              {apiError}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="shrink-0 border-t border-border bg-background p-4">
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

const DORK_GREETINGS = [
  "Hi, I'm Dork! What would you like me to do?",
  "Dork here! What do you need?",
  "Hey, it's Dork! What do you want to do?",
];

function EmptyState() {
  const greeting = useMemo(() => DORK_GREETINGS[Math.floor(Math.random() * DORK_GREETINGS.length)], []);

  return (
    <div className="flex flex-col items-center justify-center py-20 gap-8 text-center select-none animate-in fade-in duration-500">
      <div className="relative">
        <div className="absolute -inset-6 rounded-full bg-primary/[0.06] blur-2xl" />
        <div className="relative size-24 rounded-2xl bg-gradient-to-b from-primary/15 to-primary/5 border border-primary/10 flex items-center justify-center shadow-sm">
          <pre className="text-2xl font-mono text-primary leading-none">{'<[o_o]>'}</pre>
        </div>
      </div>
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
    <div className={cn('flex items-start gap-3', isUser && 'flex-row-reverse')}>
      {/* Avatar */}
      <Avatar className="size-8 shrink-0 mt-0.5">
        <AvatarFallback className={cn(
          'text-xs font-medium',
          isUser
            ? 'bg-foreground text-background'
            : 'bg-primary/10 text-primary',
        )}>
          {isUser ? 'You' : <Bot className="size-4" />}
        </AvatarFallback>
      </Avatar>

      {/* Content */}
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
            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-2 prose-code:text-xs prose-a:text-primary">
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
