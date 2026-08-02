import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSeoMeta } from '@/hooks/useSeoMeta';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { Bot, Send, Trash2, Palette, Type, Sparkles, Plus, X, Loader2 } from 'lucide-react';

import { getWidgetCreationSystemPrompt, isCompactionMarker } from '@soapbox.pub/nostr-canvas/devkit';
import type { SessionMessage } from '@soapbox.pub/nostr-canvas/devkit';

import { PageHeader } from '@/components/PageHeader';
import { useShakespeare, useShakespeareCredits, type Model } from '@/hooks/useShakespeare';
import { useChatSessions, type DisplayMessage, type ToolCall, type ChatSession, type CreateSessionInput } from '@/hooks/useChatSessions';
import { useAIProviders } from '@/hooks/useAIProviders';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useToolRegistry } from '@/hooks/useToolRegistry';
import { useAgentSessions } from '@/hooks/useAgentSessions';
import { useAutoTitle } from '@/hooks/useAutoTitle';
import { useInsertText } from '@/hooks/useInsertText';
import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MentionAutocomplete } from '@/components/MentionAutocomplete';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

import { cn } from '@/lib/utils';
import { isAtTabCap, MAX_OPEN_TABS } from '@/lib/chatTabsStorage';
import { ABILITIES } from '@/lib/abilities';
import type { Ability } from '@/lib/abilities';
import { buildSystemPrompt } from '@/lib/chatSystemPrompt';
import { DorkThinking } from '@/components/DorkThinking';
import { useLayoutOptions } from '@/contexts/LayoutContext';

// ─── Message Conversion ───

function parseToolArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Convert an AgentSession snapshot's messages into renderable chat messages.
 * Tool results are attached to their originating assistant message instead
 * of rendering as separate bubbles.
 */
function snapshotToDisplayMessages(msgs: SessionMessage[]): DisplayMessage[] {
  const messages: DisplayMessage[] = [];
  let pendingToolCalls: ToolCall[] = [];

  msgs.forEach((msg, index) => {
    if (isCompactionMarker(msg)) return;

    if (msg.role === 'tool') {
      const call = pendingToolCalls.find((tc) => tc.id === msg.tool_call_id);
      if (call) {
        call.result = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      }
      return;
    }

    if (msg.role === 'user') {
      const content = typeof msg.content === 'string' ? msg.content : '';
      pendingToolCalls = [];
      if (!content) return;
      messages.push({ id: `msg-${index}`, role: 'user', content, timestamp: new Date() });
      return;
    }

    if (msg.role !== 'assistant') return;

    const content = typeof msg.content === 'string' ? msg.content : '';
    const toolCalls = (msg.tool_calls ?? []).flatMap((tc) => {
      if (tc.type !== 'function') return [];
      return [{
        id: tc.id,
        name: tc.function.name,
        arguments: parseToolArgs(tc.function.arguments),
      }];
    });
    pendingToolCalls = toolCalls;

    if (!content && toolCalls.length === 0) return;
    messages.push({
      id: `msg-${index}`,
      role: 'assistant',
      content,
      timestamp: new Date(),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    });
  });

  return messages;
}

// ─── System Prompt ───
//
// The base system prompt (buildSystemPrompt) lives in `@/lib/chatSystemPrompt`
// so the page file exports only components. It embeds the ability manifest
// from `@/lib/abilities`; a tiles session overrides it with devkit's widget
// creation prompt (see systemPromptFor below).

// ─── Page Component ───

