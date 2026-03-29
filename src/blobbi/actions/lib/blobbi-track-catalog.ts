// src/blobbi/actions/lib/blobbi-track-catalog.ts

/**
 * Blobbi Track Catalog
 * 
 * Music tracks for the Blobbi "Play Music" action.
 * All tracks are hosted on remote Blossom servers and streamed on-demand.
 * 
 * ## Adding New Tracks
 * 
 * 1. Convert the audio file to M4A (AAC-LC):
 *    `ffmpeg -i input.m4a -c:a aac -b:a 64k -ar 48000 output.m4a`
 * 2. Upload the M4A file to a Blossom server
 * 3. Add a new entry to `BLOBBI_TRACK_CATALOG` below
 * 4. Set `url` to the full Blossom URL
 * 5. Get the duration: `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 <file>`
 * 
 * ## Supported Formats
 * 
 * M4A (AAC-LC) is required for iOS/Safari compatibility and small file size.
 */

export interface BlobbiTrack {
  /** Unique identifier for the track (used in state/events) */
  id: string;
  /** Display title shown in the UI */
  title: string;
  /** Artist or source attribution */
  artist: string;
  /** Full URL to the remote audio file (Blossom server) */
  url: string;
  /** Duration in seconds (for display, get via ffprobe) */
  durationSeconds: number;
  /** Optional cover art URL */
  coverArt?: string;
  /** Optional tags for categorization/filtering */
  tags?: string[];
}

/**
 * Blobbi track catalog.
 * 
 * All tracks are royalty-free/Creative Commons licensed.
 * Audio files hosted on remote Blossom servers.
 */
export const BLOBBI_TRACK_CATALOG: BlobbiTrack[] = [
  {
    id: 'nap_in_the_meadow',
    title: 'Nap in the Meadow',
    artist: 'Chilltape FM',
    url: 'https://blossom.ditto.pub/6be1c95e879187f83af2a661ccac2bd96196f7bc334af44529ede6270b2811fc.m4a',
    durationSeconds: 240, // 4:00
    tags: ['relaxing', 'nature'],
  },
  {
    id: 'happy_kids',
    title: 'Happy Kids',
    artist: 'Dmitrii Kolesnikov',
    url: 'https://blossom.ditto.pub/94d49abd178aa8afb14737a55e0a7143f6b337f618d74858d011232bb2db845d.m4a',
    durationSeconds: 129, // 2:09
    tags: ['upbeat', 'fun'],
  },
  {
    id: 'soft_piano',
    title: 'Soft Piano',
    artist: 'Dmitrii Kolesnikov',
    url: 'https://blossom.ditto.pub/5367242d3dc555c77f5c637fd153df1166708a24c5a4c222bb4dcaeabf740743.m4a',
    durationSeconds: 124, // 2:04
    tags: ['calming', 'sleep'],
  },
  {
    id: 'epic_sacred_light',
    title: 'Epic Sacred Light',
    artist: 'Ura Megis',
    url: 'https://blossom.dreamith.to/c22953791d686605958165fd44a84cd7d9fd3d4423ebf786e47891ed3a82c6db.m4a',
    durationSeconds: 223, // 3:43
    tags: ['energetic', 'adventure'],
  },
  {
    id: 'split_memories',
    title: 'Split Memories',
    artist: 'ido berg',
    url: 'https://blossom.ditto.pub/57ba2e2122a732449880ae531d4bfac9a580bc19693c7dda735afbfa336b35fe.m4a',
    durationSeconds: 153, // 2:33
    tags: ['ambient', 'relaxing'],
  },
  {
    id: 'minhas_mensagens',
    title: 'Minhas Mensagens',
    artist: 'PReis',
    url: 'https://blossom.ditto.pub/0945064dc8f946f3392be23629b166e72090cafca7cca865a20b5395dd83ff46.m4a',
    durationSeconds: 248, // 4:08
    tags: ['ambient', 'relaxing'],
  },
];

/**
 * Get a track by ID from the catalog
 */
export function getTrackById(id: string): BlobbiTrack | undefined {
  return BLOBBI_TRACK_CATALOG.find(track => track.id === id);
}

/**
 * Get all tracks from the catalog
 */
export function getAllTracks(): BlobbiTrack[] {
  return BLOBBI_TRACK_CATALOG;
}

/**
 * Format duration in seconds to MM:SS string
 */
export function formatTrackDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
