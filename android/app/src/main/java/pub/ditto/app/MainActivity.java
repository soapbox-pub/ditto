package pub.ditto.app;

import android.app.ForegroundServiceStartNotAllowedException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
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

        super.onCreate(savedInstanceState);

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

        // Handle notification tap deep link
        handleNotificationIntent(getIntent());
        // Handle content shared from another app's Share button
        handleSendIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Handle notification tap when the activity is already running (singleTask)
        handleNotificationIntent(intent);
        // Handle a share that arrives while the app is already running
        handleSendIntent(intent);
    }

    /**
     * If the intent has a data URI from a notification tap, navigate the
     * WebView to the corresponding path (e.g., /notifications).
     */
    private void handleNotificationIntent(Intent intent) {
        if (intent == null) return;
        Uri data = intent.getData();
        if (data != null && "ditto.pub".equals(data.getHost())) {
            String path = data.getPath();
            if (path != null && !path.isEmpty()) {
                navigateWebView(path);
            }
        }
    }

    /**
     * Handle content shared into Ditto from another app's Share button.
     *
     * Two share targets are registered as activity-aliases in the manifest:
     *   - {@code .ShareViewAlias}  → "View in Ditto"  → /share?mode=view
     *   - {@code .SharePostAlias}  → "Post on Ditto"  → /share?mode=post
     *
     * We forward the raw shared text to the web app's /share route, which
     * extracts a URL (view) or prefills the composer (post). URL extraction
     * is deliberately left to the TypeScript handler so it stays testable.
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

        String encoded = Uri.encode(text);
        navigateWebView("/share?mode=" + mode + "&text=" + encoded);
    }

    /**
     * Navigate the in-app WebView to the given path once it is ready. Uses a
     * full-document navigation so it works on cold start (the SPA boots at the
     * target route) and while the app is already running.
     */
    private void navigateWebView(String path) {
        getBridge().getWebView().post(() -> {
            getBridge().getWebView().evaluateJavascript(
                "window.location.href = '" + path.replace("'", "\\'") + "';",
                null
            );
        });
    }
}
