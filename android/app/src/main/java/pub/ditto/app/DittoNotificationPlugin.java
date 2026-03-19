package pub.ditto.app;

import android.content.SharedPreferences;
import android.content.Context;
import android.util.Log;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

/**
 * Capacitor plugin that allows the JS layer to configure the native
 * notification polling worker with the user's pubkey and relay URLs.
 *
 * When valid config is provided, schedules a periodic WorkManager job.
 * When config is cleared (logout), cancels the worker.
 */
@CapacitorPlugin(name = "DittoNotification")
public class DittoNotificationPlugin extends Plugin {

    private static final String TAG = "DittoNotificationPlugin";
    private static final String PREFS_NAME = "ditto_notification_config";

    @PluginMethod
    public void configure(PluginCall call) {
        String userPubkey = call.getString("userPubkey");
        String relayUrlsRaw = null;

        try {
            JSONArray relayUrls = call.getArray("relayUrls");
            if (relayUrls != null) {
                relayUrlsRaw = relayUrls.toString();
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to read relayUrls", e);
        }

        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        if (userPubkey != null && relayUrlsRaw != null) {
            prefs.edit()
                    .putString("userPubkey", userPubkey)
                    .putString("relayUrls", relayUrlsRaw)
                    .apply();
            Log.d(TAG, "Configured: pubkey=" + userPubkey.substring(0, 8) + "..., relays=" + relayUrlsRaw);

            // Schedule periodic notification polling.
            NotificationScheduler.schedule(context);
        } else {
            // Clear config (user logged out) and cancel polling.
            prefs.edit().clear().apply();
            NotificationScheduler.cancel(context);
            Log.d(TAG, "Config cleared (user logged out)");
        }

        call.resolve();
    }
}
