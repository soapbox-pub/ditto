package com.mew.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

/**
 * Foreground service that maintains a persistent WebSocket connection to a
 * Nostr relay. Instead of polling, it opens a REQ subscription and reacts to
 * EVENT messages in real time, dispatching native notifications immediately.
 *
 * Battery profile:
 * - One idle TCP connection with partial WakeLock to survive Doze
 * - No AlarmManager, no periodic wake-ups
 * - Near-instant notification delivery even when the screen is off
 * - Same approach as Signal without FCM
 *
 * Reconnection:
 * - Exponential backoff (1s -> 2s -> 4s -> ... -> 5 min cap) on failure
 * - Resets to 1s on successful connection
 * - Network-aware: reconnects immediately when connectivity is restored
 * - Listens for config changes (login/logout/relay change) via SharedPreferences
 */
public class NotificationRelayService extends Service {

    private static final String TAG = "NotificationRelaySvc";
    private static final String CHANNEL_ID = "mew_background_service";
    private static final int NOTIFICATION_ID = 1;
    private static final String PREFS_NAME = "mew_notification_config";

    // Backoff bounds
    private static final long INITIAL_BACKOFF_MS = 1_000;
    private static final long MAX_BACKOFF_MS = 5 * 60 * 1_000; // 5 minutes

    private OkHttpClient httpClient;
    private NostrPoller poller;
    private WebSocket currentWebSocket;
    private String currentSubId;
    private boolean eoseReceived = false;
    private final List<JSONObject> backfillEvents = new ArrayList<>();

    private long backoffMs = INITIAL_BACKOFF_MS;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable reconnectRunnable;

    private PowerManager.WakeLock wakeLock;
    private ConnectivityManager.NetworkCallback networkCallback;
    private SharedPreferences.OnSharedPreferenceChangeListener configListener;

    // Current connection state
    private List<String> relayUrls = new ArrayList<>();
    private int relayIndex = 0;
    private String connectedRelayUrl;
    private String connectedUserPubkey;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();

        // Post the foreground notification immediately to avoid ANR on Android 12+.
        // The system requires startForeground() within 5 seconds of startForegroundService().
        startForeground(NOTIFICATION_ID, buildForegroundNotification());

