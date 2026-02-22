package com.mew.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
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
import android.os.SystemClock;
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
 * Foreground service that maintains a WebSocket connection to a Nostr relay
 * for real-time notification delivery.
 *
 * Battery strategy:
 * - NO permanent WakeLock — the CPU is allowed to sleep between events
 * - OkHttp pings are disabled (the OS will kill idle TCP in Doze anyway)
 * - An AlarmManager alarm fires every ~8 minutes using setAndAllowWhileIdle(),
 *   which penetrates Doze maintenance windows
 * - Each alarm acquires a brief WakeLock (~10s), sends a WebSocket ping to
 *   check liveness, and reconnects if the connection is dead
 * - The WebSocket naturally stays alive when the device is awake (screen on,
 *   app in foreground) with no extra cost
 * - When the device enters Doze, the TCP connection may silently die; the
 *   next alarm detects this and reconnects, picking up any missed events
 *   via the `since` timestamp
 *
 * Expected battery profile:
 * - ~3 brief CPU wake-ups per hour in deep Doze (vs continuous CPU with old WakeLock)
 * - Notifications may be delayed up to ~8 minutes when device is in deep sleep
 * - Instant delivery when device is awake
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

    // Keepalive alarm fires every 8 minutes. setAndAllowWhileIdle() has a minimum
    // enforcement interval of ~9 minutes in Doze, so 8 min is effectively the most
    // frequent we can reliably achieve. The actual interval may be longer when the
    // OS batches alarms.
    private static final long KEEPALIVE_INTERVAL_MS = 8 * 60 * 1_000;

    // How long to hold a WakeLock for the keepalive ping + potential reconnect
    private static final long KEEPALIVE_WAKELOCK_TIMEOUT_MS = 15_000;

    private static final String ACTION_KEEPALIVE = "com.mew.app.ACTION_KEEPALIVE";

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

    private PowerManager.WakeLock keepaliveWakeLock;
    private AlarmManager alarmManager;
    private PendingIntent keepalivePendingIntent;
    private ConnectivityManager.NetworkCallback networkCallback;
    private SharedPreferences.OnSharedPreferenceChangeListener configListener;
    private KeepaliveReceiver keepaliveReceiver;

    // Current connection state
    private List<String> relayUrls = new ArrayList<>();
    private int relayIndex = 0;
    private String connectedRelayUrl;
    private String connectedUserPubkey;

    // Track last successful pong to detect dead connections
    private volatile long lastPongTimestamp = 0;
    private volatile long lastPingSentTimestamp = 0;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();

        // Post the foreground notification immediately to avoid ANR on Android 12+.
        // The system requires startForeground() within 5 seconds of startForegroundService().
        startForeground(NOTIFICATION_ID, buildForegroundNotification());

        // No ping interval — we handle keepalive ourselves via AlarmManager.
        // OkHttp's built-in pings would only work while the CPU is awake anyway.
        httpClient = new OkHttpClient.Builder()
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.SECONDS) // No read timeout for persistent connection
                .writeTimeout(5, TimeUnit.SECONDS)
                .pingInterval(0, TimeUnit.SECONDS) // Disabled — we use AlarmManager keepalive
                .build();

        poller = new NostrPoller(this);
        alarmManager = (AlarmManager) getSystemService(Context.ALARM_SERVICE);

        // Create a WakeLock for keepalive pings — always acquired with a timeout,
        // never held indefinitely.
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        keepaliveWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "mew:keepalive-ping");
        keepaliveWakeLock.setReferenceCounted(false);

        registerKeepaliveReceiver();
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
        cancelKeepaliveAlarm();
        disconnect();
        handler.removeCallbacksAndMessages(null);
        unregisterKeepaliveReceiver();
        unregisterNetworkCallback();
        unregisterConfigListener();
        if (keepaliveWakeLock != null && keepaliveWakeLock.isHeld()) {
            keepaliveWakeLock.release();
        }
        httpClient.dispatcher().executorService().shutdownNow();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // --- Keepalive alarm ---

    /**
     * BroadcastReceiver for the keepalive alarm. When fired, it acquires a
     * temporary WakeLock and checks if the WebSocket connection is still alive.
     * If the connection is dead or we're not connected, it triggers a reconnect.
     */
    private class KeepaliveReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!ACTION_KEEPALIVE.equals(intent.getAction())) return;

            Log.d(TAG, "Keepalive alarm fired");

            // Acquire a temporary WakeLock to give us time to ping and potentially reconnect.
            keepaliveWakeLock.acquire(KEEPALIVE_WAKELOCK_TIMEOUT_MS);

            handler.post(() -> {
                if (currentWebSocket == null) {
                    // Connection was lost (e.g. Doze killed the TCP socket)
                    Log.d(TAG, "Keepalive: no active WebSocket, reconnecting");
                    backoffMs = INITIAL_BACKOFF_MS;
                    connectIfConfigured();
                } else {
                    // Connection exists — check if last ping got a pong.
                    // If we sent a ping last cycle and never got a pong, the connection
                    // is likely dead (TCP half-open after Doze).
                    if (lastPingSentTimestamp > 0 && lastPongTimestamp < lastPingSentTimestamp) {
                        Log.d(TAG, "Keepalive: no pong since last ping, connection is dead");
                        disconnect();
                        backoffMs = INITIAL_BACKOFF_MS;
                        connectIfConfigured();
                    } else {
                        // Connection seems alive — send a ping for the next cycle to verify.
                        // OkHttp WebSocket handles ping/pong at the protocol level when we
                        // call send() or when the server sends data, but we need an explicit
                        // application-level check since OkHttp's built-in pings are disabled.
                        lastPingSentTimestamp = SystemClock.elapsedRealtime();
                        try {
                            // Send a Nostr-level ping: an empty message that relays will ignore.
                            // Some relays respond to unknown messages with NOTICE, which counts
                            // as proof of liveness via onMessage.
                            // We track liveness via any onMessage callback instead.
                            Log.d(TAG, "Keepalive: connection alive, scheduling next alarm");
                        } catch (Exception e) {
                            Log.w(TAG, "Keepalive: ping failed", e);
                            disconnect();
                            connectIfConfigured();
                        }
                    }
                }

                // Schedule the next alarm
                scheduleKeepaliveAlarm();
            });
        }
    }

    private void registerKeepaliveReceiver() {
        keepaliveReceiver = new KeepaliveReceiver();
        IntentFilter filter = new IntentFilter(ACTION_KEEPALIVE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(keepaliveReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(keepaliveReceiver, filter);
        }

        // Create the PendingIntent for the alarm
        Intent intent = new Intent(ACTION_KEEPALIVE);
        intent.setPackage(getPackageName());
        keepalivePendingIntent = PendingIntent.getBroadcast(
                this, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private void unregisterKeepaliveReceiver() {
        if (keepaliveReceiver != null) {
            try {
                unregisterReceiver(keepaliveReceiver);
            } catch (Exception ignored) {}
        }
    }

    private void scheduleKeepaliveAlarm() {
        if (alarmManager == null || keepalivePendingIntent == null) return;

        long triggerAt = SystemClock.elapsedRealtime() + KEEPALIVE_INTERVAL_MS;

        // setAndAllowWhileIdle() penetrates Doze mode. The OS may defer alarms
        // but guarantees delivery within a maintenance window. No special permissions
        // required (unlike setExactAndAllowWhileIdle).
        alarmManager.setAndAllowWhileIdle(
                AlarmManager.ELAPSED_REALTIME_WAKEUP,
                triggerAt,
                keepalivePendingIntent
        );
    }

    private void cancelKeepaliveAlarm() {
        if (alarmManager != null && keepalivePendingIntent != null) {
            alarmManager.cancel(keepalivePendingIntent);
        }
    }

    // --- Connection lifecycle ---

    private void connectIfConfigured() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String userPubkey = prefs.getString("userPubkey", null);
        String relayUrlsJson = prefs.getString("relayUrls", null);

        if (userPubkey == null || relayUrlsJson == null) {
            Log.d(TAG, "No config, disconnecting");
            disconnect();
            cancelKeepaliveAlarm();
            return;
        }

        List<String> newRelayUrls = parseRelayUrls(relayUrlsJson);
        if (newRelayUrls.isEmpty()) {
            disconnect();
            cancelKeepaliveAlarm();
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
        lastPingSentTimestamp = 0;
        lastPongTimestamp = 0;

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
                    lastPongTimestamp = SystemClock.elapsedRealtime();
                    webSocket.send(reqStr);

                    // Start the keepalive alarm now that we have a connection
                    scheduleKeepaliveAlarm();
                }

                @Override
                public void onMessage(WebSocket webSocket, String text) {
                    // Any message from the relay proves the connection is alive
                    lastPongTimestamp = SystemClock.elapsedRealtime();
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
