package pub.ditto.app;

import android.app.ForegroundServiceStartNotAllowedException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.RouteProcessorInstaller;

public class MainActivity extends BridgeActivity {

    private static final String PREFS_NAME = "ditto_notification_config";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register native plugins before super.onCreate.
        registerPlugin(DittoNotificationPlugin.class);
        registerPlugin(DittoDownloadPlugin.class);

        super.onCreate(savedInstanceState);

        // The Android WebView draws its own native overlay scrollbar on the
        // document scroller, independent of the page's CSS (which already hides
        // all web scrollbars). Disable it at the View level so long feeds don't
        // show a scrollbar.
        getBridge().getWebView().setVerticalScrollBarEnabled(false);
        getBridge().getWebView().setHorizontalScrollBarEnabled(false);

        // Route SPA paths (e.g. /alex@gleasonator.com) back to index.html. Without
        // this, Capacitor treats any path with a dotted final segment as a static
        // file request and the WebView fails with net::ERR_INVALID_RESPONSE instead
        // of letting React Router render the page.
        RouteProcessorInstaller.install(getBridge(), new SpaRouteProcessor(this));

        // Only start the foreground service if the user has opted into
        // "persistent" notification style. Default is "push" (no service).
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String style = prefs.getString("notificationStyle", "push");

        if ("persistent".equals(style)) {
            try {
                Intent serviceIntent = new Intent(this, NotificationRelayService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(serviceIntent);
                } else {
                    startService(serviceIntent);
                }
            } catch (Exception e) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                        && e instanceof ForegroundServiceStartNotAllowedException) {
                    Log.w("MainActivity", "Could not start NotificationRelayService: " + e.getMessage());
                } else {
                    throw e;
                }
            }
        }

        // Handle content shared from another app's Share button.
        // Notification taps are ACTION_VIEW intents with a ditto.pub data URI;
        // those are handled by Capacitor's App plugin (appUrlOpen) and routed
        // by DeepLinkHandler.tsx, so no native handler is needed for them.
        handleSendIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Handle a share that arrives while the app is already running
        handleSendIntent(intent);
    }

    /**
     * Handle content shared into Ditto from another app's Share button.
     *
     * Two share targets are registered as activity-aliases in the manifest:
     *   - {@code .ShareViewAlias}  → "View in Ditto"  → mode "view"
     *   - {@code .SharePostAlias}  → "Post on Ditto"  → mode "post"
     *
     * The mode and the raw shared text are handed to the JS layer as
     * structured data via {@link DittoNotificationPlugin#emitShare} — never
     * concatenated into a navigation string — and the web app's /share route
     * extracts a URL (view) or prefills the composer (post). Passing the text
     * as a JSON value across the bridge means there is no {@code evaluateJavascript}
     * sink for a hostile share payload to break out of.
     */
    private void handleSendIntent(Intent intent) {
        if (intent == null) return;
        if (!Intent.ACTION_SEND.equals(intent.getAction())) return;

        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.isEmpty()) return;

        // Determine which share entry the user tapped from the launched component.
        String mode = "post";
        if (intent.getComponent() != null) {
            String cls = intent.getComponent().getClassName();
            if (cls != null && cls.endsWith("ShareViewAlias")) {
                mode = "view";
            }
        }

        DittoNotificationPlugin.emitShare(mode, text);
    }
}
