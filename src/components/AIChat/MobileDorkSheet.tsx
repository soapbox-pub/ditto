import { useRef, useEffect, useCallback } from 'react';
import { Search } from 'lucide-react';

import { MessageBubble, DorkThinking } from '@/components/AIChat/AIChatComponents';
import { useAIChatSession } from '@/hooks/useAIChatSession';
import { cn } from '@/lib/utils';

interface MobileDorkSheetProps {
  hidden: boolean;
  onClose: () => void;
  onToggleDork: () => void;
}

export function MobileDorkSheet({ hidden, onClose, onToggleDork }: MobileDorkSheetProps) {
  const {
    messages, input, setInput, isStreaming, selectedModel,
    apiLoading, messagesEndRef,
    handleSend, handleStop,
  } = useAIChatSession();

  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when shown
  useEffect(() => {
    if (!hidden) {
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [hidden]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, messagesEndRef]);

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
  const showThinking = (isStreaming || apiLoading) && messages[messages.length - 1]?.role === 'user';

  return (
    <div className={cn('fixed inset-0 z-[49] sidebar:hidden flex flex-col overflow-hidden', hidden && 'hidden')}>

      {/* Messages area — fills from top, scrollable, padded at bottom to clear the fixed input bar */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-6 pt-4 space-y-4" style={{ paddingBottom: 'calc(var(--bottom-nav-height) + 28px + env(safe-area-inset-bottom, 0px) + 70px)' }}>
        {visibleMessages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {showThinking && <DorkThinking />}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar — pinned to bottom-mobile-nav position */}
      <div className="flex items-center px-6 py-3 bottom-mobile-nav fixed left-0 right-0 z-[49]">
        <div className="flex items-center gap-2 flex-1 bg-secondary rounded-full px-4 py-2.5">
          {isStreaming ? (
            <svg
              className="size-4 shrink-0 text-muted-foreground"
              style={{ animation: 'spin 1s linear infinite' }}
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <Search strokeWidth={4} className="size-4 shrink-0 text-muted-foreground" />
          )}
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Dork..."
            disabled={!selectedModel}
            className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground disabled:opacity-50"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <button
            onClick={onToggleDork}
            className="shrink-0 font-mono text-xs text-primary transition-colors"
            onMouseDown={(e) => e.preventDefault()}
          >
            {'<[o_o]>'}
          </button>
        </div>
      </div>
    </div>
  );
}
