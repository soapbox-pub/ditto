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

public class MainActivity extends BridgeActivity {

    private static final String PREFS_NAME = "ditto_notification_config";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register native plugins before super.onCreate.
        registerPlugin(DittoNotificationPlugin.class);

        super.onCreate(savedInstanceState);

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
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Handle notification tap when the activity is already running (singleTask)
        handleNotificationIntent(intent);
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
                // Wait for WebView to be ready, then navigate
                getBridge().getWebView().post(() -> {
                    getBridge().getWebView().evaluateJavascript(
                        "window.location.pathname = '" + path.replace("'", "\\'") + "';",
                        null
                    );
                });
            }
        }
    }
}
