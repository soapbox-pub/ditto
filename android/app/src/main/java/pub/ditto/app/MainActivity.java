package pub.ditto.app;

import android.app.ForegroundServiceStartNotAllowedException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register the native notification config plugin before super.onCreate
        registerPlugin(DittoNotificationPlugin.class);

        super.onCreate(savedInstanceState);

        // Start the persistent relay connection service.
        // On Android 12+ (API 31+) the system may throw
        // ForegroundServiceStartNotAllowedException if the foreground service
        // time limit for this type has already been exhausted. We catch it so
        // the app continues to run normally; the alarm inside the service will
        // retry at the next scheduled interval.
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
