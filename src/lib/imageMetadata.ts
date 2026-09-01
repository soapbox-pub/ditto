/**
 * Detection of image properties that decide how an image may be processed
 * before upload.
 */

/** How much of the file to inspect. The signatures below live near the front. */
export const METADATA_SCAN_BYTES = 64 * 1024;

/**
 * Whether an image is animated, and so must not be round-tripped through a
 * canvas (which would flatten it to a single frame).
 *
 * `bytes` is the head of the file (see {@link METADATA_SCAN_BYTES}).
 */
export function isAnimatedImage(mime: string, bytes: Uint8Array): boolean {
  // Any GIF; treating all GIFs as animated is the safe default and GIF has no
  // EXIF to leak anyway.
  if (mime === "image/gif") return true;

  if (mime === "image/webp") {
    // RIFF....WEBPVP8X with the animation flag, signalled by an ANIM chunk.
    for (let i = 12; i + 4 <= Math.min(bytes.length, 1024); i++) {
      if (bytes[i] === 0x41 && bytes[i + 1] === 0x4e && bytes[i + 2] === 0x49 && bytes[i + 3] === 0x4d) {
        return true;
      }
    }
    return false;
  }

  if (mime === "image/png" || mime === "image/apng") {
    // APNG is a PNG with an `acTL` chunk before the first `IDAT`.
    for (let i = 8; i + 4 <= Math.min(bytes.length, 4096); i++) {
      if (bytes[i] === 0x61 && bytes[i + 1] === 0x63 && bytes[i + 2] === 0x54 && bytes[i + 3] === 0x4c) {
        return true;
      }
      if (bytes[i] === 0x49 && bytes[i + 1] === 0x44 && bytes[i + 2] === 0x41 && bytes[i + 3] === 0x54) {
        return false;
      }
    }
    return false;
  }

  return false;
}
