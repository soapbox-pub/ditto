/** Image extensions rendered inline. */
export const IMAGE_EXTS = 'jpg|jpeg|png|gif|webp|svg|avif';

/** Video extensions rendered as players. */
export const VIDEO_EXTS = 'mp4|webm|mov|qt|avi|mkv|flv';

/** Audio extensions rendered as players. */
export const AUDIO_EXTS = 'mp3|mpga|wav|ogg|flac|m4a|aac|opus';

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

/**
 * MIME types by lowercase extension, for files whose type the browser or the
 * Blossom server doesn't know, and for URLs that carry no imeta `m` field.
 */
const MIME_BY_EXT: Record<string, string> = {
  // Images
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif', apng: 'image/apng',
  bmp: 'image/bmp', ico: 'image/x-icon', tif: 'image/tiff', tiff: 'image/tiff',
  heic: 'image/heic', heif: 'image/heif', jxl: 'image/jxl', psd: 'image/vnd.adobe.photoshop',
  // Video
  mp4: 'video/mp4', m4v: 'video/x-m4v', webm: 'video/webm', mov: 'video/quicktime',
  qt: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska', flv: 'video/x-flv',
  wmv: 'video/x-ms-wmv', mpg: 'video/mpeg', mpeg: 'video/mpeg', '3gp': 'video/3gpp',
  ogv: 'video/ogg', ts: 'video/mp2t',
  // Audio
  mp3: 'audio/mpeg', mpga: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg',
  flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac', opus: 'audio/opus',
  mid: 'audio/midi', midi: 'audio/midi', aif: 'audio/aiff', aiff: 'audio/aiff', wma: 'audio/x-ms-wma',
  // 3D models
  glb: 'model/gltf-binary', gltf: 'model/gltf+json', stl: 'model/stl', obj: 'model/obj',
  ply: 'model/x-ply', '3mf': 'model/3mf', fbx: 'model/x-fbx', dae: 'model/vnd.collada+xml',
  usdz: 'model/vnd.usdz+zip', usda: 'model/vnd.usda', step: 'model/step', stp: 'model/step',
  iges: 'model/iges', igs: 'model/iges', x3d: 'model/x3d+xml', wrl: 'model/vrml',
  blend: 'application/x-blender',
  // Documents
  pdf: 'application/pdf', epub: 'application/epub+zip', rtf: 'application/rtf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  // Text and data
  txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown', csv: 'text/csv',
  tsv: 'text/tab-separated-values', json: 'application/json', jsonl: 'application/x-ndjson',
  ndjson: 'application/x-ndjson', xml: 'application/xml', yaml: 'application/yaml',
  yml: 'application/yaml', toml: 'application/toml', ics: 'text/calendar', vcf: 'text/vcard',
  gpx: 'application/gpx+xml', kml: 'application/vnd.google-earth.kml+xml',
  geojson: 'application/geo+json', srt: 'application/x-subrip', vtt: 'text/vtt',
  // Source code
  html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript',
  mjs: 'text/javascript', tsx: 'text/x-typescript', jsx: 'text/javascript', py: 'text/x-python',
  rs: 'text/x-rust', go: 'text/x-go', c: 'text/x-c', h: 'text/x-c', cpp: 'text/x-c++',
  java: 'text/x-java', kt: 'text/x-kotlin', swift: 'text/x-swift', rb: 'text/x-ruby',
  sh: 'application/x-sh', sql: 'application/sql', lua: 'text/x-lua', diff: 'text/x-diff',
  patch: 'text/x-diff',
  // Archives and packages
  zip: 'application/zip', tar: 'application/x-tar', gz: 'application/gzip',
  tgz: 'application/gzip', bz2: 'application/x-bzip2', xz: 'application/x-xz',
  zst: 'application/zstd', '7z': 'application/x-7z-compressed', rar: 'application/vnd.rar',
  apk: 'application/vnd.android.package-archive',
  dmg: 'application/x-apple-diskimage', iso: 'application/x-iso9660-image',
  deb: 'application/vnd.debian.binary-package', rpm: 'application/x-rpm',
  exe: 'application/vnd.microsoft.portable-executable', msi: 'application/x-msi',
  wasm: 'application/wasm', jar: 'application/java-archive',
  torrent: 'application/x-bittorrent', xdc: 'application/x-webxdc',
  // Fonts
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
};

