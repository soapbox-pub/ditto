package com.mew.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.PowerManager;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;

import java.util.ArrayList;
import java.util.List;

/**
 * BroadcastReceiver triggered by AlarmManager every 60 seconds.
 * Acquires a WakeLock, polls Nostr relays via native Java WebSocket,
 * dispatches notifications, then releases the lock.
 * No WebView involvement.
 */
public class PollAlarmReceiver extends BroadcastReceiver {

    private static final String TAG = "PollAlarmReceiver";
    private static final String PREFS_NAME = "mew_notification_config";

    @Override
    public void onReceive(Context context, Intent intent) {
        // Read stored config
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String userPubkey = prefs.getString("userPubkey", null);
        String relayUrlsJson = prefs.getString("relayUrls", null);

        if (userPubkey == null || relayUrlsJson == null) {
            Log.d(TAG, "No config stored, skipping poll");
            return;
        }

        List<String> relayUrls = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(relayUrlsJson);
            for (int i = 0; i < arr.length(); i++) {
                relayUrls.add(arr.getString(i));
            }
        } catch (JSONException e) {
            Log.w(TAG, "Failed to parse relay URLs", e);
            return;
        }

        if (relayUrls.isEmpty()) return;

        // Acquire wake lock for up to 30 seconds
        PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "mew:poll-alarm"
        );
        wakeLock.acquire(30_000);

        // Run poll on a background thread (BroadcastReceiver.onReceive runs on main thread)
        new Thread(() -> {
            try {
                NostrPoller poller = new NostrPoller(context);
                poller.poll(userPubkey, relayUrls);
                Log.d(TAG, "Poll completed");
            } catch (Exception e) {
                Log.w(TAG, "Poll failed", e);
            } finally {
                if (wakeLock.isHeld()) {
                    wakeLock.release();
                }
            }
        }).start();
    }
}
