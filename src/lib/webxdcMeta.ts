import { unzipSync } from 'fflate';

/** Metadata extracted from a webxdc `.xdc` ZIP archive. */
export interface WebxdcMeta {
  /** App name from manifest.toml, or undefined if missing. */
  name?: string;
  /** Icon as a File ready for upload, or undefined if missing. */
  iconFile?: File;
}

/**
 * Extract the name and icon from a `.xdc` (ZIP) file.
 *
 * - Reads `manifest.toml` for the `name` field.
 * - Reads `icon.png` or `icon.jpg` and returns it as a `File`.
 */
export async function extractWebxdcMeta(file: File): Promise<WebxdcMeta> {
  const buf = await file.arrayBuffer();
  const unzipped = unzipSync(new Uint8Array(buf));

  const meta: WebxdcMeta = {};

  // --- Parse manifest.toml for the name ---
  const manifestBytes = unzipped['manifest.toml'];
  if (manifestBytes) {
    const text = new TextDecoder().decode(manifestBytes);
    // Simple TOML parse: match name = "..." or name = '...'
    const match = text.match(/^\s*name\s*=\s*["'](.+?)["']/m);
    if (match) {
      meta.name = match[1];
    }
  }

  // --- Extract icon (prefer png, fall back to jpg) ---
  const iconPng = unzipped['icon.png'];
  const iconJpg = unzipped['icon.jpg'];
  const iconBytes = iconPng ?? iconJpg;

  if (iconBytes && iconBytes.length > 0) {
    const isPng = !!iconPng;
    const mime = isPng ? 'image/png' : 'image/jpeg';
    const ext = isPng ? '.png' : '.jpg';
    meta.iconFile = new File([iconBytes], `icon${ext}`, { type: mime });
  }

  return meta;
}
