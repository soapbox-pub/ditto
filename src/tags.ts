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

export { getTagSet };
