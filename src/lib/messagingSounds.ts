import { DEFAULT_NEW_MESSAGE_SOUNDS, type NewMessageSoundOption } from '@samthomson/nostr-messaging/core';

export const APP_NEW_MESSAGE_SOUNDS: NewMessageSoundOption[] = [
  ...DEFAULT_NEW_MESSAGE_SOUNDS,
  {
    id: 'ditto',
    label: 'Ditto',
    url: '/custom-sounds/ditto.mp3',
  },
];
