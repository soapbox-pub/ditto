import { useState, useRef, useEffect, useCallback } from 'react';
import { useSeoMeta } from '@unhead/react';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { Bot, Send, Sparkles, Trash2, Sun, Moon, Monitor } from 'lucide-react';

import { useShakespeare, type ChatMessage, type Model } from '@/hooks/useShakespeare';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useTheme } from '@/hooks/useTheme';
import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import type { Theme } from '@/contexts/AppContext';

// ─── Tool Definitions ───

interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string; enum?: string[] }>;
      required: string[];
    };
  };
}

const TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'set_theme',
      description: 'Set the application theme to light mode, dark mode, or system default. Use this when the user asks to change the theme, switch to dark mode, enable light mode, etc.',
      parameters: {
        type: 'object',
        properties: {
          theme: {
            type: 'string',
            description: 'The theme to apply',
            enum: ['light', 'dark', 'system'],
          },
        },
        required: ['theme'],
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

function useToolExecutor() {
  const { setTheme, theme: currentTheme } = useTheme();

  const executeToolCall = useCallback((name: string, args: Record<string, unknown>): string => {
    switch (name) {
      case 'set_theme': {
        const theme = args.theme as Theme;
        if (!['light', 'dark', 'system'].includes(theme)) {
          return JSON.stringify({ error: `Invalid theme: ${theme}. Must be one of: light, dark, system` });
        }
        setTheme(theme);
        return JSON.stringify({ success: true, theme, previous: currentTheme });
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  }, [setTheme, currentTheme]);

  return { executeToolCall };
}

// ─── System Prompt ───

const SYSTEM_PROMPT: ChatMessage = {
  role: 'system',
  content: `You are a helpful AI assistant integrated into Ditto, a Nostr social client. You can help users with questions, conversations, and tasks.

You have access to tools that can control the application. When the user asks you to change something in the app (like the theme), use the appropriate tool.

Be concise and friendly. When you use a tool, briefly confirm what you did.`,
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
      <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6">
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
    <main className="flex flex-col h-[calc(100dvh-3.5rem)] sidebar:h-dvh">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-background/80 backdrop-blur-md px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="size-4 text-primary" />
          </div>
          <h1 className="font-semibold text-lg">AI Chat</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Model selector */}
          <Select value={selectedModel} onValueChange={setSelectedModel} disabled={modelsLoading}>
            <SelectTrigger className="w-44 h-8 text-xs">
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

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <div className="size-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
        <Sparkles className="size-9 text-primary" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold">How can I help you?</h2>
        <p className="text-muted-foreground text-sm max-w-xs">
          Ask me anything, or try asking me to change your theme.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 mt-2 max-w-sm justify-center">
        <SuggestionChip icon={<Sun className="size-3.5" />} label="Switch to light mode" />
        <SuggestionChip icon={<Moon className="size-3.5" />} label="Enable dark mode" />
        <SuggestionChip icon={<Monitor className="size-3.5" />} label="Use system theme" />
      </div>
    </div>
  );
}

function SuggestionChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/60 border border-border text-xs text-muted-foreground">
      {icon}
      {label}
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
  const themeIcons: Record<string, React.ReactNode> = {
    light: <Sun className="size-3" />,
    dark: <Moon className="size-3" />,
    system: <Monitor className="size-3" />,
  };

  const themeValue = toolCall.arguments.theme as string | undefined;
  const icon = toolCall.name === 'set_theme' && themeValue ? themeIcons[themeValue] : <Sparkles className="size-3" />;

  let resultParsed: { success?: boolean; error?: string } = {};
  try {
    resultParsed = JSON.parse(toolCall.result || '{}');
  } catch {
    // ignore
  }

  const isSuccess = resultParsed.success === true;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium',
        isSuccess
          ? 'bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20'
          : 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-500/20',
      )}
    >
      {icon}
      {toolCall.name === 'set_theme'
        ? `Theme set to ${themeValue}`
        : toolCall.name
      }
    </span>
  );
}
