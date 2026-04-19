import { isBlurhashValid } from 'blurhash';

/** Returns `true` when `hash` is a structurally valid blurhash string. */
export function isValidBlurhash(hash: string | undefined | null): hash is string {
  if (!hash) return false;
  return isBlurhashValid(hash).result;
}