/** Infers a MIME type from a file extension string (lowercase). */
export function mimeFromExt(ext: string): string {
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

/**
 * MIME types a browser or server reports for a file that say less than its
 * extension does. Windows registers `.stl` as a certificate trust list, for
 * one, and many servers type anything unfamiliar as `octet-stream`.
 */
const UNINFORMATIVE_MIME = /^(application\/(octet-stream|vnd\.ms-pki\.stl|x-zip-compressed|unknown)|binary\/octet-stream|text\/plain)?$/;

/**
 * The best MIME type for a file: the reported type, unless the extension
 * names something more specific than a generic or wrong report.
 */
export function bestMime(reported: string | undefined, ext: string): string {
  const fromExt = MIME_BY_EXT[ext];
  const type = (reported ?? '').toLowerCase().split(';')[0].trim();
  if (fromExt && UNINFORMATIVE_MIME.test(type)) return fromExt;
  return type || 'application/octet-stream';
}

/** How an attachment can be presented. */
export type FileCategory =
  | 'image' | 'video' | 'audio' | 'model' | 'pdf' | 'text' | 'archive'
  | 'document' | 'spreadsheet' | 'presentation' | 'font' | 'webxdc' | 'file';

/** Classify a MIME type for rendering and icon choice. */
export function fileCategory(mime: string | undefined): FileCategory {
  const m = (mime ?? '').toLowerCase();
  if (m === 'application/x-webxdc' || m === 'application/vnd.webxdc+zip') return 'webxdc';
  // Only types every browser draws; HEIC, TIFF, PSD and the like are files.
  if (/^image\/(jpeg|jpg|png|apng|gif|webp|svg\+xml|avif|bmp|x-icon|vnd\.microsoft\.icon)$/.test(m)) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('model/') || m === 'application/x-blender') return 'model';
  if (m.startsWith('font/')) return 'font';
  if (m === 'application/pdf') return 'pdf';
  if (/spreadsheet|ms-excel|text\/csv|tab-separated/.test(m)) return 'spreadsheet';
  if (/presentation|powerpoint/.test(m)) return 'presentation';
  if (/wordprocessing|msword|opendocument\.text|rtf|epub/.test(m)) return 'document';
  if (m.startsWith('text/') || /json|xml|yaml|toml|x-sh|sql|subrip|ndjson/.test(m)) return 'text';
  if (/zip|tar|gzip|bzip|x-xz|zstd|7z|rar|package|diskimage|iso9660|x-rpm|java-archive|msi|portable-executable/.test(m)) return 'archive';
  return 'file';
}

/** 3D formats Ditto can draw, keyed by MIME type. */
export const RENDERABLE_MODEL_FORMATS = {
  'model/gltf-binary': 'glb',
  'model/gltf+json': 'gltf',
  'model/stl': 'stl',
  'model/obj': 'obj',
  'model/x-ply': 'ply',
  'model/3mf': '3mf',
  'model/x-fbx': 'fbx',
  'model/vnd.collada+xml': 'dae',
} as const;

export type ModelFormat = typeof RENDERABLE_MODEL_FORMATS[keyof typeof RENDERABLE_MODEL_FORMATS];

/** The drawable 3D format of a MIME type, if any. */
export function modelFormat(mime: string | undefined): ModelFormat | undefined {
  return mime ? RENDERABLE_MODEL_FORMATS[mime.toLowerCase() as keyof typeof RENDERABLE_MODEL_FORMATS] : undefined;
}

/**
 * Extensions of non-media files that render as an attachment card even when
 * the note carries no imeta for them — a bare link to `model.glb` is a file,
 * not a web page to unfurl. Deliberately excludes web-page-ish types (html,
 * xml, json, txt) that a link preview handles better.
 */
const FILE_CARD_EXTS = new Set(
  Object.keys(MIME_BY_EXT).filter((ext) => {
    const category = fileCategory(MIME_BY_EXT[ext]);
    return ['model', 'pdf', 'archive', 'document', 'spreadsheet', 'presentation', 'font'].includes(category);
  }),
);

/** Whether a URL's extension marks it as a downloadable file, not a page. */
export function isFileUrl(url: string): boolean {
  return FILE_CARD_EXTS.has(urlExtension(url));
}


/** Extracts all video URLs from a string. */
export function extractVideoUrls(content: string): string[] {
  return content.match(new RegExp(VIDEO_URL_REGEX.source, 'gi')) ?? [];
}

/** Extracts all audio URLs from a string. */
export function extractAudioUrls(content: string): string[] {
  return content.match(new RegExp(AUDIO_URL_REGEX.source, 'gi')) ?? [];
}

/**
 * Video container extensions no browser can decode in a `<video>` element.
 * They classify as video (some are in {@link VIDEO_EXTS}) but only ever render
 * as a dead player, so the render path offers the file instead. mkv is
 * deliberately omitted: Chromium plays it when the codecs inside are supported.
 */
const UNPLAYABLE_VIDEO_EXTS = /^(avi|flv|wmv|asf|mpg|mpeg|vob|rm|rmvb|divx)$/;

/**
 * MIME types for the same never-playable containers, for URLs whose type is
 * only known from an imeta `m` tag (extension-less Blossom URLs).
 */
const UNPLAYABLE_VIDEO_MIME =
  /^video\/(x-msvideo|vnd\.avi|avi|msvideo|x-ms-wmv|x-ms-asf|x-flv|flv|mpeg|vnd\.rn-realvideo|divx)$/;

/** The lowercase extension of a URL's last path segment, or `''`. */
export function urlExtension(url: string): string {
  try {
    const seg = new URL(url).pathname.split('/').pop() ?? '';
    const dot = seg.lastIndexOf('.');
    return dot > 0 && dot < seg.length - 1 ? seg.slice(dot + 1).toLowerCase() : '';
  } catch {
    return '';
  }
}

/**
 * Whether a video URL/MIME is a container the browser cannot play inline, so
 * it should render as a file card rather than a `<video>` that never starts.
 * Checks the declared MIME first, then the URL extension.
 */
export function isUnplayableVideo(url: string, mime?: string): boolean {
  if (mime && UNPLAYABLE_VIDEO_MIME.test(mime.toLowerCase())) return true;
  const ext = urlExtension(url);
  return ext ? UNPLAYABLE_VIDEO_EXTS.test(ext) : false;
}
