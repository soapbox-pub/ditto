package pub.ditto.app;

import android.app.ForegroundServiceStartNotAllowedException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

/**
 * Capacitor plugin that allows the JS layer to configure the native
 * notification polling service with the user's pubkey and relay URLs.
 *
 * Supports two notification styles:
 * - "push" (default): no foreground service, relies on push notifications
 * - "persistent": starts NotificationRelayService as a foreground service
 */
@CapacitorPlugin(name = "DittoNotification")
public class DittoNotificationPlugin extends Plugin {

    private static final String TAG = "DittoNotificationPlugin";
    private static final String PREFS_NAME = "ditto_notification_config";

    @PluginMethod
    public void configure(PluginCall call) {
        String userPubkey = call.getString("userPubkey");
        String notificationStyle = call.getString("notificationStyle", "push");
        String relayUrlsRaw = null;
        String enabledKindsRaw = null;
        String authorsRaw = null;

        try {
            JSONArray relayUrls = call.getArray("relayUrls");
            if (relayUrls != null) {
                relayUrlsRaw = relayUrls.toString();
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to read relayUrls", e);
        }

        try {
            JSONArray enabledKinds = call.getArray("enabledKinds");
            if (enabledKinds != null) {
                enabledKindsRaw = enabledKinds.toString();
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to read enabledKinds", e);
        }

        try {
            JSONArray authors = call.getArray("authors");
            if (authors != null) {
                authorsRaw = authors.toString();
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to read authors", e);
        }

        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        if (userPubkey != null && relayUrlsRaw != null) {
            SharedPreferences.Editor editor = prefs.edit()
                    .putString("userPubkey", userPubkey)
                    .putString("relayUrls", relayUrlsRaw)
                    .putString("notificationStyle", notificationStyle);
            if (enabledKindsRaw != null) {
                editor.putString("enabledKinds", enabledKindsRaw);
            }
            if (authorsRaw != null) {
                editor.putString("authors", authorsRaw);
            } else {
                editor.remove("authors");
            }
            editor.apply();
            Log.d(TAG, "Configured: pubkey=" + userPubkey.substring(0, 8) + "..., style=" + notificationStyle + ", relays=" + relayUrlsRaw + ", kinds=" + enabledKindsRaw + ", authors=" + (authorsRaw != null ? authorsRaw.length() + " chars" : "all"));
        } else {
            // Clear config (user logged out)
            prefs.edit().clear().apply();
            Log.d(TAG, "Config cleared (user logged out)");
        }

        // Start or stop the foreground service based on style
        manageService(notificationStyle, userPubkey != null && relayUrlsRaw != null);

        call.resolve();
    }

    /**
     * Start the foreground service when style is "persistent" and config is valid.
     * Stop it otherwise.
     */
    private void manageService(String style, boolean hasConfig) {
        Context ctx = getContext();
        Intent serviceIntent = new Intent(ctx, NotificationRelayService.class);

        if ("persistent".equals(style) && hasConfig) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    ctx.startForegroundService(serviceIntent);
                } else {
                    ctx.startService(serviceIntent);
                }
                Log.d(TAG, "Started NotificationRelayService (persistent mode)");
            } catch (Exception e) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                        && e instanceof ForegroundServiceStartNotAllowedException) {
                    Log.w(TAG, "Could not start foreground service: " + e.getMessage());
                } else {
                    Log.w(TAG, "Failed to start service", e);
                }
            }
        } else {
            ctx.stopService(serviceIntent);
            Log.d(TAG, "Stopped NotificationRelayService (push mode or no config)");
        }
    }
}
