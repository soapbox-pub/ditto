import { useMemo, useState, memo } from 'react';
import { AlertTriangle, Info, Loader2 } from 'lucide-react';
import { useDMContext } from '@/hooks/useDMContext';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { formatConversationTime, formatFullDateTime } from '@/lib/dmUtils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { LOADING_PHASES } from '@/lib/dmConstants';

interface DMConversationListProps {
  selectedPubkey: string | null;
  onSelectConversation: (pubkey: string) => void;
  className?: string;
  onStatusClick?: () => void;
}

interface ConversationItemProps {
  pubkey: string;
  isSelected: boolean;
  onClick: () => void;
  lastMessage: { decryptedContent?: string; error?: string } | null;
  lastActivity: number;
  hasNIP4Messages: boolean;
}

const ConversationItemComponent = ({ 
  pubkey, 
  isSelected, 
  onClick,
  lastMessage,
  lastActivity,
  hasNIP4Messages
}: ConversationItemProps) => {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;

  const displayName = metadata?.name || genUserName(pubkey);
  const avatarUrl = metadata?.picture;
  const initials = displayName.slice(0, 2).toUpperCase();

  const lastMessagePreview = lastMessage?.error 
    ? '🔒 Encrypted message' 
    : lastMessage?.decryptedContent || 'No messages yet';

  // Show skeleton only for name/avatar while loading (we already have message data)
  const isLoadingProfile = author.isLoading && !metadata;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-3 rounded-lg transition-colors hover:bg-accent block overflow-hidden",
        isSelected && "bg-accent"
      )}
    >
      <div className="flex items-start gap-3 max-w-full">
        {isLoadingProfile ? (
          <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
        ) : (
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarImage src={avatarUrl} alt={displayName} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        )}
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {isLoadingProfile ? (
                <Skeleton className="h-[1.25rem] w-24" />
              ) : (
                <span className="font-medium text-sm truncate">{displayName}</span>
              )}
              {hasNIP4Messages && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex-shrink-0">
                        <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-500" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p className="text-xs max-w-[200px]">Some messages use outdated NIP-04 encryption</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0 cursor-default">
                    {formatConversationTime(lastActivity)}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <p className="text-xs">{formatFullDateTime(lastActivity)}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          
          <p className="text-sm text-muted-foreground truncate">
            {lastMessagePreview}
          </p>
        </div>
      </div>
    </button>
  );
};

const ConversationItem = memo(ConversationItemComponent);
ConversationItem.displayName = 'ConversationItem';

const ConversationListSkeleton = () => {
  return (
    <div className="space-y-2 p-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-start gap-3 p-3">
          <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
};

export const DMConversationList = ({ 
  selectedPubkey, 
  onSelectConversation,
  className,
  onStatusClick
}: DMConversationListProps) => {
  const { conversations, isLoading, loadingPhase } = useDMContext();
  const [activeTab, setActiveTab] = useState<'known' | 'requests'>('known');

  // Filter conversations by type
  const { knownConversations, requestConversations } = useMemo(() => {
    return {
      knownConversations: conversations.filter(c => c.isKnown),
      requestConversations: conversations.filter(c => c.isRequest),
    };
  }, [conversations]);

  // Get the current list based on active tab
  const currentConversations = activeTab === 'known' ? knownConversations : requestConversations;

  // Show skeleton during initial load (cache + relays) if we have no conversations yet
  const isInitialLoad = (loadingPhase === LOADING_PHASES.CACHE || loadingPhase === LOADING_PHASES.RELAYS) && conversations.length === 0;

  return (
    <Card className={cn("h-full flex flex-col overflow-hidden", className)}>
      {/* Header - always visible */}
      <div className="p-4 border-b flex-shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-lg">Messages</h2>
          {(loadingPhase === LOADING_PHASES.CACHE || 
            loadingPhase === LOADING_PHASES.RELAYS || 
            loadingPhase === LOADING_PHASES.SUBSCRIPTIONS) && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">
                    {loadingPhase === LOADING_PHASES.CACHE && 'Loading from cache...'}
                    {loadingPhase === LOADING_PHASES.RELAYS && 'Querying relays for new messages...'}
                    {loadingPhase === LOADING_PHASES.SUBSCRIPTIONS && 'Setting up subscriptions...'}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {onStatusClick && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onStatusClick}
            aria-label="View messaging status"
          >
            <Info className="h-4 w-4" />
          </Button>
        )}
      </div>
      
      {/* Tab buttons - always visible */}
      <div className="px-2 pt-2 flex-shrink-0">
        <div className="grid grid-cols-2 gap-1 bg-muted p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('known')}
            className={cn(
              "text-xs py-2 px-3 rounded-md transition-colors",
              activeTab === 'known' 
                ? "bg-background shadow-sm font-medium" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Active {knownConversations.length > 0 && `(${knownConversations.length})`}
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={cn(
              "text-xs py-2 px-3 rounded-md transition-colors",
              activeTab === 'requests' 
                ? "bg-background shadow-sm font-medium" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Requests {requestConversations.length > 0 && `(${requestConversations.length})`}
          </button>
        </div>
      </div>
      
      {/* Content area - show skeleton during initial load, otherwise show conversations */}
      <div className="flex-1 min-h-0 mt-2 overflow-hidden">
        {(isLoading || isInitialLoad) ? (
          <ConversationListSkeleton />
        ) : conversations.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center text-muted-foreground px-4">
            <div>
              <p className="text-sm">No conversations yet</p>
              <p className="text-xs mt-1">Start a new conversation to get started</p>
            </div>
          </div>
        ) : currentConversations.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-center text-muted-foreground px-4">
            <p className="text-sm">No {activeTab} conversations</p>
          </div>
        ) : (
          <ScrollArea className="h-full block">
            <div className="block w-full px-2 py-2 space-y-1">
              {currentConversations.map((conversation) => (
                <ConversationItem
                  key={conversation.pubkey}
                  pubkey={conversation.pubkey}
                  isSelected={selectedPubkey === conversation.pubkey}
                  onClick={() => onSelectConversation(conversation.pubkey)}
                  lastMessage={conversation.lastMessage}
                  lastActivity={conversation.lastActivity}
                  hasNIP4Messages={conversation.hasNIP4Messages}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </Card>
  );
};
