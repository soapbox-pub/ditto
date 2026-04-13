/** Image extensions rendered inline. */
export const IMAGE_EXTS = 'jpg|jpeg|png|gif|webp|svg|avif';

/** Video extensions rendered as players. */
export const VIDEO_EXTS = 'mp4|webm|mov|qt|avi|mkv|flv';

/** Audio extensions rendered as players. */
export const AUDIO_EXTS = 'mp3|wav|ogg|flac|m4a|aac|opus';

/** All media extensions (image + video + audio + webxdc). */
export const ALL_MEDIA_EXTS = `${IMAGE_EXTS}|${VIDEO_EXTS}|${AUDIO_EXTS}|xdc`;

/** Matches image URLs. */
export const IMAGE_URL_REGEX = new RegExp(
  `https?:\\/\\/[^\\s]+\\.(${IMAGE_EXTS})(\\?[^\\s]*)?`,
  'i',
);

/** Matches video URLs. */
export const VIDEO_URL_REGEX = new RegExp(
  `https?:\\/\\/[^\\s]+\\.(${VIDEO_EXTS})(\\?[^\\s]*)?`,
  'gi',
);

/** Matches audio URLs. */
export const AUDIO_URL_REGEX = new RegExp(
  `https?:\\/\\/[^\\s]+\\.(${AUDIO_EXTS})(\\?[^\\s]*)?`,
  'gi',
);

/** Matches any media URL (video, audio, webxdc) that is rendered as an embed — not a link preview. */
export const EMBED_MEDIA_URL_REGEX = new RegExp(
  `https?:\\/\\/[^\\s]+\\.(${VIDEO_EXTS}|${AUDIO_EXTS}|xdc)(\\?[^\\s]*)?`,
  'i',
);

/** Matches all NIP-92 media URLs for imeta tag generation (images + video + audio + webxdc). */
export const IMETA_MEDIA_URL_REGEX = new RegExp(
  `https?:\\/\\/[^\\s]+\\.(${ALL_MEDIA_EXTS})(\\?[^\\s]*)?`,
  'gi',
);

/**
 * Non-global variant of IMETA_MEDIA_URL_REGEX, safe for `.test()` calls.
 *
 * IMPORTANT: Never use the global (`g`) IMETA_MEDIA_URL_REGEX with `.test()` —
 * the global flag makes `lastIndex` stateful, so repeated `.test()` calls
 * (e.g. inside `.find()` or `.filter()`) will alternate between matching and
 * not matching, causing every other URL to be misclassified.
 */
export const IMETA_MEDIA_URL_TEST_REGEX = new RegExp(
  IMETA_MEDIA_URL_REGEX.source,
  'i',
);

/** Infers a MIME type from a file extension string (lowercase). */
export function mimeFromExt(ext: string): string {
  switch (ext) {
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'png':  return 'image/png';
    case 'gif':  return 'image/gif';
    case 'webp': return 'image/webp';
    case 'svg':  return 'image/svg+xml';
    case 'avif': return 'image/avif';
    case 'mp4':  return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'mov':  return 'video/quicktime';
    case 'qt':   return 'video/quicktime';
    case 'avi':  return 'video/x-msvideo';
    case 'mkv':  return 'video/x-matroska';
    case 'flv':  return 'video/x-flv';
    case 'mp3':  return 'audio/mpeg';
    case 'wav':  return 'audio/wav';
    case 'ogg':  return 'audio/ogg';
    case 'flac': return 'audio/flac';
    case 'm4a':  return 'audio/mp4';
    case 'aac':  return 'audio/aac';
    case 'opus': return 'audio/opus';
    case 'xdc':  return 'application/x-webxdc';
    default:     return 'application/octet-stream';
  }
}


/** Extracts all video URLs from a string. */
export function extractVideoUrls(content: string): string[] {
  return content.match(new RegExp(VIDEO_URL_REGEX.source, 'gi')) ?? [];
}

/** Extracts all audio URLs from a string. */
export function extractAudioUrls(content: string): string[] {
  return content.match(new RegExp(AUDIO_URL_REGEX.source, 'gi')) ?? [];
}
