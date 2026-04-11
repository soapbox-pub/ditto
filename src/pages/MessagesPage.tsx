import { DMMessagingInterface } from '@samthomson/nostr-messaging/ui';
import { Link } from 'react-router-dom';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useAppContext } from '@/hooks/useAppContext';

export function MessagesPage() {
  const { config } = useAppContext();
  const messagingEnabled = config.messaging?.enabled ?? false;

  // Hide the right sidebar and expand the main content area for messaging.
  // noOverscroll: avoid pb-overscroll on the main column so this fixed-height layout doesn't get extra scroll.
  useLayoutOptions({ 
    rightSidebar: null,
    noMaxWidth: true,
    noOverscroll: true,
    wrapperClassName: 'max-w-full',
  });

  return (
    <div className="h-dvh flex flex-col">
      {messagingEnabled ? (
        <DMMessagingInterface />
      ) : (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md text-center space-y-3">
            <h2 className="text-xl font-semibold">Chats are turned off</h2>
            <p className="text-sm text-muted-foreground">
              Enable messaging in Settings to start using chats.
            </p>
            <Link to="/settings/messaging" className="inline-block text-sm text-primary hover:underline">
              Open Messaging Settings
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
