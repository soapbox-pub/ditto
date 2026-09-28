import { useState, useEffect } from 'react';
import type Hls from 'hls.js';

/** Widest thumbnail worth producing: posters render at feed-card width. */
const MAX_THUMBNAIL_WIDTH = 640;

/** Thumbnails kept across mounts. At ~20-60 KB each this caps out at a few MB. */
const MAX_CACHED_THUMBNAILS = 100;

/**
 * Captured thumbnails by video URL, oldest first. `null` records a video that
 * can't be captured (CORS, blank frame) so it isn't retried. Feed cards unmount
 * and remount as they scroll in and out of range, and without this every
 * remount re-downloaded, seeked and re-encoded the same frame.
 */
const thumbnailCache = new Map<string, string | null>();

function cacheThumbnail(src: string, url: string | null): void {
  thumbnailCache.delete(src);
  thumbnailCache.set(src, url);
  while (thumbnailCache.size > MAX_CACHED_THUMBNAILS) {
    const [oldest, oldUrl] = thumbnailCache.entries().next().value as [string, string | null];
    thumbnailCache.delete(oldest);
    // An <img> that already loaded this URL keeps showing it after revocation.
    if (oldUrl) URL.revokeObjectURL(oldUrl);
  }
}

/**
 * Draw the video's current frame, downscaled, and encode it as a JPEG object
 * URL. Resolves `undefined` for a tainted canvas (CORS) or a blank frame.
 *
 * Downscaled and encoded with `toBlob` because this runs for every poster-less
 * video in a feed: drawing a 1080p/4K frame at full size and encoding it with
 * the synchronous `toDataURL` blocked the main thread for 120-435ms per video.
 * `toBlob` encodes off the main thread.
 */
function captureFrame(video: HTMLVideoElement): Promise<string | undefined> {
  return new Promise((resolve) => {
    try {
      const width = video.videoWidth || 320;
      const height = video.videoHeight || 180;
      const scale = Math.min(1, MAX_THUMBNAIL_WIDTH / width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(undefined);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      // A blank frame encodes to a few hundred bytes.
      canvas.toBlob(
        (blob) => resolve(blob && blob.size > 750 ? URL.createObjectURL(blob) : undefined),
        'image/jpeg',
        0.7,
      );
    } catch {
      resolve(undefined); // CORS or tainted canvas
    }
  });
}

/**
 * Extracts a thumbnail frame from a video URL by loading it off-screen,
 * drawing the first frame to a canvas, and returning an object URL for it.
 * Works reliably on Android WebView where preload="metadata" doesn't render a visible frame.
 */
export function useVideoThumbnail(src: string, poster: string | undefined): string | undefined {
  const [thumbnail, setThumbnail] = useState<string | undefined>(
    () => poster ?? thumbnailCache.get(src) ?? undefined,
  );

  useEffect(() => {
    // Skip if we already have a poster image
    if (poster) return;
    if (!src) return;

    if (thumbnailCache.has(src)) {
      setThumbnail(thumbnailCache.get(src) ?? undefined);
      return;
    }
    setThumbnail(undefined);

    let cancelled = false;

    // The cache owns the object URL, so a capture that finishes after this
    // effect is superseded is still kept for the next mount.
    const capture = (video: HTMLVideoElement): Promise<void> =>
      captureFrame(video).then((url) => {
        cacheThumbnail(src, url ?? null);
        if (url && !cancelled) setThumbnail(url);
      });

    const release = () => {
      cancelled = true;
    };

    function grabFrameFromUrl(videoSrc: string) {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.src = videoSrc;

      // After metadata loads, seek to 0.1s — then capture on seeked
      const handleMetadata = () => { video.currentTime = 0.1; };
      const handleSeeked = () => {
        if (cancelled) return;
        void capture(video).finally(() => {
          video.src = '';
          video.load();
        });
      };

      video.addEventListener('loadedmetadata', handleMetadata, { once: true });
      video.addEventListener('seeked', handleSeeked, { once: true });

      return () => {
        video.removeEventListener('loadedmetadata', handleMetadata);
        video.removeEventListener('seeked', handleSeeked);
        video.src = '';
        video.load();
      };
    }

    // For HLS: use hls.js to load the stream into an off-screen video, then grab a frame
    if (/\.m3u8(\?|$)/i.test(src)) {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;

      // Safari — native HLS support, no need for hls.js
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        const grabFrame = () => {
          if (cancelled) return;
          video.play().then(() => {
            video.pause();
            return capture(video);
          }).catch(() => { /* ignore */ }).finally(() => {
            video.src = '';
          });
        };

        video.src = src;
        video.addEventListener('loadeddata', grabFrame, { once: true });
        return () => {
          release();
          video.removeEventListener('loadeddata', grabFrame);
          video.src = '';
        };
      }

      // Non-Safari: dynamically import hls.js
      let hlsInstance: Hls | null = null;
      import('hls.js').then(({ default: HlsLib }) => {
        if (cancelled || !HlsLib.isSupported()) return;

        const grabFrame = () => {
          if (cancelled) return;
          video.play().then(() => {
            video.pause();
            return capture(video);
          }).catch(() => { /* ignore */ }).finally(() => {
            hlsInstance?.destroy();
            hlsInstance = null;
            video.src = '';
          });
        };

        const hls = new HlsLib({ startLevel: -1, maxBufferLength: 5 });
        hlsInstance = hls;
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(HlsLib.Events.MANIFEST_PARSED, () => {
          if (cancelled) { hls.destroy(); return; }
          grabFrame();
        });
      });

      return () => { release(); hlsInstance?.destroy(); hlsInstance = null; video.src = ''; };
    }

    // Regular video file
    const cleanupDirect = grabFrameFromUrl(src);
    return () => { release(); cleanupDirect(); };
  }, [src, poster]);

  return thumbnail;
}
