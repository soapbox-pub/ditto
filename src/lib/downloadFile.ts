import { Capacitor } from '@capacitor/core';

/**
 * Download a text file to the user's device.
 *
 * On the web this uses the classic `<a download>` trick.
 * On native (Android & iOS) the file is saved to the app's Documents
 * directory, which is visible in the iOS Files app and Android's
 * app-scoped documents. No permissions are required.
 */
export async function downloadTextFile(filename: string, content: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');

    // Write straight to Documents — visible in the iOS Files app and
    // Android's app-scoped documents. No storage permissions needed.
    // NOTE: encoding is required — without it Capacitor expects base64 data
    // and will throw for plain-text strings.
    await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
  } else {
    // Web: use the anchor-click download pattern
    const blob = new Blob([content], { type: 'text/plain; charset=utf-8' });
    const url = globalThis.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    globalThis.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
}

/** Base64-encode bytes in chunks (avoids arg-count limits on large inputs). */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Download a binary file to the user's device.
 *
 * Mirrors {@link downloadTextFile} for raw bytes: the `<a download>` blob trick
 * on the web, and a base64 `Filesystem.writeFile` to Documents on native (where
 * the anchor pattern silently fails in WKWebView).
 */
export async function downloadBinaryFile(filename: string, bytes: Uint8Array): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    // No `encoding` → Capacitor treats `data` as base64.
    await Filesystem.writeFile({
      path: filename,
      data: bytesToBase64(bytes),
      directory: Directory.Documents,
    });
  } else {
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = globalThis.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    globalThis.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
}

/**
 * Derive a sensible download filename from a URL.
 *
 * Uses the last non-empty path segment (query string stripped). Falls back to
 * a generic name when the URL has no usable path (e.g. bare host, or a hash
 * that isn't a real filename).
 */
function filenameFromUrl(url: string): string {
  try {
    const { pathname } = new URL(url);
    const segment = pathname.split('/').filter(Boolean).pop();
    if (segment) return decodeURIComponent(segment);
  } catch {
    // fall through
  }
  return 'download';
}

/**
 * Download the contents of a URL to the user's device.
 *
 * Unlike {@link openUrl}, this saves the file rather than navigating to it —
 * on the web a bare `openUrl` just opens the image/asset in a new tab instead
 * of triggering a download. We fetch the bytes and hand them to
 * {@link downloadBinaryFile}, which uses the `<a download>` blob trick on the
 * web and `Filesystem.writeFile` to Documents on native.
 *
 * Returns how the file was delivered so callers can give accurate feedback:
 * `'downloaded'` when it was saved to disk, or `'opened'` when we had to fall
 * back to opening it in a new tab / the external browser. Throws only if even
 * the fallback fails.
 *
 * Platform notes:
 * - **Android:** hands the URL to the system `DownloadManager` (via the native
 *   `DittoDownload` plugin), which saves into the public Downloads folder with
 *   a download notification. This is the only reliable way to reach Downloads
 *   under scoped storage, and it fetches natively so it isn't subject to
 *   WebView CORS.
 * - **iOS:** uses `Filesystem.downloadFile` (a native HTTP GET, also CORS-free)
 *   into the app's Documents directory — the sandbox forbids a true top-level
 *   or system Downloads folder. `UIFileSharingEnabled` /
 *   `LSSupportsOpeningDocumentsInPlace` in Info.plist surface that directory
 *   as the "Ditto" folder in the Files app so the file is reachable.
 * - **Web:** fetches the bytes and saves them via the `<a download>` blob
 *   trick. Browsers only allow a page to read (and therefore save) a
 *   cross-origin resource when the host sends CORS headers; when it doesn't,
 *   the fetch throws and we fall back to opening the file in a new tab, since
 *   there is no client-side way to force a download of an unreadable resource.
 */
export async function downloadUrl(url: string, filename?: string): Promise<'downloaded' | 'opened'> {
  const name = filename ?? filenameFromUrl(url);

  if (Capacitor.getPlatform() === 'android') {
    try {
      const { DittoDownloader } = await import('./dittoDownloader');
      await DittoDownloader.download({ url, filename: name });
      return 'downloaded';
    } catch {
      await openUrl(url);
      return 'opened';
    }
  }

  if (Capacitor.isNativePlatform()) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      await Filesystem.downloadFile({
        url,
        path: name,
        directory: Directory.Documents,
      });
      return 'downloaded';
    } catch {
      await openUrl(url);
      return 'opened';
    }
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    await downloadBinaryFile(name, bytes);
    return 'downloaded';
  } catch {
    await openUrl(url);
    return 'opened';
  }
}

/**
 * Open a URL in the phone's external browser (or a new tab on the web).
 *
 * The programmatic `<a target="_blank">` click pattern doesn't work inside
 * WKWebView on iOS. On native platforms this hands the URL to the OS default
 * handler via `@capacitor/app-launcher`, so `https:` links open in the real
 * browser (which then handles file downloads natively) and custom schemes
 * like `lightning:` / `bitcoin:` route to the associated wallet app.
 *
 * Previously this presented the native share sheet, which meant navigation
 * links and download buttons showed a "share" prompt instead of opening.
 */
export async function openUrl(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { AppLauncher } = await import('@capacitor/app-launcher');
    await AppLauncher.openUrl({ url });
  } else if (/^https?:/i.test(url)) {
    // Web pages: open in a new tab.
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    // Custom schemes (lightning:, bitcoin:, monero:, …) don't launch their
    // registered handler from a `_blank` popup — browsers only invoke the
    // protocol handler on a top-level navigation. Assigning `location.href`
    // triggers the external app without actually unloading the current page.
    window.location.href = url;
  }
}
