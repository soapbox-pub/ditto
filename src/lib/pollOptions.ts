import { BLOSSOM_URI_REGEX, resolveBlossomUrl } from '@/lib/blossomUri';
import { parseImetaMap, type ImetaEntry } from '@/lib/imeta';
import { declaredMediaType } from '@/lib/mediaUtils';

/** An image linked from a poll option's label. */
export interface PollOptionImage {
  /** Sanitized `https:` URL, with `blossom:` URIs already resolved. */
  url: string;
  imeta?: ImetaEntry;
}

/** A poll option label split into its text and the images it links. */
export interface PollOptionLabelParts {
  text: string;
  images: PollOptionImage[];
}

const URL_REGEX = new RegExp(`https?:\\/\\/\\S+|${BLOSSOM_URI_REGEX.source}`, 'gi');

/**
 * Pull image URLs and BUD-10 `blossom:` URIs out of a poll option label. A URL
 * counts as an image when the poll's imeta or the URL's extension says so;
 * everything else stays in the text. `blossomServers` resolves `blossom:` URIs
 * that carry no server hint.
 */
export function parsePollOptionLabel(
  label: string,
  imetaMap: Map<string, ImetaEntry>,
  blossomServers: string[],
): PollOptionLabelParts {
  const images: PollOptionImage[] = [];

  const text = label.replace(URL_REGEX, (raw) => {
    const imeta = imetaMap.get(raw);
    const isImage = !imeta?.encryption && declaredMediaType(raw, imeta?.mime) === 'image';
    const url = isImage ? resolveBlossomUrl(raw, blossomServers) : undefined;
    if (!url) return raw;
    images.push({ url, imeta });
    return ' ';
  });

  return { text: text.replace(/\s+/g, ' ').trim(), images };
}

/** Parse the `option` tags of a poll event, resolving images against its imeta. */
export function parsePollOptions(
  tags: string[][],
  blossomServers: string[],
): (PollOptionLabelParts & { id: string; label: string })[] {
  const imetaMap = parseImetaMap(tags);
  return tags
    .filter(([n]) => n === 'option')
    .map(([, id, label = '']) => ({ id, label, ...parsePollOptionLabel(label, imetaMap, blossomServers) }));
}