        httpClient = new OkHttpClient.Builder()
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.SECONDS) // No read timeout for persistent connection
                .writeTimeout(5, TimeUnit.SECONDS)
                .pingInterval(30, TimeUnit.SECONDS) // OkHttp WebSocket ping to keep connection alive
                .build();

        poller = new NostrPoller(this);

        // Acquire a partial WakeLock to keep the CPU alive through Doze mode,
        // ensuring the WebSocket connection and OkHttp pings remain active.
        // Same approach as Signal without FCM/Google Play Services.
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "mew:relay-connection");
        wakeLock.acquire();

        registerNetworkCallback();
        registerConfigListener();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        connectIfConfigured();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        disconnect();
        handler.removeCallbacksAndMessages(null);
        unregisterNetworkCallback();
        unregisterConfigListener();
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        httpClient.dispatcher().executorService().shutdownNow();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // --- Connection lifecycle ---

    private void connectIfConfigured() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String userPubkey = prefs.getString("userPubkey", null);
        String relayUrlsJson = prefs.getString("relayUrls", null);

        if (userPubkey == null || relayUrlsJson == null) {
            Log.d(TAG, "No config, disconnecting");
            disconnect();
            return;
        }

        List<String> newRelayUrls = parseRelayUrls(relayUrlsJson);
        if (newRelayUrls.isEmpty()) {
            disconnect();
            return;
        }

        // If relay list changed, reset the index
        if (!newRelayUrls.equals(relayUrls)) {
            relayUrls = newRelayUrls;
            relayIndex = 0;
        }

        String relayUrl = relayUrls.get(relayIndex);

        // Already connected to the right relay with the right pubkey
        if (currentWebSocket != null && relayUrl.equals(connectedRelayUrl) && userPubkey.equals(connectedUserPubkey)) {
            return;
        }

        // Config changed or rotating relay, reconnect
        disconnect();
        connect(relayUrl, userPubkey);
    }

    private void connect(String relayUrl, String userPubkey) {
        if (!isNetworkAvailable()) {
            Log.d(TAG, "No network, waiting for connectivity");
            return;
        }

        connectedRelayUrl = relayUrl;
        connectedUserPubkey = userPubkey;
        eoseReceived = false;
        backfillEvents.clear();

        long since = poller.getLastSeenTimestamp();
        if (since == 0) {
            since = (System.currentTimeMillis() / 1000) - 300; // 5 minutes ago
            poller.setLastSeenTimestamp(since);
        }

        currentSubId = "live-" + Long.toHexString(System.nanoTime());

        try {
            JSONObject filter = new JSONObject();
            JSONArray kinds = new JSONArray();
            kinds.put(1); kinds.put(6); kinds.put(7); kinds.put(9735);
            filter.put("kinds", kinds);
            JSONArray pTags = new JSONArray();
            pTags.put(userPubkey);
            filter.put("#p", pTags);
            filter.put("since", since + 1);

            JSONArray req = new JSONArray();
            req.put("REQ");
            req.put(currentSubId);
            req.put(filter);

            final String reqStr = req.toString();
            final String subId = currentSubId;

            Log.d(TAG, "Connecting to " + relayUrl);

            Request request = new Request.Builder().url(relayUrl).build();
            currentWebSocket = httpClient.newWebSocket(request, new WebSocketListener() {
                @Override
                public void onOpen(WebSocket webSocket, Response response) {
                    Log.d(TAG, "Connected to " + relayUrl);
                    backoffMs = INITIAL_BACKOFF_MS; // Reset backoff on success
                    webSocket.send(reqStr);
                }

                @Override
                public void onMessage(WebSocket webSocket, String text) {
                    handleMessage(text, subId, relayUrl, userPubkey);
                }

                @Override
                public void onFailure(WebSocket webSocket, Throwable t, Response response) {
                    Log.w(TAG, "WebSocket failure: " + t.getMessage());
                    currentWebSocket = null;
                    scheduleReconnect();
                }

                @Override
                public void onClosed(WebSocket webSocket, int code, String reason) {
                    Log.d(TAG, "WebSocket closed: " + code + " " + reason);
                    currentWebSocket = null;
                    if (code != 1000) {
                        scheduleReconnect();
                    }
                }
            });
        } catch (JSONException e) {
            Log.w(TAG, "Failed to build REQ", e);
        }
    }

    private void disconnect() {
        if (reconnectRunnable != null) {
            handler.removeCallbacks(reconnectRunnable);
            reconnectRunnable = null;
        }
        if (currentWebSocket != null) {
            try {
                if (currentSubId != null) {
                    JSONArray close = new JSONArray();
                    close.put("CLOSE");
                    close.put(currentSubId);
                    currentWebSocket.send(close.toString());
                }
                currentWebSocket.close(1000, "service stopping");
            } catch (Exception ignored) {}
            currentWebSocket = null;
        }
        connectedRelayUrl = null;
        connectedUserPubkey = null;
        currentSubId = null;
        eoseReceived = false;
        backfillEvents.clear();
    }

    private void scheduleReconnect() {
        if (reconnectRunnable != null) {
            handler.removeCallbacks(reconnectRunnable);
        }

        // Rotate to the next relay in the list
        if (!relayUrls.isEmpty()) {
            relayIndex = (relayIndex + 1) % relayUrls.size();
            Log.d(TAG, "Rotating to relay " + relayIndex + ": " + relayUrls.get(relayIndex));
        }

        Log.d(TAG, "Reconnecting in " + backoffMs + "ms");
        reconnectRunnable = () -> {
            reconnectRunnable = null;
            connectIfConfigured();
        };
        handler.postDelayed(reconnectRunnable, backoffMs);

        // Exponential backoff with cap
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    }

    // --- Message handling ---

    private void handleMessage(String text, String subId, String relayUrl, String userPubkey) {
        try {
            JSONArray msg = new JSONArray(text);
            String type = msg.optString(0);

            if ("EVENT".equals(type) && subId.equals(msg.optString(1))) {
                JSONObject event = msg.getJSONObject(2);

                if (!eoseReceived) {
                    // Before EOSE: buffer events for batch processing
                    backfillEvents.add(event);
                } else {
                    // After EOSE: real-time event, dispatch immediately
                    poller.handleEvent(event, userPubkey, relayUrl, httpClient);
                }
            } else if ("EOSE".equals(type) && subId.equals(msg.optString(1))) {
                eoseReceived = true;
                Log.d(TAG, "EOSE received, " + backfillEvents.size() + " backfill events");
                // Process any backfilled events as a batch
                if (!backfillEvents.isEmpty()) {
                    List<JSONObject> batch = new ArrayList<>(backfillEvents);
                    backfillEvents.clear();
                    poller.handleEventBatch(batch, userPubkey, relayUrl, httpClient);
                }
                // Subscription stays open for real-time events
            } else if ("CLOSED".equals(type) && subId.equals(msg.optString(1))) {
                Log.w(TAG, "Subscription closed by relay: " + msg.optString(2));
                if (currentWebSocket != null) {
                    currentWebSocket.close(1000, "sub closed");
                    currentWebSocket = null;
                }
                scheduleReconnect();
            }
        } catch (Exception e) {
            Log.w(TAG, "Parse error", e);
        }
    }

    // --- Network monitoring ---

    private void registerNetworkCallback() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return;

        NetworkRequest request = new NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build();

        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                Log.d(TAG, "Network available, reconnecting");
                handler.post(() -> {
                    backoffMs = INITIAL_BACKOFF_MS;
                    connectIfConfigured();
                });
            }

            @Override
            public void onLost(Network network) {
                Log.d(TAG, "Network lost");
            }
        };

        cm.registerNetworkCallback(request, networkCallback);
    }

    private void unregisterNetworkCallback() {
        if (networkCallback == null) return;
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm != null) {
            try {
                cm.unregisterNetworkCallback(networkCallback);
            } catch (Exception ignored) {}
        }
    }

    private boolean isNetworkAvailable() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        Network network = cm.getActiveNetwork();
        if (network == null) return false;
        NetworkCapabilities caps = cm.getNetworkCapabilities(network);
        return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    // --- Config change listener ---

    private void registerConfigListener() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        configListener = (sharedPreferences, key) -> {
            Log.d(TAG, "Config changed, reconnecting");
            handler.post(() -> {
                backoffMs = INITIAL_BACKOFF_MS;
                connectIfConfigured();
            });
        };
        prefs.registerOnSharedPreferenceChangeListener(configListener);
    }

    private void unregisterConfigListener() {
        if (configListener == null) return;
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.unregisterOnSharedPreferenceChangeListener(configListener);
    }

    // --- Helpers ---

    private List<String> parseRelayUrls(String json) {
        List<String> urls = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(json);
            for (int i = 0; i < arr.length(); i++) {
                urls.add(arr.getString(i));
            }
        } catch (JSONException e) {
            Log.w(TAG, "Failed to parse relay URLs", e);
        }
        return urls;
    }

    private Notification buildForegroundNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, notificationIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Mew")
                .setContentText("Connected for notifications")
                .setSmallIcon(R.drawable.ic_stat_mew)
                .setContentIntent(pendingIntent)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .setSilent(true)
                .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Background Connection",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Keeps Mew connected for instant notifications");
            channel.setShowBadge(false);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
}
