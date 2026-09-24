import { registerPlugin } from '@capacitor/core';

/**
 * Native bridge to {@link https://developer.android.com/reference/android/app/DownloadManager}.
 *
 * Implemented only on Android (see `DittoDownloadPlugin.java`); saves a remote
 * file into the public Downloads folder with a system download notification,
 * or a text file wherever the user chooses.
 * There is no web or iOS implementation — callers must gate on the platform
 * and fall back to another mechanism elsewhere.
 */
export interface DittoDownloaderPlugin {
  /** Enqueue a download of `url`, saving it as `filename` in Downloads. */
  download(options: { url: string; filename: string }): Promise<void>;
  /**
   * Open the system "Save as" dialog and write `content` to the file the user
   * picks. Resolves `saved: false` if they cancel; nothing is written then.
   */
  saveTextDocument(options: { filename: string; content: string }): Promise<{ saved: boolean }>;
}

export const DittoDownloader = registerPlugin<DittoDownloaderPlugin>('DittoDownload');
