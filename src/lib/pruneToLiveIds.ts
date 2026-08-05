/**
 * Drop every entry whose key is not in `liveIds`.
 *
 * Hooks that cache per-session work in a ref (an in-flight marker, a last
 * attempt, a timestamp map) must forget a session once its tab closes,
 * otherwise the ref grows for the lifetime of the hook and can pin whole
 * message arrays. The live id set always comes from the session list, which
 * is the only thing that removes a session, so a rebuild never prunes a
 * session that is still open.
 *
 * Accepts anything with `keys()` and `delete()`, which covers both `Set` and
 * `Map`. The keys are copied first, so the deletes do not mutate the
 * collection while it is being iterated.
 */
export function pruneToLiveIds(
  entries: { keys(): Iterable<string>; delete(key: string): boolean },
  liveIds: ReadonlySet<string>,
): void {
  for (const key of [...entries.keys()]) {
    if (!liveIds.has(key)) entries.delete(key);
  }
}
