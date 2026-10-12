// src/blobbi/actions/lib/blobbi-random-lyrics.ts

import { defineMessage, type IntlShape, type MessageDescriptor } from 'react-intl';

/**
 * Random lyrics for the Sing action.
 * These are fun, simple lyrics that users can sing to their Blobbi.
 */

export interface LyricsEntry {
  id: string;
  title: MessageDescriptor;
  lines: MessageDescriptor[];
}

/**
 * Collection of placeholder lyrics for singing to a Blobbi.
 * Simple, fun, and appropriate for all ages.
 */
export const BLOBBI_LYRICS: LyricsEntry[] = [
  {
    id: 'lullaby-1',
    title: defineMessage({ id: 'blobbiLyrics.lullaby.title', defaultMessage: 'Blobbi Lullaby' }),
    lines: [
      defineMessage({ id: 'blobbiLyrics.lullaby.line1', defaultMessage: 'Little Blobbi, close your eyes,' }),
      defineMessage({ id: 'blobbiLyrics.lullaby.line2', defaultMessage: 'Dream of stars up in the skies.' }),
      defineMessage({ id: 'blobbiLyrics.lullaby.line3', defaultMessage: 'Safe and warm, you drift away,' }),
      defineMessage({ id: 'blobbiLyrics.lullaby.line4', defaultMessage: "We'll play again another day." }),
    ],
  },
  {
    id: 'happy-song-1',
    title: defineMessage({ id: 'blobbiLyrics.happySong.title', defaultMessage: 'Happy Blobbi Song' }),
    lines: [
      defineMessage({ id: 'blobbiLyrics.happySong.line1', defaultMessage: 'Blobbi, Blobbi, jump around!' }),
      defineMessage({ id: 'blobbiLyrics.happySong.line2', defaultMessage: "You're the happiest friend I've found!" }),
      defineMessage({ id: 'blobbiLyrics.happySong.line3', defaultMessage: 'Dancing, playing, full of cheer,' }),
      defineMessage({ id: 'blobbiLyrics.happySong.line4', defaultMessage: "I'm so glad that you are here!" }),
    ],
  },
  {
    id: 'adventure-1',
    title: defineMessage({ id: 'blobbiLyrics.adventure.title', defaultMessage: 'Adventure Time' }),
    lines: [
      defineMessage({ id: 'blobbiLyrics.adventure.line1', defaultMessage: "Let's go on an adventure today," }),
      defineMessage({ id: 'blobbiLyrics.adventure.line2', defaultMessage: 'Through the clouds and far away!' }),
      defineMessage({ id: 'blobbiLyrics.adventure.line3', defaultMessage: 'Mountains high and valleys deep,' }),
      defineMessage({ id: 'blobbiLyrics.adventure.line4', defaultMessage: 'Memories to always keep.' }),
    ],
  },
  {
    id: 'breakfast-song',
    title: defineMessage({ id: 'blobbiLyrics.breakfast.title', defaultMessage: 'Breakfast Song' }),
    lines: [
      defineMessage({ id: 'blobbiLyrics.breakfast.line1', defaultMessage: 'Wake up, wake up, sleepy head,' }),
      defineMessage({ id: 'blobbiLyrics.breakfast.line2', defaultMessage: 'Time to get out of your bed!' }),
      defineMessage({ id: 'blobbiLyrics.breakfast.line3', defaultMessage: "Breakfast's waiting, fresh and yummy," }),
      defineMessage({ id: 'blobbiLyrics.breakfast.line4', defaultMessage: 'Food to fill your happy tummy!' }),
    ],
  },
  {
    id: 'rainy-day',
    title: defineMessage({ id: 'blobbiLyrics.rainyDay.title', defaultMessage: 'Rainy Day' }),
    lines: [
      defineMessage({ id: 'blobbiLyrics.rainyDay.line1', defaultMessage: 'Pitter patter on the roof,' }),
      defineMessage({ id: 'blobbiLyrics.rainyDay.line2', defaultMessage: 'Rainy days can be so nice.' }),
      defineMessage({ id: 'blobbiLyrics.rainyDay.line3', defaultMessage: "We'll stay cozy, me and you," }),
      defineMessage({ id: 'blobbiLyrics.rainyDay.line4', defaultMessage: 'Watching raindrops, one by two.' }),
    ],
  },
  {
    id: 'sunshine-song',
    title: defineMessage({ id: 'blobbiLyrics.sunshine.title', defaultMessage: 'Sunshine Song' }),
    lines: [
      defineMessage({ id: 'blobbiLyrics.sunshine.line1', defaultMessage: 'Good morning, sunshine, bright and warm,' }),
      defineMessage({ id: 'blobbiLyrics.sunshine.line2', defaultMessage: 'A brand new day is being born!' }),
      defineMessage({ id: 'blobbiLyrics.sunshine.line3', defaultMessage: 'Blue sky smiling down on me,' }),
      defineMessage({ id: 'blobbiLyrics.sunshine.line4', defaultMessage: 'Happy as can be, so free!' }),
    ],
  },
  {
    id: 'bedtime-1',
    title: defineMessage({ id: 'blobbiLyrics.bedtime.title', defaultMessage: 'Bedtime Blues' }),
    lines: [
      defineMessage({ id: 'blobbiLyrics.bedtime.line1', defaultMessage: 'The moon is up, the stars are bright,' }),
      defineMessage({ id: 'blobbiLyrics.bedtime.line2', defaultMessage: 'Time to say a soft goodnight.' }),
      defineMessage({ id: 'blobbiLyrics.bedtime.line3', defaultMessage: 'Snuggle up and close your eyes,' }),
      defineMessage({ id: 'blobbiLyrics.bedtime.line4', defaultMessage: 'Sweet dreams under starry skies.' }),
    ],
  },
  {
    id: 'play-time',
    title: defineMessage({ id: 'blobbiLyrics.playTime.title', defaultMessage: 'Play Time' }),
    lines: [
      defineMessage({ id: 'blobbiLyrics.playTime.line1', defaultMessage: 'Bounce and jump and run around,' }),
      defineMessage({ id: 'blobbiLyrics.playTime.line2', defaultMessage: 'Spin and twirl without a sound!' }),
      defineMessage({ id: 'blobbiLyrics.playTime.line3', defaultMessage: 'Playing games is so much fun,' }),
      defineMessage({ id: 'blobbiLyrics.playTime.line4', defaultMessage: 'Laughing underneath the sun!' }),
    ],
  },
];

/**
 * Get a random lyrics entry.
 */
export function getRandomLyrics(): LyricsEntry {
  const index = Math.floor(Math.random() * BLOBBI_LYRICS.length);
  return BLOBBI_LYRICS[index];
}

/**
 * Get all available lyrics entries.
 */
export function getAllLyrics(): LyricsEntry[] {
  return BLOBBI_LYRICS;
}

/**
 * Format lyrics for display (joined with newlines).
 */
export function formatLyrics(intl: IntlShape, lyrics: LyricsEntry): string {
  return lyrics.lines.map((line) => intl.formatMessage(line)).join('\n');
}
