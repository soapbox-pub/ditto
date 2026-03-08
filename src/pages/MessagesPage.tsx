import { DMMessagingInterface } from '@samthomson/nostr-messaging/ui';

export function MessagesPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <DMMessagingInterface />
    </div>
  );
}
