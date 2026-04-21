import { useCallback, useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';

import { MessageBubble, BuddyThinking } from '@/components/AIChat/AIChatComponents';
import { useBuddyOnboarding } from '@/hooks/useBuddyOnboarding';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface BuddyOnboardingProps {
  /** Additional class names for the outer wrapper. */
  className?: string;
  /** Inline styles for the outer wrapper (e.g. dynamic padding). */
  style?: React.CSSProperties;
  /**
   * Called when buddy creation is complete.
   * The parent can use this to close a sheet, navigate, etc.
   * If not provided the component simply unmounts itself.
   */
  onComplete?: () => void;
}

/**
 * Conversational buddy-creation flow.
 *
 * Renders the message list + input bar for name → soul → confirm.
 * The Dork character overlay is handled separately by the parent.
 * Does NOT include a page shell or header — the parent wraps it.
 */
export function BuddyOnboarding({ className, style, onComplete }: BuddyOnboardingProps) {
  const {
    messages, handleSend, isCreating, isDone, placeholder, error,
  } = useBuddyOnboarding();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const onSend = useCallback(() => {
    if (!input.trim() || isCreating) return;
    handleSend(input);
    setInput('');
  }, [input, isCreating, handleSend]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }, [onSend]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Notify parent when buddy creation finishes
  useEffect(() => {
    if (isDone) onComplete?.();
  }, [isDone, onComplete]);

  if (isDone) return null;

  return (
    <div className={cn('flex flex-col overflow-hidden', className)} style={style}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          {messages.filter((msg) => msg.role !== 'tool_result').map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {isCreating && <BuddyThinking />}

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-3">
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 p-4">
        <div className="max-w-2xl mx-auto flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            disabled={isCreating}
            className="min-h-[44px] max-h-40 resize-none bg-secondary/50 border-border focus-visible:ring-1"
            rows={1}
          />
          <Button
            onClick={onSend}
            disabled={!input.trim() || isCreating}
            size="icon"
            className="size-11 shrink-0 rounded-xl"
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
