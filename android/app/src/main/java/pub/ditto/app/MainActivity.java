package pub.ditto.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register the native notification config plugin before super.onCreate
        registerPlugin(DittoNotificationPlugin.class);

        super.onCreate(savedInstanceState);

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
