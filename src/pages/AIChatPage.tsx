import { useMemo, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Bot, Send, Square, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { PageHeader } from '@/components/PageHeader';
import { MessageBubble, BuddyThinking } from '@/components/AIChat/AIChatComponents';
import { BuddyOnboarding } from '@/components/AIChat/BuddyOnboarding';
import { DorkOverlay } from '@/components/AIChat/DorkCharacter';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { useAIChatSession } from '@/hooks/useAIChatSession';
import { useBuddy, type BuddyIdentity } from '@/hooks/useBuddy';
import { LoginArea } from '@/components/auth/LoginArea';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getAvatarShape } from '@/lib/avatarShape';
import { useLayoutOptions } from '@/contexts/LayoutContext';

// ─── Page Component ───

export function AIChatPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { buddy, isLoading: buddyLoading, hasBuddy } = useBuddy();

  useSeoMeta({
    title: `Buddy | ${config.appName}`,
    description: 'Chat with your AI buddy',
  });

  useLayoutOptions({ noOverscroll: true });

  if (!user) {
    return (
      <main className="flex flex-col items-center justify-center p-6 gap-6">
        <div className="flex flex-col items-center gap-3 text-center max-w-sm">
          <div className="size-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Bot className="size-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Buddy</h1>
          <p className="text-muted-foreground">Log in with your Nostr account to start chatting with AI.</p>
          <LoginArea className="mt-2" />
        </div>
      </main>
    );
  }

  if (buddyLoading) {
    return (
      <main className="flex flex-col overflow-hidden ai-chat-height sidebar:h-dvh bg-secondary/50">
        <PageHeader title="Buddy" icon={<Bot className="size-5" />} className="shrink-0 py-3" />
        <div className="flex-1 flex items-center justify-center">
          <BuddyThinking />
        </div>
      </main>
    );
  }

  if (!hasBuddy) {
    return <BuddySetupView />;
  }

  return <BuddyChatView buddy={buddy!} />;
}

// ─── Setup View (no buddy yet) ───

function BuddySetupView() {
  const [dorkDismissed, setDorkDismissed] = useState(false);

  return (
    <main className="flex flex-col overflow-hidden ai-chat-height sidebar:h-dvh bg-secondary/50">
      <PageHeader title="Setup" icon={<Bot className="size-5" />} className="shrink-0 py-3" />
      <BuddyOnboarding className="flex-1" />
      <DorkOverlay open={!dorkDismissed} onDismiss={() => setDorkDismissed(true)} />
    </main>
  );
}

// ─── Chat View (buddy exists) ───

function BuddyChatView({ buddy }: { buddy: BuddyIdentity }) {
  const {
    messages, input, setInput, isStreaming, streamingText, selectedModel,
    apiLoading, apiError, messagesEndRef,
    handleSend, handleStop, handleKeyDown, handleClear, getCredits,
  } = useAIChatSession({ buddyName: buddy.name, buddySoul: buddy.soul });

  return (
    <main className="flex flex-col overflow-hidden ai-chat-height sidebar:h-dvh bg-secondary/50">
      {/* Header */}
      <PageHeader title={buddy.name} icon={<Bot className="size-5" />} className="shrink-0 py-3">
        <div className="flex items-center gap-2">
          <CreditsBadge getCredits={getCredits} />
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
            <EmptyState buddyName={buddy.name} buddyPubkey={buddy.pubkey} onSuggestion={handleSend} />
          ) : (
            messages.filter((msg) => msg.role !== 'tool_result').map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))
          )}

          {/* Streaming / loading indicator */}
          {(isStreaming || apiLoading) && (
            streamingText ? (
              <MessageBubble message={{ id: 'streaming', role: 'assistant', content: streamingText, timestamp: new Date() }} />
            ) : messages[messages.length - 1]?.role === 'user' ? (
              <BuddyThinking />
            ) : null
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
            placeholder={!selectedModel ? 'Select a model first...' : `Message ${buddy.name}...`}
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

const SUGGESTIONS = [
  'What are my friends talking about?',
  'Give this app a cyberpunk theme',
];

function greetings(name: string): string[] {
  return [
    `Hi, I'm ${name}! What would you like me to do?`,
    `${name} here! What do you need?`,
    `Hey, it's ${name}! What do you want to do?`,
  ];
}

function EmptyState({ buddyName, buddyPubkey, onSuggestion }: { buddyName: string; buddyPubkey: string; onSuggestion: (text: string) => void }) {
  const buddyAuthor = useAuthor(buddyPubkey);
  const buddyMetadata = buddyAuthor.data?.metadata;

  const greeting = useMemo(() => {
    const g = greetings(buddyName);
    return g[Math.floor(Math.random() * g.length)];
  }, [buddyName]);

  return (
    <div className="flex flex-col items-center justify-center py-12 gap-4 text-center select-none animate-in fade-in duration-500">
      <Avatar shape={getAvatarShape(buddyMetadata)} className="size-20">
        <AvatarImage src={buddyMetadata?.picture} alt={buddyName} />
        <AvatarFallback className="bg-primary/10 text-primary">
          <Bot className="size-8" />
        </AvatarFallback>
      </Avatar>
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
