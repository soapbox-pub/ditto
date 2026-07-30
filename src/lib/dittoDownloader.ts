import { registerPlugin } from '@capacitor/core';

/**
 * Native bridge to {@link https://developer.android.com/reference/android/app/DownloadManager}.
 *
 * Implemented only on Android (see `DittoDownloadPlugin.java`); saves a remote
 * file into the public Downloads folder with a system download notification.
 * There is no web or iOS implementation — callers must gate on the platform
 * and fall back to another mechanism elsewhere.
 */
export interface DittoDownloaderPlugin {
  /** Enqueue a download of `url`, saving it as `filename` in Downloads. */
  download(options: { url: string; filename: string }): Promise<void>;
}

export const DittoDownloader = registerPlugin<DittoDownloaderPlugin>('DittoDownload');
