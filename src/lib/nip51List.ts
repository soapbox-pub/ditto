import type { NostrEvent, NostrSigner } from '@nostrify/nostrify';

/**
 * Reading and editing NIP-51 lists whose entries may be public (tags) or
 * private (encrypted to the author's own key in `content`).
 *
 * A list is edited in the mode it's already in, so a list made in another
 * client keeps the shape that client expects:
 *
 * - A list with encrypted content, or no list yet, is **private**: new entries
 *   are encrypted.
 * - A list with only public tags is **public**: new entries are public tags,
 *   until the user chooses to make it private ({@link makeListPrivate}).
 *
 * Removing an entry removes it from both halves. The encrypted half is only
 * rewritten when it actually changes, and never when it couldn't be read, so
 * an edit can't wipe entries that failed to decrypt.
 */

/** A list's entries, split by where they're stored. */
export interface Nip51ListContents {
  /** All public tags, including non-entry tags such as `alt` or `client`. */
  publicTags: string[][];
  /** Decrypted private tags. Empty when there are none or they're unreadable. */
  privateTags: string[][];
  /** The list has encrypted content that couldn't be decrypted. */
  unreadable: boolean;
}

export type Nip51Visibility = 'public' | 'private';

/** Thrown when an edit would have to rewrite private entries it can't read. */
export class UnreadableListError extends Error {
  constructor() {
    super("Couldn't read the private part of this list. Try again once your signer can decrypt it.");
    this.name = 'UnreadableListError';
  }
}

/** Thrown when private entries must be encrypted but the signer lacks NIP-44. */
export class ListEncryptionUnsupportedError extends Error {
  constructor() {
    super('Your signer cannot encrypt private list entries (NIP-44).');
    this.name = 'ListEncryptionUnsupportedError';
  }
}

/** Decrypt a list's private tags (NIP-44, or legacy NIP-04 per NIP-51). */
async function decryptTags(content: string, signer: NostrSigner, pubkey: string): Promise<string[][] | null> {
  try {
    const plaintext = content.includes('?iv=')
      ? await signer.nip04?.decrypt(pubkey, content)
      : await signer.nip44?.decrypt(pubkey, content);
    if (plaintext === undefined) return null;
    const tags: unknown = JSON.parse(plaintext);
    if (!Array.isArray(tags)) return null;
    return tags.filter((tag): tag is string[] => Array.isArray(tag) && tag.every((v) => typeof v === 'string'));
  } catch {
    return null;
  }
}

export async function readNip51List(
  event: NostrEvent | null | undefined,
  signer: NostrSigner,
  pubkey: string,
): Promise<Nip51ListContents> {
  if (!event) return { publicTags: [], privateTags: [], unreadable: false };
  if (!event.content) return { publicTags: event.tags, privateTags: [], unreadable: false };

  const privateTags = await decryptTags(event.content, signer, pubkey);
  return privateTags
    ? { publicTags: event.tags, privateTags, unreadable: false }
    : { publicTags: event.tags, privateTags: [], unreadable: true };
}

/** The mode a list is edited in. See the module docs. */
export function listVisibility(event: NostrEvent | null | undefined, isEntry: (tag: string[]) => boolean): Nip51Visibility {
  if (!event || event.content) return 'private';
  return event.tags.some(isEntry) ? 'public' : 'private';
}

interface EditListOptions {
  prev: NostrEvent | null | undefined;
  contents: Nip51ListContents;
  signer: NostrSigner;
  pubkey: string;
  /** Tags to add, if not already present in either half. */
  add?: string[][];
  /** Entries to remove from both halves. */
  remove?: (tag: string[]) => boolean;
  /** Whether a tag is a list entry (as opposed to `alt`, `client`, …). */
  isEntry: (tag: string[]) => boolean;
  /** Tags are equal as entries. Defaults to comparing name and value. */
  same?: (a: string[], b: string[]) => boolean;
}

const sameEntry = (a: string[], b: string[]) => a[0] === b[0] && a[1] === b[1];

async function encryptTags(tags: string[][], signer: NostrSigner, pubkey: string): Promise<string> {
  if (!tags.length) return '';
  if (!signer.nip44) throw new ListEncryptionUnsupportedError();
  return signer.nip44.encrypt(pubkey, JSON.stringify(tags));
}

/** A list edit: the new event's `tags` and `content`, and its private tags. */
export interface Nip51ListEdit {
  tags: string[][];
  content: string;
  /** Decrypted private tags of the result, so callers needn't decrypt again. */
  privateTags: string[][];
}

/**
 * Apply additions and removals to a list, in the list's current mode.
 */
export async function editNip51List({
  prev, contents, signer, pubkey, add = [], remove, isEntry, same = sameEntry,
}: EditListOptions): Promise<Nip51ListEdit> {
  const visibility = listVisibility(prev, isEntry);
  const existing = [...contents.publicTags.filter(isEntry), ...contents.privateTags];
  const toAdd = add.filter((tag) => !existing.some((e) => same(e, tag)));

  let publicTags = contents.publicTags;
  let privateTags = contents.privateTags;
  let privateChanged = false;

  if (remove) {
    publicTags = publicTags.filter((tag) => !(isEntry(tag) && remove(tag)));
    // An entry that isn't public may be in the half we can't read. Publishing
    // the list unchanged would report a removal that didn't happen.
    if (contents.unreadable && publicTags.length === contents.publicTags.length) {
      throw new UnreadableListError();
    }
    const kept = privateTags.filter((tag) => !remove(tag));
    privateChanged = kept.length !== privateTags.length;
    privateTags = kept;
  }

  if (toAdd.length) {
    if (visibility === 'public') {
      publicTags = [...publicTags, ...toAdd];
    } else {
      privateTags = [...privateTags, ...toAdd];
      privateChanged = true;
    }
  }

  if (!privateChanged) {
    return { tags: publicTags, content: prev?.content ?? '', privateTags };
  }
  if (contents.unreadable) throw new UnreadableListError();
  return { tags: publicTags, content: await encryptTags(privateTags, signer, pubkey), privateTags };
}

/** Move every public entry into the encrypted half. */
export async function makeListPrivate({
  contents, signer, pubkey, isEntry, same = sameEntry,
}: Omit<EditListOptions, 'prev' | 'add' | 'remove'>): Promise<Nip51ListEdit> {
  if (contents.unreadable) throw new UnreadableListError();
  const moving = contents.publicTags.filter(isEntry);
  const privateTags = [...contents.privateTags];
  for (const tag of moving) {
    if (!privateTags.some((e) => same(e, tag))) privateTags.push(tag);
  }
  return {
    tags: contents.publicTags.filter((tag) => !isEntry(tag)),
    content: await encryptTags(privateTags, signer, pubkey),
    privateTags,
  };
}
