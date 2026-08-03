package pub.ditto.app;

import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Environment;
import android.util.Log;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor plugin that saves a remote file to the device's public Downloads
 * folder using Android's system {@link DownloadManager}.
 *
 * Why this exists: the standard {@code @capacitor/filesystem} plugin has no
 * "Downloads" directory, and its {@code ExternalStorage} directory is blocked
 * by scoped storage on Android 11+. {@code DownloadManager} is a system
 * service that is still permitted to write to the public Downloads collection
 * without storage permissions, performs the HTTP GET natively (so it isn't
 * subject to WebView CORS), and shows the standard download notification.
 */
@CapacitorPlugin(name = "DittoDownload")
public class DittoDownloadPlugin extends Plugin {

    private static final String TAG = "DittoDownloadPlugin";

    /**
     * Enqueue a download of {@code url} into the public Downloads folder.
     *
     * @param call.url      the http/https URL to download (required)
     * @param call.filename the name to save the file as (required)
     */
    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        String filename = call.getString("filename");

        if (url == null || url.isEmpty()) {
            call.reject("Missing 'url'");
            return;
        }
        if (filename == null || filename.isEmpty()) {
            call.reject("Missing 'filename'");
            return;
        }

        // DownloadManager only handles http(s). Anything else (data:, blob:,
        // custom schemes) must be handled by the caller's fallback.
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme();
        if (scheme == null || !(scheme.equals("http") || scheme.equals("https"))) {
            call.reject("Unsupported URL scheme: " + scheme);
            return;
        }

        // Guard against path separators sneaking into the destination name.
        String safeName = filename.replace('/', '_').replace('\\', '_');

        try {
            DownloadManager.Request request = new DownloadManager.Request(uri);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, safeName);
            request.setTitle(safeName);
            request.setNotificationVisibility(
                    DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            // Let other apps (gallery, file managers) see the file once done.
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(true);

            DownloadManager dm =
                    (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm == null) {
                call.reject("DownloadManager unavailable");
                return;
            }

            dm.enqueue(request);
            Log.d(TAG, "Enqueued download: " + safeName);
            call.resolve();
        } catch (Exception e) {
            Log.w(TAG, "Failed to enqueue download", e);
            call.reject("Download failed: " + e.getMessage(), e);
        }
    }
}
