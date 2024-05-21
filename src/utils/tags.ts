/** Get the values for a tag in a `Set`. */
function getTagSet(tags: string[][], tagName: string): Set<string> {
  const set = new Set<string>();

  tags.forEach((tag) => {
    if (tag[0] === tagName) {
      set.add(tag[1]);
    }
  });

  return set;
}

/** Check if the tag exists by its name and value. */
function hasTag(tags: string[][], tag: string[]): boolean {
  return tags.some(([name, value]) => name === tag[0] && value === tag[1]);
}

/** Delete all occurences of the tag by its name/value pair. */
function deleteTag(tags: readonly string[][], tag: string[]): string[][] {
  return tags.filter(([name, value]) => !(name === tag[0] && value === tag[1]));
}

/** Add a tag to the list, replacing the name/value pair if it already exists. */
function addTag(tags: readonly string[][], tag: string[]): string[][] {
  const tagIndex = tags.findIndex(([name, value]) => name === tag[0] && value === tag[1]);
  if (tagIndex === -1) {
    return [...tags, tag];
  } else {
    return [...tags.slice(0, tagIndex), tag, ...tags.slice(tagIndex + 1)];
  }
}

/** Tag is a NIP-10 root tag. */
function isRootTag(tag: string[]): tag is ['e', string, string, 'root', ...string[]] {
  return tag[0] === 'e' && tag[3] === 'root';
}

/** Tag is a NIP-10 reply tag. */
function isReplyTag(tag: string[]): tag is ['e', string, string, 'reply', ...string[]] {
  return tag[0] === 'e' && tag[3] === 'reply';
}

/** Tag is a legacy "e" tag with a "mention" marker. */
function isLegacyQuoteTag(tag: string[]): tag is ['e', string, string, 'mention', ...string[]] {
  return tag[0] === 'e' && tag[3] === 'mention';
}

/** Tag is an "e" tag without a NIP-10 marker. */
function isLegacyReplyTag(tag: string[]): tag is ['e', string, string] {
  return tag[0] === 'e' && !tag[3];
}

/** Tag is a "q" tag. */
function isQuoteTag(tag: string[]): tag is ['q', ...string[]] {
  return tag[0] === 'q';
}

/** Get the "e" tag for the event being replied to, first according to the NIPs then falling back to the legacy way. */
function findReplyTag(tags: string[][]): ['e', ...string[]] | undefined {
  return tags.find(isReplyTag) || tags.find(isRootTag) || tags.findLast(isLegacyReplyTag);
}

/** Get the "q" tag, falling back to the legacy "e" tag with a "mention" marker. */
function findQuoteTag(
  tags: string[][],
): ['q', ...string[]] | ['e', string, string, 'mention', ...string[]] | undefined {
  return tags.find(isQuoteTag) || tags.find(isLegacyQuoteTag);
}

export { addTag, deleteTag, findQuoteTag, findReplyTag, getTagSet, hasTag };
