import { useAudioPlayer, type TrackLoadState } from '@/contexts/audioPlayerContextDef';

const READY: TrackLoadState = { status: 'ready' };

/**
 * The player's load state, but only for the track a card actually represents.
 *
 * Cards all over the app render a play button for their own event; they care
 * whether *that* track is the one stuck decrypting, not whatever the player is
 * doing for someone else.
 */
export function useTrackLoadState(trackId: string): TrackLoadState {
  const { currentTrack, loadState } = useAudioPlayer();
  return currentTrack?.id === trackId ? loadState : READY;
}
