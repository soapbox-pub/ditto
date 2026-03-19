import { DMMessagingInterface } from '@samthomson/nostr-messaging/ui';
import { useLayoutOptions } from '@/contexts/LayoutContext';

export function MessagesPage() {
  // Hide the right sidebar and expand the main content area for messaging.
  // noOverscroll: avoid pb-overscroll on the main column so this fixed-height layout doesn't get extra scroll.
  useLayoutOptions({ 
    rightSidebar: null,
    wrapperClassName: 'max-w-full',
    noOverscroll: true,
  });

  return (
    <div className="h-screen flex flex-col">
      <DMMessagingInterface />
    </div>
  );
}
