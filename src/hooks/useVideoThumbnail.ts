import { useState, useEffect } from 'react';
import type Hls from 'hls.js';

/**
 * Extracts a thumbnail frame from a video URL by loading it off-screen,
 * drawing the first frame to a canvas, and returning a data URL.
 * Works reliably on Android WebView where preload="metadata" doesn't render a visible frame.
 */
export function useVideoThumbnail(src: string, poster: string | undefined): string | undefined {
  const [thumbnail, setThumbnail] = useState<string | undefined>(poster);

  useEffect(() => {
    // Skip if we already have a poster image
    if (poster) return;
    if (!src) return;

    let cancelled = false;

    function grabFrameFromUrl(videoSrc: string) {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.src = videoSrc;

      function captureFrame() {
        if (cancelled) return;
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 320;
          canvas.height = video.videoHeight || 180;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            if (dataUrl.length > 1000) setThumbnail(dataUrl);
          }
        } catch { /* CORS or tainted canvas */ }
        video.src = '';
        video.load();
      }

      // After metadata loads, seek to 0.1s — then capture on seeked
      const handleMetadata = () => { video.currentTime = 0.1; };
      const handleSeeked = () => captureFrame();

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
            try {
              const canvas = document.createElement('canvas');
              canvas.width = video.videoWidth || 320;
              canvas.height = video.videoHeight || 180;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                if (dataUrl.length > 1000) setThumbnail(dataUrl);
              }
            } catch { /* tainted canvas */ }
            video.src = '';
          }).catch(() => { /* ignore */ });
        };

        video.src = src;
        video.addEventListener('loadeddata', grabFrame, { once: true });
        return () => {
          cancelled = true;
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
            try {
              const canvas = document.createElement('canvas');
              canvas.width = video.videoWidth || 320;
              canvas.height = video.videoHeight || 180;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                if (dataUrl.length > 1000) setThumbnail(dataUrl);
              }
            } catch { /* tainted canvas */ }
            hlsInstance?.destroy();
            hlsInstance = null;
            video.src = '';
          }).catch(() => { hlsInstance?.destroy(); hlsInstance = null; });
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

      return () => { cancelled = true; hlsInstance?.destroy(); hlsInstance = null; video.src = ''; };
    }

    // Regular video file
    const cleanupDirect = grabFrameFromUrl(src);
    return () => { cancelled = true; cleanupDirect(); };
  }, [src, poster]);

  return thumbnail;
}
