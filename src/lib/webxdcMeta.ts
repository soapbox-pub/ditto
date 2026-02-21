import { unzipSync } from 'fflate';

/** Metadata extracted from a webxdc `.xdc` ZIP archive. */
export interface WebxdcMeta {
  /** App name from manifest.toml, or undefined if missing. */
  name?: string;
  /** Icon as a data-URI (image/png or image/jpeg), or undefined if missing. */
  iconDataUri?: string;
}

/**
 * Extract the name and icon from a `.xdc` (ZIP) file.
 *
 * - Reads `manifest.toml` for the `name` field.
 * - Reads `icon.png` or `icon.jpg` and converts to a data-URI.
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
  const iconMime = iconPng ? 'image/png' : 'image/jpeg';

  if (iconBytes && iconBytes.length > 0) {
    // Convert to base64 data URI
    let binary = '';
    for (let i = 0; i < iconBytes.length; i++) {
      binary += String.fromCharCode(iconBytes[i]);
    }
    meta.iconDataUri = `data:${iconMime};base64,${btoa(binary)}`;
  }

  return meta;
}
