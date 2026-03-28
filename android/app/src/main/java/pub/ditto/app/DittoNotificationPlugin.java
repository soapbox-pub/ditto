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
 * notification polling service with the user's pubkey and relay URLs.
 */
@CapacitorPlugin(name = "DittoNotification")
public class DittoNotificationPlugin extends Plugin {

    private static final String TAG = "DittoNotificationPlugin";
    private static final String PREFS_NAME = "ditto_notification_config";

    @PluginMethod
    public void configure(PluginCall call) {
        String userPubkey = call.getString("userPubkey");
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
                    .putString("relayUrls", relayUrlsRaw);
            if (enabledKindsRaw != null) {
                editor.putString("enabledKinds", enabledKindsRaw);
            }
            if (authorsRaw != null) {
                editor.putString("authors", authorsRaw);
            } else {
                editor.remove("authors");
            }
            editor.apply();
            Log.d(TAG, "Configured: pubkey=" + userPubkey.substring(0, 8) + "..., relays=" + relayUrlsRaw + ", kinds=" + enabledKindsRaw + ", authors=" + (authorsRaw != null ? authorsRaw.length() + " chars" : "all"));
        } else {
            // Clear config (user logged out)
            prefs.edit().clear().apply();
            Log.d(TAG, "Config cleared (user logged out)");
        }

        call.resolve();
    }
}
