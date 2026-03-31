import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Send, Square } from 'lucide-react';

import { MessageBubble, DorkThinking } from '@/components/AIChat/AIChatComponents';
import { useAIChatSession } from '@/hooks/useAIChatSession';
import { cn } from '@/lib/utils';

interface MobileDorkSheetProps {
  hidden: boolean;
  onClose: () => void;
  onSearchToggle: () => void;
}

export function MobileDorkSheet({ hidden, onClose, onSearchToggle }: MobileDorkSheetProps) {
  const {
    messages, input, setInput, isStreaming, selectedModel,
    apiLoading, messagesEndRef,
    handleSend, handleStop,
  } = useAIChatSession();

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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
      onClose();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [onClose, handleSend]);

  const visibleMessages = messages.filter((msg) => msg.role !== 'tool_result');
  const showThinking = (isStreaming || apiLoading) && messages[messages.length - 1]?.role === 'user';

  return (
    <div className={cn('fixed left-0 right-0 z-[49] sidebar:hidden animate-in slide-in-from-bottom-4 duration-200 bottom-mobile-nav', hidden && 'hidden')}>

      {/* Messages area */}
      {(visibleMessages.length > 0 || showThinking) && (
        <div ref={scrollRef} className="flex flex-col bg-popover/95 rounded-2xl mx-6 mb-0.5 overflow-y-auto max-h-[55vh] shadow-lg p-4 space-y-4">
          {visibleMessages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {showThinking && <DorkThinking />}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-center px-6 py-3">
        <div className="flex items-center gap-2 flex-1 bg-secondary rounded-full px-4 py-2.5">
          <button
            onClick={onSearchToggle}
            className="shrink-0 text-muted-foreground hover:text-muted-foreground/80 transition-colors"
            onMouseDown={(e) => e.preventDefault()}
          >
            <Search strokeWidth={4} className="size-4" />
          </button>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Dork..."
            disabled={!selectedModel || isStreaming}
            className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground disabled:opacity-50"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <span className="shrink-0 font-mono text-xs text-primary">
            {'<[o_o]>'}
          </span>
        </div>
        {/* Send / Stop button */}
        <div className="ml-2 shrink-0">
          {isStreaming ? (
            <button
              onClick={handleStop}
              className="size-10 rounded-full bg-foreground/10 hover:bg-foreground/20 flex items-center justify-center transition-colors [&_svg]:fill-foreground"
            >
              <Square className="size-3.5" />
            </button>
          ) : (
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || !selectedModel}
              className="size-10 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              <Send className="size-4 text-primary-foreground" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
