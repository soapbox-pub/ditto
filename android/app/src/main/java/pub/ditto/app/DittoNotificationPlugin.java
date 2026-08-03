package pub.ditto.app;

import android.app.ForegroundServiceStartNotAllowedException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

/**
 * Capacitor plugin that allows the JS layer to configure the native
 * notification service with the user's pubkey and relay URLs.
 *
 * Supports two notification styles:
 * - "push" (default): no foreground service, relies on push notifications
 * - "persistent": starts NotificationRelayService as a foreground service
 *   that holds live WebSocket subscriptions for instant notifications
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
     * Check whether the app is exempt from battery optimizations (Doze).
     *
     * Battery optimization can cut the background relay connection that
     * drives "persistent" mode, and on Android 15+ an exemption is also what
     * permits restarting the foreground service from the boot-retry alarm.
     * The settings UI uses this to decide whether to show the exemption
     * prompt.
     */
    @PluginMethod
    public void isIgnoringBatteryOptimizations(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ignoring", ignoringBatteryOptimizations());
        call.resolve(ret);
    }

    /**
     * Show the system dialog asking the user to exempt Ditto from battery
     * optimizations (one tap: "Allow"). Falls back to the battery
     * optimization settings list on OEM builds that don't handle the direct
     * request intent.
     *
     * Launched for a result so the plugin call only resolves once the dialog
     * (or settings screen) closes, carrying the fresh exemption state — the
     * dialog overlays the WebView without hiding it, so the JS layer gets no
     * visibilitychange event to re-check on.
     */
    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            startActivityForResult(call, intent, "batteryOptimizationResult");
        } catch (Exception e) {
            Log.w(TAG, "Direct battery optimization request failed, opening settings list", e);
            try {
                Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                startActivityForResult(call, fallback, "batteryOptimizationResult");
            } catch (Exception e2) {
                call.reject("Unable to open battery optimization settings", e2);
            }
        }
    }

    /**
     * The user closed the exemption dialog (or returned from the settings
     * list). Resolve with the current exemption state so the UI can update
     * immediately.
     */
    @ActivityCallback
    private void batteryOptimizationResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        ret.put("ignoring", ignoringBatteryOptimizations());
        call.resolve(ret);
    }

    private boolean ignoringBatteryOptimizations() {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
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
