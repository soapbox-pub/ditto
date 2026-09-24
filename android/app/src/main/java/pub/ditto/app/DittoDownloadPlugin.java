package pub.ditto.app;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Environment;
import android.provider.DocumentsContract;
import android.util.Log;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

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
 *
 * Also exposes the system "Save as" dialog ({@code ACTION_CREATE_DOCUMENT}) for
 * files that must only be written where the user explicitly chooses.
 */
@CapacitorPlugin(name = "DittoDownload")
public class DittoDownloadPlugin extends Plugin {

    private static final String TAG = "DittoDownloadPlugin";

    /**
     * Content waiting for the "Save as" dialog to return. Held here rather
     * than in the call's data, because Capacitor copies a pending call's data
     * into the activity's saved state while another activity covers it, and
     * that state leaves the process. The content can be a private key.
     */
    private String pendingContent;

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

        // Only https. Anything else (http:, data:, blob:, custom schemes) must
        // be handled by the caller's fallback.
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme();
        if (scheme == null || !scheme.equals("https")) {
            call.reject("Unsupported URL scheme: " + scheme);
            return;
        }

        String safeName = safeFilename(filename);

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

    /**
     * Let the user choose where to save a text file, via the system "Save as"
     * dialog, and write {@code content} there. Nothing is written if the user
     * cancels. Resolves {@code { saved: boolean }}.
     *
     * @param call.filename the suggested file name (required)
     * @param call.content  the UTF-8 text to write (required)
     */
    @PluginMethod
    public void saveTextDocument(PluginCall call) {
        String filename = call.getString("filename");
        String content = call.getString("content");

        if (filename == null || filename.isEmpty()) {
            call.reject("Missing 'filename'");
            return;
        }
        if (content == null) {
            call.reject("Missing 'content'");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("text/plain");
        intent.putExtra(Intent.EXTRA_TITLE, safeFilename(filename));

        pendingContent = content;
        call.getData().remove("content");
        try {
            startActivityForResult(call, intent, "saveTextDocumentResult");
        } catch (ActivityNotFoundException e) {
            pendingContent = null;
            call.reject("No app is available to save files", e);
        }
    }

    @ActivityCallback
    private void saveTextDocumentResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        JSObject ret = new JSObject();
        Intent data = result.getData();
        Uri uri = data != null ? data.getData() : null;

        String content = pendingContent;
        pendingContent = null;

        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            ret.put("saved", false);
            call.resolve(ret);
            return;
        }

        // The process was recreated while the dialog was open, so the content
        // is gone. Don't leave the empty file behind.
        if (content == null) {
            deleteDocument(uri);
            ret.put("saved", false);
            call.resolve(ret);
            return;
        }

        // "w", not "wt": some providers (e.g. Drive) reject truncate mode, and
        // ACTION_CREATE_DOCUMENT always hands back a new, empty file anyway.
        try (OutputStream out = getContext().getContentResolver().openOutputStream(uri, "w")) {
            if (out == null) {
                deleteDocument(uri);
                call.reject("Could not open the chosen file");
                return;
            }
            out.write(content.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            deleteDocument(uri);
            call.reject("Save failed: " + e.getMessage(), e);
            return;
        }

        ret.put("saved", true);
        call.resolve(ret);
    }

    /** Remove a document created by the "Save as" dialog, if the provider allows it. */
    private void deleteDocument(Uri uri) {
        try {
            DocumentsContract.deleteDocument(getContext().getContentResolver(), uri);
        } catch (Exception e) {
            Log.w(TAG, "Could not delete the unwritten file", e);
        }
    }

    /**
     * Reduce a filename to a single path segment: no separators, control or
     * reserved characters, and no leading dots (so no {@code ..}).
     */
    private static String safeFilename(String name) {
        String cleaned = name
                .replaceAll("[\\x00-\\x1f\\x7f/\\\\:*?\"<>|]", "_")
                .replaceAll("^[.\\s]+", "")
                .trim();
        if (cleaned.length() > 200) cleaned = cleaned.substring(0, 200);
        return cleaned.isEmpty() ? "download" : cleaned;
    }
}
