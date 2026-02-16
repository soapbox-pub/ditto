import { useContext } from "react";
import { DMContext, DMContextType } from "@/contexts/DMContext";

/**
 * Hook to access the direct messaging system.
 * 
 * Provides access to conversations, message sending, loading states, and cache management.
 * Must be used within a DMProvider.
 * 
 * @example
 * ```tsx
 * import { useDMContext } from '@/hooks/useDMContext';
 * import { MESSAGE_PROTOCOL } from '@/lib/dmConstants';
 * 
 * function MyComponent() {
 *   const { conversations, sendMessage, isLoading } = useDMContext();
 * 
 *   // Send a message
 *   await sendMessage({
 *     recipientPubkey: 'hex-pubkey',
 *     content: 'Hello!',
 *     protocol: MESSAGE_PROTOCOL.NIP17
 *   });
 * 
 *   // Display conversations
 *   return (
 *     <div>
 *       {isLoading ? 'Loading...' : conversations.map(c => (
 *         <div key={c.pubkey}>{c.lastMessage?.decryptedContent}</div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 * 
 * @returns DMContextType - The direct messaging context
 * @throws Error if used outside DMProvider
 */
export function useDMContext(): DMContextType {
  const context = useContext(DMContext);
  if (!context) {
    throw new Error('useDMContext must be used within DMProvider');
  }
  return context;
}