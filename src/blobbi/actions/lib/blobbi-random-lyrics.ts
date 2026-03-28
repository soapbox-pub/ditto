// src/blobbi/actions/lib/blobbi-random-lyrics.ts

/**
 * Random lyrics for the Sing action.
 * These are fun, simple lyrics that users can sing to their Blobbi.
 */

export interface LyricsEntry {
  id: string;
  title: string;
  lines: string[];
}

/**
 * Collection of placeholder lyrics for singing to a Blobbi.
 * Simple, fun, and appropriate for all ages.
 */
export const BLOBBI_LYRICS: LyricsEntry[] = [
  {
    id: 'lullaby-1',
    title: 'Blobbi Lullaby',
    lines: [
      'Little Blobbi, close your eyes,',
      'Dream of stars up in the skies.',
      'Safe and warm, you drift away,',
      "We'll play again another day.",
    ],
  },
  {
    id: 'happy-song-1',
    title: 'Happy Blobbi Song',
    lines: [
      'Blobbi, Blobbi, jump around!',
      "You're the happiest friend I've found!",
      'Dancing, playing, full of cheer,',
      "I'm so glad that you are here!",
    ],
  },
  {
    id: 'adventure-1',
    title: 'Adventure Time',
    lines: [
      "Let's go on an adventure today,",
      'Through the clouds and far away!',
      'Mountains high and valleys deep,',
      'Memories to always keep.',
    ],
  },
  {
    id: 'breakfast-song',
    title: 'Breakfast Song',
    lines: [
      'Wake up, wake up, sleepy head,',
      "Time to get out of your bed!",
      "Breakfast's waiting, fresh and yummy,",
      'Food to fill your happy tummy!',
    ],
  },
  {
    id: 'rainy-day',
    title: 'Rainy Day',
    lines: [
      'Pitter patter on the roof,',
      'Rainy days can be so nice.',
      "We'll stay cozy, me and you,",
      'Watching raindrops, one by two.',
    ],
  },
  {
    id: 'sunshine-song',
    title: 'Sunshine Song',
    lines: [
      'Good morning, sunshine, bright and warm,',
      'A brand new day is being born!',
      'Blue sky smiling down on me,',
      'Happy as can be, so free!',
    ],
  },
  {
    id: 'bedtime-1',
    title: 'Bedtime Blues',
    lines: [
      'The moon is up, the stars are bright,',
      'Time to say a soft goodnight.',
      'Snuggle up and close your eyes,',
      'Sweet dreams under starry skies.',
    ],
  },
  {
    id: 'play-time',
    title: 'Play Time',
    lines: [
      "Bounce and jump and run around,",
      "Spin and twirl without a sound!",
      "Playing games is so much fun,",
      "Laughing underneath the sun!",
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
export function formatLyrics(lyrics: LyricsEntry): string {
  return lyrics.lines.join('\n');
}
