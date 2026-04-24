/**
 * Module-level mute state shared across all vine / short-form video players.
 *
 * Both `VineMedia` (in NoteCard feeds) and `VineCard` (in VinesFeedPage)
 * read and write the same value so toggling mute in one context carries
 * over to the other.
 */
let muted = true;

/** Whether vine players are currently muted. */
export function isVineMuted(): boolean {
  return muted;
}

/** Set the shared vine mute state. */
export function setVineMuted(value: boolean): void {
  muted = value;
}
