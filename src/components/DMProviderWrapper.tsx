import { type ReactNode, useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import {
  DMProvider,
  DEFAULT_NEW_MESSAGE_SOUNDS,
  useDMContext as useDMContextFromPackage,
  useConversationMessages as useConversationMessagesFromPackage,
} from '@samthomson/nostr-messaging/core';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useAuthorsBatch } from '@/hooks/useAuthorsBatch';
import { useProfileSupplementary } from '@/hooks/useProfileData';
import { useIsMobile } from '@/hooks/useIsMobile';
import { toast } from '@/hooks/useToast';
import { getDisplayName } from '@/lib/getDisplayName';

export { useDMContextFromPackage as useDMContext, useConversationMessagesFromPackage as useConversationMessages };

interface DMProviderWrapperProps {
  children: ReactNode;
}

export function DMProviderWrapper({ children }: DMProviderWrapperProps) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { mutateAsync: uploadFileMutation } = useUploadFile();
  const isMobile = useIsMobile();

  // Get the current user's follows
  const { data: profileData } = useProfileSupplementary(user?.pubkey);
  const follows = useMemo(() => profileData?.following ?? [], [profileData]);

  // Wrap publishEvent to match the expected signature
  const handlePublishEvent = async (event: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>): Promise<void> => {
    await publishEvent(event);
  };

  // Wrap uploadFile to return just the URL string
  const handleUploadFile = async (file: File): Promise<string> => {
    const tags = await uploadFileMutation(file);
    return tags[0][1]; // Return the URL from the first tag
  };

  // Wrap getDisplayName to match the expected signature
  const handleGetDisplayName = (pubkey: string, metadata?: Parameters<typeof getDisplayName>[0]) => {
    return getDisplayName(metadata, pubkey);
  };

  // Wrap toast to match the expected signature
  const handleNotify = (options: { title?: string; description?: string; variant?: 'default' | 'destructive' }) => {
    toast({
      title: options.title,
      description: options.description,
      variant: options.variant,
    });
  };

  const messaging = useMemo(() => config.messaging ?? {}, [config.messaging]);

  // Discovery relays for DM inbox discovery
  const discoveryRelays = useMemo(() => {
    if (messaging.discoveryRelays?.length) {
      return messaging.discoveryRelays;
    }
    return config.relayMetadata.relays
      .filter(r => r.read)
      .map(r => r.url);
  }, [messaging.discoveryRelays, config.relayMetadata.relays]);

  const relayMode = messaging.relayMode ?? 'hybrid';
  const renderInlineMedia = messaging.renderInlineMedia ?? true;
  const soundEnabled = messaging.soundEnabled ?? false;
  const soundId = messaging.soundId ?? DEFAULT_NEW_MESSAGE_SOUNDS[0]?.id ?? '';
  const devMode = messaging.devMode ?? false;

  return (
    <DMProvider
      nostr={nostr}
      user={user ?? null}
      messagingConfig={{
        discoveryRelays,
        relayMode,
        renderInlineMedia,
        devMode,
        appName: config.appName,
        appDescription: `Direct messages on ${config.appName}`,
        soundPref: {
          options: DEFAULT_NEW_MESSAGE_SOUNDS,
          value: { enabled: soundEnabled, soundId },
          onChange: () => {},
        },
      }}
      onNotify={handleNotify}
      getDisplayName={handleGetDisplayName}
      fetchAuthorsBatch={useAuthorsBatch}
      publishEvent={handlePublishEvent}
      uploadFile={handleUploadFile}
      follows={follows}
      ui={{
        showShorts: false,
        showSearch: true,
        isMobile,
      }}
    >
      {children}
    </DMProvider>
  );
}
