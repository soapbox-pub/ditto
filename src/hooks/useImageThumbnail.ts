import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import {
  canThumbnail,
  getImageThumbnail,
  hasImageThumbnail,
  subscribeImageThumbnail,
  whenNearViewport,
  type ImageThumbnail,
} from '@/lib/imageThumbnails';

export interface ImageThumbnailSource {
  /** What to put in `src`: the thumbnail, or the original. Undefined while pending. */
  src: string | undefined;
  /** Attach to the rendered img, so the thumbnail waits until it nears the viewport. */
  ref: (node: Element | null) => void;
}

const SETTLED_ORIGINAL: ImageThumbnail = { status: 'ready' };
const noopSubscribe = () => () => {};

/**
 * A downscaled copy of the image at `url` (see `imageThumbnails`), or `url`
 * itself when it can't or needn't be shrunk. For images drawn far smaller
 * than they're likely uploaded: avatars, preview swatches.
 */
export function useImageThumbnail(url: string | undefined): ImageThumbnailSource {
  const eligible = canThumbnail(url);
  // A ref, not state: storing the node would cost every avatar a second render.
  const nodeRef = useRef<Element | null>(null);
  const ref = useCallback((node: Element | null) => {
    nodeRef.current = node;
  }, []);
  const [nearUrl, setNearUrl] = useState<string>();

  // Start once the avatar nears the viewport, or right away if another avatar
  // already started this picture.
  const active = eligible && (nearUrl === url || hasImageThumbnail(url));

  useEffect(() => {
    const node = nodeRef.current;
    if (!eligible || active || !node) return;
    return whenNearViewport(node, () => setNearUrl(url));
  }, [eligible, active, url]);

  const subscribe = useMemo(
    () => (active ? (listener: () => void) => subscribeImageThumbnail(url, listener) : noopSubscribe),
    [active, url],
  );
  const getSnapshot = useCallback(
    () => (active ? getImageThumbnail(url) : SETTLED_ORIGINAL),
    [active, url],
  );
  const thumbnail = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  if (!eligible) return { src: url, ref };
  if (!active || thumbnail.status === 'loading') return { src: undefined, ref };
  return { src: thumbnail.src ?? url, ref };
}
