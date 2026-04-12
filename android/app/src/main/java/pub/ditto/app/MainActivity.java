package pub.ditto.app;

import android.app.ForegroundServiceStartNotAllowedException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import androidx.annotation.NonNull;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String PREFS_NAME = "ditto_notification_config";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register native plugins before super.onCreate.
        registerPlugin(DittoNotificationPlugin.class);
        registerPlugin(SandboxPlugin.class);

        super.onCreate(savedInstanceState);

        // Workaround for @capacitor/keyboard plugin intermittently leaving
        // the CoordinatorLayout at a fixed pixel height on Android 15+
        // (API 35+) with edge-to-edge enforced.
        //
        // The Keyboard plugin's possiblyResizeChildOfContent() sets the
        // CoordinatorLayout's LayoutParams.height to a computed pixel value
        // when the keyboard appears. On keyboard dismiss, the animation
        // callback resets it to MATCH_PARENT. However, when insets change
        // without a keyboard animation (permission dialogs, config changes,
        // edge-to-edge recalculations), the plugin's rootView insets
        // listener fires with showingKeyboard=true and sets the height,
        // but no animation runs to reset it — leaving the WebView stuck
        // at roughly half height.
        //
        // Fix: set an OnApplyWindowInsetsListener on the CoordinatorLayout
        // itself. This fires AFTER the Keyboard plugin's listener on the
        // rootView (parent dispatches to children). When the IME is not
        // visible, we force the height back to MATCH_PARENT, overriding
        // any stale value the plugin may have set in the same dispatch.
        FrameLayout content = getWindow().getDecorView().findViewById(android.R.id.content);
        if (content != null && content.getChildCount() > 0) {
            View child = content.getChildAt(0);
            // Set the listener on the ContentFrameLayout (parent of the
            // CoordinatorLayout) so it fires after the Keyboard plugin's
            // rootView listener but before the SystemBars plugin's listener
            // on the CoordinatorLayout — avoiding overwriting either one.
            ViewCompat.setOnApplyWindowInsetsListener(content, (@NonNull View v, @NonNull WindowInsetsCompat insets) -> {
                boolean imeVisible = insets.isVisible(WindowInsetsCompat.Type.ime());
                if (!imeVisible) {
                    ViewGroup.LayoutParams lp = child.getLayoutParams();
                    if (lp.height >= 0) {
                        lp.height = ViewGroup.LayoutParams.MATCH_PARENT;
                        child.requestLayout();
                    }
                }
                return insets;
            });
        }

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
