import { DMMessagingInterface } from '@samthomson/nostr-messaging/ui';
import { useLayoutOptions } from '@/contexts/LayoutContext';

export function MessagesPage() {
  // Hide the right sidebar and expand the main content area for messaging
  useLayoutOptions({ 
    rightSidebar: null,
    wrapperClassName: 'max-w-full'
  });

  return (
    <div className="h-screen flex flex-col">
      <DMMessagingInterface />
    </div>
  );
}
