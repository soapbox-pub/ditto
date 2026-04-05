/**
 * Re-exports DM hooks from the @samthomson/nostr-messaging package.
 * Separated from DMProviderWrapper to avoid Fast Refresh warnings.
 */
export {
  useDMContext,
  useConversationMessages,
} from '@samthomson/nostr-messaging/core';
