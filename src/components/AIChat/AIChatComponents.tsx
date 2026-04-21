import { useState, useEffect } from 'react';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { Check, Palette, Type, Wrench, X } from 'lucide-react';

import { NoteCard } from '@/components/NoteCard';
import { cn } from '@/lib/utils';

import type { DisplayMessage, ToolCall } from '@/lib/aiChatTools';

// ─── Thinking Animation ───

export const BUDDY_ANIMATION = [
  '<[o_o]>',
  '>[-_-]<',
  '<[0_0]>',
  '>[-_-]<',
];

export function BuddyThinking() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % BUDDY_ANIMATION.length);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <pre className="text-sm font-mono text-muted-foreground leading-none">{BUDDY_ANIMATION[frame]}</pre>
  );
}

// ─── Message Bubble ───

export function MessageBubble({ message }: { message: DisplayMessage }) {
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
                : 'bg-secondary border border-border rounded-tl-md',
            )}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            ) : (
              <div
                className="prose prose-sm max-w-none break-words text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-blockquote:text-muted-foreground prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-2 prose-code:text-xs prose-code:text-primary prose-code:before:content-none prose-code:after:content-none"
                style={{ '--tw-prose-links': 'hsl(var(--primary))', '--tw-prose-quote-borders': 'hsl(var(--border))' } as React.CSSProperties}
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
          <div className="w-full rounded-xl overflow-hidden border border-border mt-1 bg-background">
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

// ─── Tool Call Badge ───

export function ToolCallBadge({ toolCall }: { toolCall: ToolCall }) {
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
    const Icon = isSuccess ? Check : X;
    const label = resultParsed.error || toolCall.name.replace(/_/g, ' ');
    return (
      <span className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium',
        isSuccess
          ? 'bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20'
          : 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-500/20',
      )}>
        {toolCall.name === 'set_theme' ? <Palette className="size-3" /> : isSuccess ? <Icon className="size-3" /> : <Wrench className="size-3" />}
        {label}
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
