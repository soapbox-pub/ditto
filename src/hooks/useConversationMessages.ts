import { useCallback, useEffect, useMemo, useState } from "react";
import { useDMContext } from "@/hooks/useDMContext";

const MESSAGES_PER_PAGE = 25;

/**
 * Hook to access paginated messages for a specific conversation.
 * 
 * Returns the most recent messages (default 25) with the ability to load earlier messages.
 * Automatically resets to default page size when switching conversations.
 * 
 * @example
 * ```tsx
 * import { useConversationMessages } from '@/contexts/DMContext';
 * 
 * function MessageThread({ recipientPubkey }: { recipientPubkey: string }) {
 *   const { 
 *     messages, 
 *     hasMoreMessages, 
 *     loadEarlierMessages,
 *     totalCount 
 *   } = useConversationMessages(recipientPubkey);
 * 
 *   return (
 *     <div>
 *       {hasMoreMessages && (
 *         <button onClick={loadEarlierMessages}>
 *           Load Earlier ({totalCount - messages.length} more)
 *         </button>
 *       )}
 *       {messages.map(msg => (
 *         <div key={msg.id}>{msg.decryptedContent}</div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 * 
 * @param conversationId - The pubkey of the conversation participant
 * @returns Paginated message data with loading function
 */
export function useConversationMessages(conversationId: string) {
  const { messages: allMessages } = useDMContext();
  const [visibleCount, setVisibleCount] = useState(MESSAGES_PER_PAGE);

  const result = useMemo(() => {
    const conversationData = allMessages.get(conversationId);

    if (!conversationData) {
      return {
        messages: [],
        hasMoreMessages: false,
        totalCount: 0,
        lastMessage: null,
        lastActivity: 0,
      };
    }

    const totalMessages = conversationData.messages.length;
    const hasMore = totalMessages > visibleCount;
    
    // Return the most recent N messages (slice from the end)
    const visibleMessages = conversationData.messages.slice(-visibleCount);

    return {
      messages: visibleMessages,
      hasMoreMessages: hasMore,
      totalCount: totalMessages,
      lastMessage: conversationData.lastMessage,
      lastActivity: conversationData.lastActivity,
    };
  }, [allMessages, conversationId, visibleCount]);

  const loadEarlierMessages = useCallback(() => {
    setVisibleCount(prev => prev + MESSAGES_PER_PAGE);
  }, []);

  // Reset visible count when conversation changes
  useEffect(() => {
    setVisibleCount(MESSAGES_PER_PAGE);
  }, [conversationId]);

  return {
    ...result,
    loadEarlierMessages,
  };
}