/** Audio file extensions used to detect audio URLs. */
const AUDIO_EXTENSIONS = /\.(mp3|mpga|ogg|oga|wav|flac|aac|m4a|opus|weba|webm|spx|caf)(\?.*)?$/i;

/** Image file extensions used to detect image URLs. */
const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|svg|avif)(\?.*)?$/i;

/** Video file extensions used to detect video URLs. */
const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|qt)(\?.*)?$/i;

/** Check whether a URL points to an audio file by extension. */
export function isAudioUrl(url: string): boolean {
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
  return AUDIO_EXTENSIONS.test(url);
}

/** Check whether a URL points to an image file by extension. */
export function isImageUrl(url: string): boolean {
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
  return IMAGE_EXTENSIONS.test(url);
}

/** Check whether a URL points to a video file by extension. */
export function isVideoUrl(url: string): boolean {
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
  return VIDEO_EXTENSIONS.test(url);
}
