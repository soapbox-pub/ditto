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

/** Delete all occurences of the tag by its name/value pair. */
function deleteTag(tags: readonly string[][], tag: string[]): string[][] {
  return tags.filter(([name, value]) => !(name === tag[0] && value === tag[1]));
}

/** Add a tag to the list, replacing the name/value pair if it already exists. */
function setTag(tags: readonly string[][], tag: string[]): string[][] {
  const tagIndex = tags.findIndex(([name, value]) => name === tag[0] && value === tag[1]);
  if (tagIndex === -1) {
    return [...tags, tag];
  } else {
    return [...tags.slice(0, tagIndex), tag, ...tags.slice(tagIndex + 1)];
  }
}

export { deleteTag, getTagSet, setTag };