export function AIChatPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { getAvailableModels } = useShakespeare();
  const hasCredits = useShakespeareCredits();
  const { activeSession, activeSessionId, sessions, createSession, setActiveSessionId, closeSession, updateSession } = useChatSessions();
  const { profiles } = useAIProviders();
  const { buildSessionTools } = useToolRegistry();

  const [input, setInput] = useState('');
  const [models, setModels] = useState<Model[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [capDialogOpen, setCapDialogOpen] = useState(false);
  const [pendingCreation, setPendingCreation] = useState<CreateSessionInput | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // @-mention insertion for the message textarea (people + abilities).
  const { insertAtCursor: insertMention } = useInsertText(textareaRef, setInput);

  const systemPromptFor = useCallback((session: ChatSession) => {
    return session.abilities.includes('tiles')
      ? getWidgetCreationSystemPrompt({ placement: 'widget' })
      : buildSystemPrompt(config.appName);
  }, [config.appName]);

  const { snapshots, buildError, sendMessage, clearActiveSession } = useAgentSessions({
    sessions,
    activeSessionId,
    profiles,
    user: user ?? null,
    models,
    buildSessionTools,
    systemPromptFor,
  });

  useAutoTitle({ sessions, snapshots, models, updateSession });

  const agentSnapshot = snapshots[activeSessionId] ?? null;

  const messages = useMemo(
    () => snapshotToDisplayMessages(agentSnapshot?.messages ?? []),
    [agentSnapshot?.messages],
  );
  const isLoading = agentSnapshot?.isLoading ?? false;
  const sessionError = buildError ?? agentSnapshot?.error ?? null;

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

  // Handle sending a message
  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || !agentSnapshot || agentSnapshot.isLoading) return;
    setInput('');
    await sendMessage(trimmed);
  }, [input, agentSnapshot, sendMessage]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // Clear conversation
  const handleClear = useCallback(() => {
    clearActiveSession();
  }, [clearActiveSession]);

  // ─── Session Controls ───

  // Provider / model selection writes into the active session. The session's
  // AgentSession rebuilds on the next effect pass, carrying the history over.
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

  // Opening a 21st tab at the cap prompts which existing tab(s) to close
  // instead of silently closing anything. The dialog finishes the creation
  // once room has been made.
  const createSessionGuarded = useCallback((input: CreateSessionInput) => {
    if (isAtTabCap(sessions.length)) {
      setPendingCreation(input);
      setCapDialogOpen(true);
      return;
    }
    createSession(input);
  }, [sessions.length, createSession]);

  // Toggling an ability forks a new session carrying over the current
  // provider/model. The new session becomes active automatically.
  const handleAbilityToggle = useCallback((ability: Ability, checked: boolean | 'indeterminate') => {
    createSessionGuarded({
      abilities: checked === true
        ? [...activeSession.abilities, ability]
        : activeSession.abilities.filter((a) => a !== ability),
      providerId: activeSession.providerId,
      modelId: activeSession.modelId,
    });
  }, [activeSession.providerId, activeSession.modelId, activeSession.abilities, createSessionGuarded]);

  const handleNewChat = useCallback(() => {
    createSessionGuarded({
      abilities: [],
      providerId: activeSession.providerId,
      modelId: activeSession.modelId,
    });
  }, [activeSession.providerId, activeSession.modelId, createSessionGuarded]);

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
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId;
          return (
            <div key={session.id} className="flex items-center shrink-0">
              <Button
                variant={isActive ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setActiveSessionId(session.id)}
                className="rounded-full text-xs max-w-36"
              >
                {session.title ? (
                  <span className="truncate">{session.title}</span>
                ) : (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                    New chat
                  </span>
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 rounded-full -ml-1 shrink-0"
                onClick={() => closeSession(session.id)}
                disabled={sessions.length === 1}
                title="Close chat"
                aria-label="Close chat"
              >
                <X className="size-3" />
              </Button>
            </div>
          );
        })}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleNewChat}
          className="shrink-0 rounded-full text-xs gap-1"
        >
          <Plus className="size-3.5" />
          New chat
        </Button>
      </div>

      {/* Cap-hit dialog: choose which tab(s) to close to make room */}
      <Dialog open={capDialogOpen} onOpenChange={setCapDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Too many open chats</DialogTitle>
            <DialogDescription>
              You have {sessions.length} open chats, the maximum is {MAX_OPEN_TABS}. Close one or more
              to make room for a new one.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-64">
            <div className="space-y-1 pr-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-secondary/60"
                >
                  <span className="text-sm truncate min-w-0">{session.title || 'New chat'}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    onClick={() => closeSession(session.id)}
                    title="Close chat"
                    aria-label="Close chat"
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCapDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={isAtTabCap(sessions.length)}
              onClick={() => {
                if (pendingCreation) createSession(pendingCreation);
                setCapDialogOpen(false);
                setPendingCreation(null);
              }}
            >
              Open new chat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Messages Area */}
      {messages.length === 0 ? (
        <div className="flex-1 min-h-0 flex items-center justify-center px-4">
          <EmptyState hasCredits={hasCredits} />
        </div>
      ) : (
        <ScrollArea className="flex-1 min-h-0" ref={scrollRef}>
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* Loading indicator */}
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <DorkThinking className="text-sm" />
            )}

            {/* Error display */}
            {sessionError && (
              sessionError.includes('Rate limited') ? (
                <DorkErrorBanner
                  face=">[~_~]<"
                  heading="Whoa, slow down! Dork needs a breather."
                  body="You're sending messages a bit too fast. Want more brainpower? Grab some credits on"
                />
              ) : sessionError.includes('run out of credits') ? (
                <DorkErrorBanner
                  face=">[o_o]<"
                  heading="You've run out of credits!"
                  body="Grab some more on"
                />
              ) : (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-3">
                  {sessionError}
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
                disabled={!activeSession.modelId || isLoading}
                className="min-h-[44px] max-h-40 resize-none bg-secondary/50 border-border focus-visible:ring-1"
                rows={1}
              />
              <MentionAutocomplete
                textareaRef={textareaRef}
                content={input}
                onInsertMention={insertMention}
                abilities={ABILITIES}
              />
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'size-11 shrink-0 rounded-xl',
                      activeSession.abilities.length > 0 && 'text-primary',
                    )}
                    title="Abilities"
                  >
                    <Sparkles className="size-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Abilities</p>
                  <div className="space-y-3">
                    {ABILITIES.map((ability) => (
                      <div key={ability.key} className="flex items-start gap-2">
                        <Checkbox
                          id={`ability-${ability.key}`}
                          checked={activeSession.abilities.includes(ability.key)}
                          onCheckedChange={(checked) => handleAbilityToggle(ability.key, checked)}
                        />
                        <div className="space-y-0.5">
                          <Label htmlFor={`ability-${ability.key}`} className="font-normal cursor-pointer">
                            {ability.label}
                          </Label>
                          <p className="text-xs text-muted-foreground leading-tight">{ability.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                onClick={handleSend}
                disabled={!input.trim() || !activeSession.modelId || isLoading || !agentSnapshot}
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
