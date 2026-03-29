// src/blobbi/actions/lib/blobbi-activity-state.ts

import type { SelectedTrack } from '../components/PlayMusicModal';

/**
 * Types of inline activities that can be displayed in BlobbiPage
 */
export type InlineActivityType = 'none' | 'music' | 'sing';

// Re-export for convenience
export type { SelectedTrack } from '../components/PlayMusicModal';

/**
 * State for the music inline activity
 */
export interface MusicActivityState {
  type: 'music';
  selection: SelectedTrack;
  isPublished: boolean;
}

/**
 * State for the sing inline activity
 */
export interface SingActivityState {
  type: 'sing';
}

/**
 * No active inline activity
 */
export interface NoActivityState {
  type: 'none';
}

/**
 * Union type for all inline activity states
 */
export type InlineActivityState = 
  | NoActivityState 
  | MusicActivityState 
  | SingActivityState;

/**
 * Blobbi reaction state - indicates how Blobbi should visually react
 */
export type BlobbiReactionState = 
  | 'idle'           // No special reaction
  | 'listening'      // Music is playing, Blobbi is listening
  | 'swaying'        // Blobbi is swaying to music
  | 'singing'        // User is singing, Blobbi is engaged
  | 'happy';         // General happy reaction

/**
 * Helper to create a music activity state
 */
export function createMusicActivity(selection: SelectedTrack): MusicActivityState {
  return {
    type: 'music',
    selection,
    isPublished: false,
  };
}

/**
 * Helper to create a sing activity state
 */
export function createSingActivity(): SingActivityState {
  return {
    type: 'sing',
  };
}

/**
 * Helper to create no activity state
 */
export function createNoActivity(): NoActivityState {
  return {
    type: 'none',
  };
}
