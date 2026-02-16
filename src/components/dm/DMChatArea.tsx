import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { useConversationMessages } from '@/hooks/useConversationMessages';
import { useDMContext } from '@/hooks/useDMContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { MESSAGE_PROTOCOL, PROTOCOL_MODE, type MessageProtocol } from '@/lib/dmConstants';
import { formatConversationTime, formatFullDateTime } from '@/lib/dmUtils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowLeft, Send, Loader2, AlertTriangle, Key, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NoteContent } from '@/components/NoteContent';
import type { NostrEvent } from '@nostrify/nostrify';

interface DMChatAreaProps {
  pubkey: string | null;
  onBack?: () => void;
  className?: string;
}

const MessageBubble = memo(({
  message, 
  isFromCurrentUser 
}: { 
  message: {
    id: string;
    pubkey: string;
    kind: number;
    tags: string[][];
    decryptedContent?: string;
    decryptedEvent?: NostrEvent;
    error?: string;
    created_at: number;
    isSending?: boolean;
  };
  isFromCurrentUser: boolean;
}) => {
  // For NIP-17, use inner message kind (14/15); for NIP-04, use message kind (4)
  const actualKind = message.decryptedEvent?.kind || message.kind;
  const isNIP4Message = message.kind === 4;
  const isFileAttachment = actualKind === 15; // Kind 15 = files/attachments

  // Create a NostrEvent object for NoteContent (only used for kind 15)
  // For NIP-17 file attachments, use the decryptedEvent which has the actual tags
  const messageEvent: NostrEvent = message.decryptedEvent || {
    id: message.id,
    pubkey: message.pubkey,
    created_at: message.created_at,
    kind: message.kind,
    tags: message.tags,
    content: message.decryptedContent || '',
    sig: '', // Not needed for display
  };

  return (
    <div className={cn("flex mb-4", isFromCurrentUser ? "justify-end" : "justify-start")}>
      <div className={cn(
        "max-w-[70%] rounded-lg px-4 py-2",
        isFromCurrentUser 
          ? "bg-primary text-primary-foreground" 
          : "bg-muted"
      )}>
        {message.error ? (
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <p className="text-sm italic opacity-70 cursor-help">🔒 Failed to decrypt</p>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">{message.error}</p>
            </TooltipContent>
          </Tooltip>
        ) : isFileAttachment ? (
          // Kind 15: Use NoteContent to render files/media with imeta tags
          <div className="text-sm">
            <NoteContent event={messageEvent} className="whitespace-pre-wrap break-words" />
          </div>
        ) : (
          // Kind 4 (NIP-04) and Kind 14 (NIP-17 text): Display plain text
          <p className="text-sm whitespace-pre-wrap break-words">
            {message.decryptedContent}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <TooltipProvider>
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <span className={cn(
                  "text-xs opacity-70 cursor-default",
                  isFromCurrentUser ? "text-primary-foreground" : "text-muted-foreground"
                )}>
                  {formatConversationTime(message.created_at)}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">{formatFullDateTime(message.created_at)}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <span className={cn(
                  "flex-shrink-0 opacity-50",
                  isFromCurrentUser ? "text-primary-foreground" : "text-muted-foreground"
                )}>
                  {message.kind === 4 ? (
                    <Key className="h-3 w-3" />
                  ) : (
                    <ShieldCheck className="h-3 w-3" />
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  {message.kind === 4 && "NIP-04 Kind 4 (Legacy DM)"}
                  {message.kind === 14 && "NIP-17 Kind 14 (Private Message)"}
                  {message.kind === 15 && "NIP-17 Kind 15 (Media)"}
                  {message.kind !== 4 && message.kind !== 14 && message.kind !== 15 && `Kind ${message.kind}`}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {isNIP4Message && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex-shrink-0">
                    <AlertTriangle className="h-3 w-3 text-yellow-600 dark:text-yellow-500" />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Uses outdated NIP-04 encryption</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {message.isSending && (
            <Loader2 className="h-3 w-3 animate-spin opacity-70" />
          )}
        </div>
      </div>
    </div>
  );
});

MessageBubble.displayName = 'MessageBubble';

const ChatHeader = ({ pubkey, onBack }: { pubkey: string; onBack?: () => void }) => {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;

  const displayName = metadata?.name || genUserName(pubkey);
  const avatarUrl = metadata?.picture;
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="p-4 border-b flex items-center gap-3">
      {onBack && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="md:hidden"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
      )}
      
      <Avatar className="h-10 w-10">
        <AvatarImage src={avatarUrl} alt={displayName} />
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0">
        <h2 className="font-semibold truncate">{displayName}</h2>
        {metadata?.nip05 && (
          <p className="text-xs text-muted-foreground truncate">{metadata.nip05}</p>
        )}
      </div>
    </div>
  );
};

const EmptyState = ({ isLoading }: { isLoading: boolean }) => {
  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="text-center text-muted-foreground max-w-sm">
        {isLoading ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-sm">Loading conversations...</p>
            <p className="text-xs mt-2">
              Fetching encrypted messages from relays
            </p>
          </>
        ) : (
          <>
            <p className="text-sm">Select a conversation to start messaging</p>
            <p className="text-xs mt-2">
              Your messages are encrypted and stored locally
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export const DMChatArea = ({ pubkey, onBack, className }: DMChatAreaProps) => {
  const { user } = useCurrentUser();
  const { sendMessage, protocolMode, isLoading } = useDMContext();
  const { messages, hasMoreMessages, loadEarlierMessages } = useConversationMessages(pubkey || '');
  
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  // Determine default protocol based on mode
  const getDefaultProtocol = () => {
    if (protocolMode === PROTOCOL_MODE.NIP04_ONLY) return MESSAGE_PROTOCOL.NIP04;
    if (protocolMode === PROTOCOL_MODE.NIP17_ONLY) return MESSAGE_PROTOCOL.NIP17;
    if (protocolMode === PROTOCOL_MODE.NIP04_OR_NIP17) return MESSAGE_PROTOCOL.NIP17;
    // Fallback to NIP-17 for any unexpected mode
    return MESSAGE_PROTOCOL.NIP17;
  };
  
  const [selectedProtocol, setSelectedProtocol] = useState<MessageProtocol>(getDefaultProtocol());
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  
  // Determine if selection is allowed
  const allowSelection = protocolMode === PROTOCOL_MODE.NIP04_OR_NIP17;

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    if (!messageText.trim() || !pubkey || !user) return;

    setIsSending(true);
    try {
      await sendMessage({
        recipientPubkey: pubkey,
        content: messageText.trim(),
        protocol: selectedProtocol,
      });
      setMessageText('');
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsSending(false);
    }
  }, [messageText, pubkey, user, sendMessage, selectedProtocol]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleLoadMore = useCallback(async () => {
    if (!scrollAreaRef.current || isLoadingMore) return;
    
    const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
    if (!scrollContainer) return;
    
    // Store current scroll position and height
    const previousScrollHeight = scrollContainer.scrollHeight;
    const previousScrollTop = scrollContainer.scrollTop;
    
    setIsLoadingMore(true);
    
    // Load more messages
    loadEarlierMessages();
    
    // Wait for DOM to update, then restore relative scroll position
    setTimeout(() => {
      if (scrollContainer) {
        const newScrollHeight = scrollContainer.scrollHeight;
        const heightDifference = newScrollHeight - previousScrollHeight;
        scrollContainer.scrollTop = previousScrollTop + heightDifference;
      }
      setIsLoadingMore(false);
    }, 0);
  }, [loadEarlierMessages, isLoadingMore]);

  if (!pubkey) {
    return (
      <Card className={cn("h-full", className)}>
        <EmptyState isLoading={isLoading} />
      </Card>
    );
  }

  if (!user) {
    return (
      <Card className={cn("h-full flex items-center justify-center", className)}>
        <div className="text-center text-muted-foreground">
          <p className="text-sm">Please log in to view messages</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <ChatHeader pubkey={pubkey} onBack={onBack} />
      
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <p className="text-sm">No messages yet</p>
              <p className="text-xs mt-1">Send a message to start the conversation</p>
            </div>
          </div>
        ) : (
          <div>
            {hasMoreMessages && (
              <div className="flex justify-center mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="text-xs"
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin mr-2" />
                      Loading...
                    </>
                  ) : (
                    'Load Earlier Messages'
                  )}
                </Button>
              </div>
            )}
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isFromCurrentUser={message.pubkey === user.pubkey}
              />
            ))}
          </div>
        )}
      </ScrollArea>
      
      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
            className="min-h-[80px] resize-none"
            disabled={isSending}
          />
          <div className="flex flex-col gap-2">
            <Button
              onClick={handleSend}
              disabled={!messageText.trim() || isSending}
              size="icon"
              className="h-[44px] w-[90px]"
            >
              {isSending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
            <Select
              value={selectedProtocol}
              onValueChange={(value) => setSelectedProtocol(value as MessageProtocol)}
              disabled={!allowSelection}
            >
              <SelectTrigger className="h-[32px] w-[90px] text-xs px-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={MESSAGE_PROTOCOL.NIP17} className="text-xs">
                  NIP-17
                </SelectItem>
                <SelectItem value={MESSAGE_PROTOCOL.NIP04} className="text-xs">
                  NIP-04
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </Card>
  );
};
