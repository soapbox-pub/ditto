import { useState, useEffect, useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { Bot, Send, Square, Trash2, Palette, Type } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { NoteCard } from '@/components/NoteCard';
import { PageHeader } from '@/components/PageHeader';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useAIChatSession } from '@/hooks/useAIChatSession';
import { LoginArea } from '@/components/auth/LoginArea';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useLayoutOptions } from '@/contexts/LayoutContext';

import type { DisplayMessage, ToolCall } from '@/lib/aiChatTools';

// ─── Page Component ───

export function AIChatPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const {
    messages, input, setInput, isStreaming,
    models, selectedModel, setSelectedModel, modelsLoading,
    apiLoading, apiError, messagesEndRef,
    handleSend, handleStop, handleKeyDown, handleClear, getCredits,
  } = useAIChatSession();

  useSeoMeta({
    title: `Dork | ${config.appName}`,
    description: 'Chat with AI assistant',
  });

  useLayoutOptions({ noOverscroll: true });

  // ─── Render ───

  if (!user) {
    return (
      <main className="flex flex-col items-center justify-center p-6 gap-6">
        <div className="flex flex-col items-center gap-3 text-center max-w-sm">
          <div className="size-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Bot className="size-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Dork</h1>
          <p className="text-muted-foreground">Log in with your Nostr account to start chatting with AI.</p>
          <LoginArea className="mt-2" />
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col overflow-hidden ai-chat-height sidebar:h-dvh bg-secondary/50">
      {/* Header */}
      <PageHeader title="Dork" icon={<Bot className="size-5" />} className="shrink-0 py-3">
        <div className="flex items-center gap-2">
          <CreditsBadge getCredits={getCredits} />
          <Select value={selectedModel} onValueChange={setSelectedModel} disabled={modelsLoading}>
            <SelectTrigger className="h-8 min-w-0 text-base md:text-xs">
              <SelectValue placeholder={modelsLoading ? 'Loading...' : 'Select model'} />
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
            className="size-8 shrink-0"
            onClick={handleClear}
            disabled={messages.length === 0}
            title="Clear conversation"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </PageHeader>

      {/* Messages Area */}
      <ScrollArea className="flex-1">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          {messages.length === 0 ? (
            <EmptyState onSuggestion={handleSend} />
          ) : (
            messages.filter((msg) => msg.role !== 'tool_result').map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))
          )}

          {/* Loading indicator */}
          {(isStreaming || apiLoading) && messages[messages.length - 1]?.role === 'user' && (
            <DorkThinking />
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
      <div className="shrink-0 p-4">
        <div className="max-w-2xl mx-auto flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={!selectedModel ? 'Select a model first...' : 'Send a message...'}
            disabled={!selectedModel || isStreaming}
            className="min-h-[44px] max-h-40 resize-none bg-secondary/50 border-border focus-visible:ring-1"
            rows={1}
          />
          {isStreaming ? (
            <Button
              onClick={handleStop}
              variant="ghost"
              size="icon"
              className="size-11 shrink-0 rounded-full bg-foreground/10 hover:bg-foreground/20 [&_svg]:fill-foreground"
            >
              <Square className="size-3.5" />
            </Button>
          ) : (
            <Button
              onClick={() => handleSend()}
              disabled={!input.trim() || !selectedModel}
              size="icon"
              className="size-11 shrink-0 rounded-xl"
            >
              <Send className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}

// ─── Sub-Components ───

const DORK_ANIMATION = [
  '<[o_o]>',
  '>[-_-]<',
  '<[0_0]>',
  '>[-_-]<',
];

function DorkThinking() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % DORK_ANIMATION.length);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <pre className="text-sm font-mono text-muted-foreground leading-none">{DORK_ANIMATION[frame]}</pre>
  );
}

const DORK_GREETINGS = [
  "Hi, I'm Dork! What would you like me to do?",
  "Dork here! What do you need?",
  "Hey, it's Dork! What do you want to do?",
];

const SUGGESTIONS = [
  'Create a feed of Alex Gleason talking about being Vegan',
  'Make a feed of the team soapbox follow pack talking about ditto',
];

function EmptyState({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  const greeting = useMemo(() => DORK_GREETINGS[Math.floor(Math.random() * DORK_GREETINGS.length)], []);

  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center select-none animate-in fade-in duration-500">
      <pre className="text-4xl font-mono text-primary leading-none">{'<[o_o]>'}</pre>
      <p className="text-sm text-muted-foreground">{greeting}</p>
      <div className="flex flex-col gap-2 w-full max-w-sm mt-2">
        {SUGGESTIONS.map((text) => (
          <button
            key={text}
            onClick={() => onSuggestion(text)}
            className="px-4 py-2.5 rounded-xl border border-border bg-secondary/40 hover:bg-secondary/70 text-sm text-left text-foreground/80 transition-colors"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: DisplayMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex items-start', isUser && 'justify-end')}>
      <div className={cn('flex flex-col gap-1 max-w-[85%] min-w-0', isUser && 'items-end')}>
        {/* Hide the bubble entirely when the assistant message is empty (tool-only turn) */}
        {(isUser || message.content.trim()) && (
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
              <div
                className="prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-2 prose-code:text-xs"
                style={{ '--tw-prose-links': 'hsl(var(--primary))' } as React.CSSProperties}
              >
                <Markdown rehypePlugins={[rehypeSanitize]}>
                  {message.content}
                </Markdown>
              </div>
            )}
          </div>
        )}

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
