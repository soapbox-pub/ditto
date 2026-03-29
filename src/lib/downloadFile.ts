import { Capacitor } from '@capacitor/core';

/**
 * Download a text file to the user's device.
 *
 * On the web this uses the classic `<a download>` trick.
 * On Android it writes directly to the app-scoped Documents directory
 * (no extra permissions needed on Android 11+).
 * On iOS it writes to a temp file and presents the native share sheet.
 */
export async function downloadTextFile(filename: string, content: string): Promise<void> {
  const platform = Capacitor.getPlatform();

  if (platform === 'android') {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');

    // Write directly to the Documents directory. On Android 11+ the app can
    // write to its own scoped area inside public Documents without needing
    // WRITE_EXTERNAL_STORAGE permission.
    await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Documents,
    });
  } else if (platform === 'ios') {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');

    const result = await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Cache,
    });

    // On iOS there is no user-visible Downloads folder, so present the
    // share sheet and let the user choose where to save / send the file.
    try {
      await Share.share({ title: filename, url: result.uri });
    } catch {
      // User dismissed the share sheet — not a real failure
    }
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

/**
 * Open a URL in a new browser tab, or present the native share sheet on Capacitor.
 *
 * The programmatic `<a target="_blank">` click pattern doesn't work inside
 * WKWebView on iOS. On native platforms this presents the share sheet instead,
 * letting the user open, save, or share the resource.
 */
export async function openUrl(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Share } = await import('@capacitor/share');
    await Share.share({ url });
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
