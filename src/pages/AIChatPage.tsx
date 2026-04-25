import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getAvatarShape } from '@/lib/avatarShape';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { cn } from '@/lib/utils';

// ─── Slash Commands ───

const SLASH_COMMANDS = [
  { command: '/clear', description: 'Clear conversation history' },
  { command: '/new', description: 'Start a new conversation' },
  { command: '/tools', description: 'List available tools' },
];

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
    capacity, lastPromptTokens, contextWindow, storageBytes, maxStorageBytes,
    handleSend, handleStop, handleKeyDown, handleClear, getCredits,
  } = useAIChatSession({ buddyName: buddy.name, buddySoul: buddy.soul });

  return (
    <main className="flex flex-col overflow-hidden ai-chat-height sidebar:h-dvh bg-secondary/50">
      {/* Header */}
      <PageHeader title={buddy.name} icon={<Bot className="size-5" />} className="shrink-0 py-3">
        <div className="flex items-center gap-2">
          <CapacityRing
            capacity={capacity}
            promptTokens={lastPromptTokens}
            contextWindow={contextWindow}
            storageBytes={storageBytes}
            maxStorageBytes={maxStorageBytes}
          />
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
          <SlashCommandInput
            value={input}
            onChange={setInput}
            onKeyDown={handleKeyDown}
            onSend={handleSend}
            placeholder={!selectedModel ? 'Select a model first...' : `Message ${buddy.name}...`}
            disabled={!selectedModel || isStreaming}
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

/** Conversation capacity ring — appears at ≥75% usage. */
function CapacityRing({ capacity, promptTokens, contextWindow, storageBytes, maxStorageBytes }: {
  capacity: number;
  promptTokens: number;
  contextWindow: number;
  storageBytes: number;
  maxStorageBytes: number;
}) {
  if (capacity < 0.75) return null;

  const pct = Math.min(capacity * 100, 100);
  const size = 20;
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  // Color: amber at 75-89%, red at 90%+
  const ringColor = pct >= 90 ? 'text-destructive' : 'text-amber-500';

  const tokenPct = contextWindow > 0 ? ((promptTokens / contextWindow) * 100).toFixed(0) : '—';
  const storageMB = (storageBytes / (1024 * 1024)).toFixed(1);
  const maxMB = (maxStorageBytes / (1024 * 1024)).toFixed(0);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-help shrink-0">
            <svg width={size} height={size} className="transform -rotate-90" viewBox={`0 0 ${size} ${size}`}>
              <circle
                cx={size / 2} cy={size / 2} r={radius}
                fill="none" stroke="currentColor" strokeWidth={strokeWidth}
                className="text-muted/30"
              />
              <circle
                cx={size / 2} cy={size / 2} r={radius}
                fill="none" stroke="currentColor" strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                className={`${ringColor} transition-all duration-300 ease-in-out`}
              />
            </svg>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">
            Tokens: {promptTokens.toLocaleString()} / {contextWindow.toLocaleString()} ({tokenPct}%)
            <br />
            Storage: {storageMB} / {maxMB} MB
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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

/** Text input with a slash-command autocomplete dropdown. */
function SlashCommandInput({ value, onChange, onKeyDown, onSend, placeholder, disabled }: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSend: (override?: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [menuDismissed, setMenuDismissed] = useState(false);

  // Filter commands based on input
  const matches = useMemo(() => {
    if (!value.startsWith('/') || menuDismissed) return [];
    const typed = value.toLowerCase();
    return SLASH_COMMANDS.filter((c) => c.command.startsWith(typed));
  }, [value, menuDismissed]);

  const showMenu = matches.length > 0 && !disabled;

  // Reset selection when matches change
  useEffect(() => {
    setSelectedIndex(0);
  }, [matches.length]);

  // Un-dismiss when input stops being a slash command or is cleared
  useEffect(() => {
    if (!value.startsWith('/')) setMenuDismissed(false);
  }, [value]);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setMenuDismissed(true);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  const selectCommand = useCallback((cmd: string) => {
    onChange(cmd);
    setMenuDismissed(true);
    // Auto-send slash commands immediately
    onSend(cmd);
  }, [onChange, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showMenu) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % matches.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        selectCommand(matches[selectedIndex].command);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenuDismissed(true);
        return;
      }
    }
    // Fall through to parent handler (Enter → send, etc.)
    onKeyDown(e);
  }, [showMenu, matches, selectedIndex, selectCommand, onKeyDown]);

  return (
    <div ref={wrapperRef} className="relative flex-1 min-w-0">
      {/* Autocomplete menu */}
      {showMenu && (
        <div className="absolute bottom-full left-0 right-0 mb-1.5 rounded-xl border border-border bg-popover shadow-lg overflow-hidden animate-in fade-in-0 slide-in-from-bottom-2 duration-150 z-10">
          {matches.map((cmd, i) => (
            <button
              key={cmd.command}
              className={cn(
                'w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-sm transition-colors',
                i === selectedIndex ? 'bg-secondary' : 'hover:bg-secondary/50',
              )}
              onMouseEnter={() => setSelectedIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault(); // Keep textarea focus
                selectCommand(cmd.command);
              }}
            >
              <span className="font-mono text-xs font-semibold text-foreground">{cmd.command}</span>
              <span className="text-muted-foreground text-xs">{cmd.description}</span>
            </button>
          ))}
        </div>
      )}
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="min-h-[44px] max-h-40 resize-none bg-secondary/50 border-border focus-visible:ring-1"
        rows={1}
      />
    </div>
  );
}
