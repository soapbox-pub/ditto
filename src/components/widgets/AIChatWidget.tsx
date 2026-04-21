import { useState, useRef, useCallback, useEffect } from 'react';
import { Send } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { ScrollArea } from '@/components/ui/scroll-area';
import { DorkThinking } from '@/components/DorkThinking';
import { useShakespeare, useShakespeareCredits, sortModelsByCost, type ChatMessage } from '@/hooks/useShakespeare';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { cn } from '@/lib/utils';

/**
 * Module-level cache so conversation survives collapse/expand (which unmounts
 * the component). Keyed by user pubkey. Intentionally not persisted to
 * localStorage — sidebar chat is ephemeral.
 */
const conversationCache = new Map<string, ChatMessage[]>();

/** Compact AI chat widget for the sidebar. */
export function AIChatWidget() {
  const { user } = useCurrentUser();
  const { sendStreamingMessage, getAvailableModels, isLoading, isAuthenticated } = useShakespeare();
  const hasCredits = useShakespeareCredits();

  // Fetch available models and select the cheapest as default
  const { data: defaultModelId } = useQuery({
    queryKey: ['shakespeare-default-model'],
    queryFn: async () => {
      const response = await getAvailableModels();
      const sorted = sortModelsByCost(response.data);
      return sorted[0]?.id ?? '';
    },
    staleTime: 10 * 60_000,
    enabled: !!user,
  });

  const cacheKey = user?.pubkey ?? '';
  const [messages, setMessages] = useState<ChatMessage[]>(() => conversationCache.get(cacheKey) ?? []);
  const [input, setInput] = useState('');
  const [streamingContent, setStreamingContent] = useState('');

  // Write back to cache whenever messages change.
  useEffect(() => {
    if (cacheKey) {
      conversationCache.set(cacheKey, messages);
    }
  }, [messages, cacheKey]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setStreamingContent('');

    try {
      let accumulated = '';
      await sendStreamingMessage(
        newMessages,
        defaultModelId || 'shakespeare',
        (chunk) => {
          accumulated += chunk;
          setStreamingContent(accumulated);
        },
      );
      setMessages((prev) => [...prev, { role: 'assistant', content: accumulated }]);
      setStreamingContent('');
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
      setStreamingContent('');
    }
  }, [input, isLoading, messages, sendStreamingMessage, defaultModelId]);

  if (!user || !isAuthenticated) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 px-3 text-center">
        <pre className="text-xl font-mono text-primary leading-none">{'<[o_o]>'}</pre>
        <p className="text-xs text-muted-foreground">Log in to chat with Dork</p>
      </div>
    );
  }

  // Show credits CTA when the user has no credits (hasCredits === false).
  // While loading (hasCredits === undefined) we fall through to the chat UI.
  if (hasCredits === false) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 px-3 text-center">
        <pre className="text-xl font-mono text-primary leading-none">{'<[o_o]>'}</pre>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Grab some credits on{' '}
          <a
            href="https://shakespeare.diy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Shakespeare
          </a>
          {' '}to chat with Dork.
        </p>
        <Link
          to="/ai-chat"
          className="text-xs font-medium text-primary hover:underline"
        >
          Open AI Chat
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <ScrollArea ref={scrollRef} className="flex-1 min-h-0">
        <div className="space-y-3 p-2">
          {messages.length === 0 && !streamingContent && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <pre className="text-xl font-mono text-primary leading-none">{'<[o_o]>'}</pre>
              <p className="text-xs text-muted-foreground">Ask me anything...</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}
          {streamingContent && (
            <MessageBubble message={{ role: 'assistant', content: streamingContent }} />
          )}
          {isLoading && !streamingContent && (
            <div className="flex gap-2 items-start">
              <div className="bg-secondary rounded-xl rounded-tl-sm px-3 py-2">
                <DorkThinking className="text-[10px]" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="border-t border-border p-2 space-y-1.5">
        <div className="flex items-end gap-1.5">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Message..."
            rows={1}
            className="flex-1 resize-none text-sm bg-secondary/50 rounded-lg px-2.5 py-1.5 border-0 outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/60 min-h-[32px] max-h-[80px]"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading || !defaultModelId}
            className="shrink-0 p-1.5 rounded-lg text-primary hover:bg-primary/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const content = typeof message.content === 'string' ? message.content : Array.isArray(message.content) ? message.content.map((c) => c.text ?? '').join('') : '';

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-secondary text-foreground rounded-bl-sm',
        )}
      >
        {content}
      </div>
    </div>
  );
}
