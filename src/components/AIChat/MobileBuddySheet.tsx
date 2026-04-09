import { useState, useRef, useEffect, useCallback } from 'react';
import { Search } from 'lucide-react';

import { MessageBubble, BuddyThinking, BUDDY_ANIMATION } from '@/components/AIChat/AIChatComponents';
import { useAIChatSession } from '@/hooks/useAIChatSession';
import { useBuddy } from '@/hooks/useBuddy';
import { cn } from '@/lib/utils';

interface MobileBuddySheetProps {
  hidden: boolean;
  onClose: () => void;
}

export function MobileBuddySheet({ hidden, onClose }: MobileBuddySheetProps) {
  const { buddy } = useBuddy();
  const {
    messages, input, setInput, isStreaming, streamingText, selectedModel,
    apiLoading, messagesEndRef,
    handleSend, handleStop,
  } = useAIChatSession(buddy ? { buddyName: buddy.name, buddySoul: buddy.soul } : {});

  const inputRef = useRef<HTMLInputElement>(null);
  const [animFrame, setAnimFrame] = useState(0);

  // Animate the toggle button when streaming
  useEffect(() => {
    if (!isStreaming) { setAnimFrame(0); return; }
    const interval = setInterval(() => {
      setAnimFrame((f) => (f + 1) % BUDDY_ANIMATION.length);
    }, 100);
    return () => clearInterval(interval);
  }, [isStreaming]);

  // Focus input when shown
  useEffect(() => {
    if (!hidden) {
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [hidden]);

  // Scroll to bottom when messages change or streaming text updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, messagesEndRef]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (isStreaming) {
        handleStop();
      } else {
        onClose();
      }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [onClose, handleSend, handleStop, isStreaming]);

  const visibleMessages = messages.filter((msg) => msg.role !== 'tool_result');
  const showThinking = (isStreaming || apiLoading) && !streamingText && messages[messages.length - 1]?.role === 'user';
  const displayName = buddy?.name ?? 'Buddy';

  return (
    <div className={cn('fixed inset-0 z-[49] sidebar:hidden flex flex-col overflow-hidden', hidden && 'hidden')} onClick={onClose}>

      {/* Messages area — fills from top, scrollable, padded at bottom to clear the fixed input bar.
          stopPropagation on the content wrapper so clicking a bubble doesn't close the sheet. */}
      <div
        className="flex-1 overflow-y-auto overscroll-contain px-6 pt-4"
        style={{ paddingBottom: 'calc(var(--bottom-nav-height) + 28px + env(safe-area-inset-bottom, 0px) + 70px)' }}
      >
        <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
          {visibleMessages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {showThinking && <BuddyThinking />}
          {streamingText && (isStreaming || apiLoading) && (
            <MessageBubble message={{ id: 'streaming', role: 'assistant', content: streamingText, timestamp: new Date() }} />
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input bar — pinned to bottom-mobile-nav position */}
      <div className="flex items-center px-6 py-3 bottom-mobile-nav fixed left-0 right-0 z-[49]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 flex-1 bg-secondary rounded-full px-4 py-2.5">
          <Search strokeWidth={4} className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask ${displayName}...`}
            disabled={!selectedModel}
            className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground disabled:opacity-50"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <button
            onClick={onClose}
            className="shrink-0 font-mono text-xs text-primary transition-colors"
            onMouseDown={(e) => e.preventDefault()}
          >
            {isStreaming ? BUDDY_ANIMATION[animFrame] : '<[o_o]>'}
          </button>
        </div>
      </div>
    </div>
  );
}
