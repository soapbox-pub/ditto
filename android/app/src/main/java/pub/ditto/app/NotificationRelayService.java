package pub.ditto.app;

import android.app.AlarmManager;
import android.app.ForegroundServiceStartNotAllowedException;
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
 * Foreground service that periodically fetches new Nostr notifications and
 * displays them as Android notifications.
 *
 * Battery strategy:
 * - Connect-fetch-disconnect on each alarm cycle. No persistent WebSocket.
 * - Fetch at most 5 events per cycle (limit:5). If we get 5 we already show
 *   a summary, so fetching more is pointless.
 * - AlarmManager fires every ~8 minutes using setAndAllowWhileIdle(), which
 *   penetrates Doze maintenance windows.
 * - Each alarm acquires a brief WakeLock for the duration of the fetch, then
 *   releases it. The radio returns to idle after the connection closes.
 * - Adaptive interval: backs off to 15 min when quiet (no notifications for
 *   two consecutive cycles), resets to 8 min when a notification arrives.
 *
 * Reconnection on failure:
 * - Exponential backoff (1s -> 2s -> 4s -> ... -> 5 min cap) on connect failure.
 * - Resets on next successful alarm cycle.
 * - Network-aware: reconnects immediately when connectivity is restored.
 * - Listens for config changes (login/logout/relay change) via SharedPreferences.
 */
public class NotificationRelayService extends Service {

    private static final String TAG = "NotificationRelaySvc";
    private static final String CHANNEL_ID = "ditto_background_service";
    private static final int NOTIFICATION_ID = 1;
    private static final String PREFS_NAME = "ditto_notification_config";

    // Max events to fetch per cycle. If we hit this we show a summary anyway,
    // so there is no benefit to fetching more.
    private static final int FETCH_LIMIT = 5;

    // Base alarm interval. setAndAllowWhileIdle() batches alarms in Doze with
    // a minimum ~9 min window, so 8 min is the practical maximum frequency.
    private static final long INTERVAL_ACTIVE_MS = 8 * 60 * 1_000;

    // Backed-off interval used when no notifications arrived last cycle.
    private static final long INTERVAL_QUIET_MS = 15 * 60 * 1_000;

    // WakeLock held for the duration of a fetch cycle. Long enough for connect
    // + REQ + up to 5 events + EOSE + metadata fetch + disconnect.
    private static final long FETCH_WAKELOCK_TIMEOUT_MS = 30_000;

    private static final String ACTION_FETCH = "pub.ditto.app.ACTION_FETCH";

    // Backoff bounds for relay connect failures (separate from alarm interval).
    private static final long INITIAL_BACKOFF_MS = 1_000;
    private static final long MAX_BACKOFF_MS = 5 * 60 * 1_000;

    private OkHttpClient httpClient;
    private NostrPoller poller;
    private WebSocket currentWebSocket;
    private String currentSubId;
    private final List<JSONObject> fetchedEvents = new ArrayList<>();

    private long backoffMs = INITIAL_BACKOFF_MS;
    private boolean lastCycleWasQuiet = false;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable reconnectRunnable;

    private PowerManager.WakeLock fetchWakeLock;
    private AlarmManager alarmManager;
    private PendingIntent fetchPendingIntent;
    private ConnectivityManager.NetworkCallback networkCallback;
    private SharedPreferences.OnSharedPreferenceChangeListener configListener;
    private FetchReceiver fetchReceiver;

    private List<String> relayUrls = new ArrayList<>();
    private int relayIndex = 0;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();

        // Android 16+ (targetSdk 36) enforces strict time limits on dataSync
        // foreground services. If the limit has already been exhausted when we
        // try to call startForeground(), the system throws
        // ForegroundServiceStartNotAllowedException and kills the app. We catch
        // it here and stop the service gracefully; the alarm will reschedule
        // the next fetch cycle at the normal interval.
        try {
            startForeground(NOTIFICATION_ID, buildForegroundNotification());
        } catch (Exception e) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                    && e instanceof ForegroundServiceStartNotAllowedException) {
                Log.w(TAG, "Foreground service start not allowed (time limit exhausted), stopping.");
                stopSelf();
                return;
            }
            throw e; // re-throw unexpected exceptions
        }

        httpClient = new OkHttpClient.Builder()
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(15, TimeUnit.SECONDS)
                .writeTimeout(5, TimeUnit.SECONDS)
                .build();

        poller = new NostrPoller(this);
        alarmManager = (AlarmManager) getSystemService(Context.ALARM_SERVICE);

        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        fetchWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ditto:fetch");
        fetchWakeLock.setReferenceCounted(false);

        registerFetchReceiver();
        registerNetworkCallback();
        registerConfigListener();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        scheduleFetchAlarm(INTERVAL_ACTIVE_MS);
        // Do an immediate fetch on start so the user doesn't wait up to 8 min
        // after installing / logging in for their first notification check.
        handler.post(this::runFetchCycle);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        cancelFetchAlarm();
        closeWebSocket();
        handler.removeCallbacksAndMessages(null);
        unregisterFetchReceiver();
        unregisterNetworkCallback();
        unregisterConfigListener();
        if (fetchWakeLock != null && fetchWakeLock.isHeld()) {
            fetchWakeLock.release();
        }
        if (httpClient != null) {
            httpClient.dispatcher().executorService().shutdownNow();
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // -------------------------------------------------------------------------
    // Fetch alarm
    // -------------------------------------------------------------------------

    private class FetchReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!ACTION_FETCH.equals(intent.getAction())) return;
            Log.d(TAG, "Fetch alarm fired");
            fetchWakeLock.acquire(FETCH_WAKELOCK_TIMEOUT_MS);
            handler.post(NotificationRelayService.this::runFetchCycle);
        }
    }

    private void registerFetchReceiver() {
        fetchReceiver = new FetchReceiver();
        IntentFilter filter = new IntentFilter(ACTION_FETCH);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(fetchReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(fetchReceiver, filter);
        }

        Intent intent = new Intent(ACTION_FETCH);
        intent.setPackage(getPackageName());
        fetchPendingIntent = PendingIntent.getBroadcast(
                this, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private void unregisterFetchReceiver() {
        if (fetchReceiver != null) {
            try { unregisterReceiver(fetchReceiver); } catch (Exception ignored) {}
        }
    }

    private void scheduleFetchAlarm(long intervalMs) {
        if (alarmManager == null || fetchPendingIntent == null) return;
        alarmManager.setAndAllowWhileIdle(
                AlarmManager.ELAPSED_REALTIME_WAKEUP,
                SystemClock.elapsedRealtime() + intervalMs,
                fetchPendingIntent
        );
    }

    private void cancelFetchAlarm() {
        if (alarmManager != null && fetchPendingIntent != null) {
            alarmManager.cancel(fetchPendingIntent);
        }
    }

    // -------------------------------------------------------------------------
    // Fetch cycle: connect -> REQ (limit 5) -> EOSE -> disconnect
    // -------------------------------------------------------------------------

    private void runFetchCycle() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String userPubkey = prefs.getString("userPubkey", null);
        String relayUrlsJson = prefs.getString("relayUrls", null);

        if (userPubkey == null || relayUrlsJson == null) {
            Log.d(TAG, "No config, skipping fetch");
            releaseFetchWakeLock();
            return;
        }

        List<String> urls = parseRelayUrls(relayUrlsJson);
        if (urls.isEmpty()) {
            Log.d(TAG, "No relay URLs, skipping fetch");
            releaseFetchWakeLock();
            return;
        }

        if (!urls.equals(relayUrls)) {
            relayUrls = urls;
            relayIndex = 0;
        }

        if (!isNetworkAvailable()) {
            Log.d(TAG, "No network, skipping fetch");
            releaseFetchWakeLock();
            return;
        }

        fetch(relayUrls.get(relayIndex), userPubkey);
    }

    private void fetch(String relayUrl, String userPubkey) {
        long since = poller.getLastSeenTimestamp();
        if (since == 0) {
            since = (System.currentTimeMillis() / 1000) - 300; // 5 min ago on first run
            poller.setLastSeenTimestamp(since);
        }

        currentSubId = "notif-" + Long.toHexString(System.nanoTime());
        fetchedEvents.clear();

        try {
            JSONObject filter = new JSONObject();
            JSONArray kinds = new JSONArray();
            kinds.put(1); kinds.put(6); kinds.put(16); kinds.put(7); kinds.put(9735); kinds.put(1111); kinds.put(8211);
            filter.put("kinds", kinds);
            JSONArray pTags = new JSONArray();
            pTags.put(userPubkey);
            filter.put("#p", pTags);
            filter.put("since", since + 1);
            filter.put("limit", FETCH_LIMIT);

            JSONArray req = new JSONArray();
            req.put("REQ");
            req.put(currentSubId);
            req.put(filter);

            final String reqStr = req.toString();
            final String subId = currentSubId;

            Log.d(TAG, "Fetching from " + relayUrl + " since=" + since);

            Request request = new Request.Builder().url(relayUrl).build();
            currentWebSocket = httpClient.newWebSocket(request, new WebSocketListener() {
                @Override
                public void onOpen(WebSocket webSocket, Response response) {
                    backoffMs = INITIAL_BACKOFF_MS;
                    webSocket.send(reqStr);
                }

                @Override
                public void onMessage(WebSocket webSocket, String text) {
                    handleMessage(text, subId, relayUrl, userPubkey, webSocket);
                }

                @Override
                public void onFailure(WebSocket webSocket, Throwable t, Response response) {
                    Log.w(TAG, "WebSocket failure: " + t.getMessage());
                    currentWebSocket = null;
                    scheduleRetry(relayUrl, userPubkey);
                }

                @Override
                public void onClosed(WebSocket webSocket, int code, String reason) {
                    currentWebSocket = null;
                    // Normal close after EOSE — nothing to do.
                }
            });
        } catch (JSONException e) {
            Log.w(TAG, "Failed to build REQ", e);
            releaseFetchWakeLock();
        }
    }

    private void handleMessage(String text, String subId, String relayUrl, String userPubkey, WebSocket webSocket) {
        try {
            JSONArray msg = new JSONArray(text);
            String type = msg.optString(0);

            if ("EVENT".equals(type) && subId.equals(msg.optString(1))) {
                fetchedEvents.add(msg.getJSONObject(2));

            } else if ("EOSE".equals(type) && subId.equals(msg.optString(1))) {
                // Close the subscription and the connection cleanly.
                JSONArray close = new JSONArray();
                close.put("CLOSE");
                close.put(subId);
                webSocket.send(close.toString());
                webSocket.close(1000, "done");

                // Dispatch collected events on the handler thread.
                List<JSONObject> batch = new ArrayList<>(fetchedEvents);
                fetchedEvents.clear();
                handler.post(() -> onFetchComplete(batch, userPubkey, relayUrl));

            } else if ("CLOSED".equals(type) && subId.equals(msg.optString(1))) {
                Log.w(TAG, "Subscription closed by relay: " + msg.optString(2));
                webSocket.close(1000, "sub closed");
                currentWebSocket = null;
                // Treat as empty fetch rather than retrying.
                handler.post(() -> onFetchComplete(new ArrayList<>(fetchedEvents), userPubkey, relayUrl));
                fetchedEvents.clear();
            }
        } catch (Exception e) {
            Log.w(TAG, "Parse error", e);
        }
    }

    private void onFetchComplete(List<JSONObject> events, String userPubkey, String relayUrl) {
        Log.d(TAG, "Fetch complete: " + events.size() + " events");

        if (!events.isEmpty()) {
            poller.handleEventBatch(events, userPubkey, relayUrl, httpClient);
            lastCycleWasQuiet = false;
            // Active — reset to base interval.
            scheduleFetchAlarm(INTERVAL_ACTIVE_MS);
        } else {
            // Nothing arrived. Back off if last cycle was also quiet.
            if (lastCycleWasQuiet) {
                Log.d(TAG, "Two quiet cycles, backing off to " + (INTERVAL_QUIET_MS / 60000) + " min");
                scheduleFetchAlarm(INTERVAL_QUIET_MS);
            } else {
                scheduleFetchAlarm(INTERVAL_ACTIVE_MS);
            }
            lastCycleWasQuiet = true;
        }

        releaseFetchWakeLock();
    }

    private void scheduleRetry(String relayUrl, String userPubkey) {
        // Rotate relay on failure
        if (!relayUrls.isEmpty()) {
            relayIndex = (relayIndex + 1) % relayUrls.size();
        }

        Log.d(TAG, "Retrying in " + backoffMs + "ms on relay " + relayIndex);
        Runnable retry = () -> fetch(relayUrls.get(relayIndex), userPubkey);
        handler.postDelayed(retry, backoffMs);
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);

        // Still schedule the next alarm so we don't get stuck if retry also fails.
        scheduleFetchAlarm(INTERVAL_ACTIVE_MS);
        releaseFetchWakeLock();
    }

    private void closeWebSocket() {
        if (reconnectRunnable != null) {
            handler.removeCallbacks(reconnectRunnable);
            reconnectRunnable = null;
        }
        if (currentWebSocket != null) {
            try { currentWebSocket.close(1000, "service stopping"); } catch (Exception ignored) {}
            currentWebSocket = null;
        }
        currentSubId = null;
        fetchedEvents.clear();
    }

    private void releaseFetchWakeLock() {
        if (fetchWakeLock != null && fetchWakeLock.isHeld()) {
            fetchWakeLock.release();
        }
    }

    // -------------------------------------------------------------------------
    // Network monitoring
    // -------------------------------------------------------------------------

    private void registerNetworkCallback() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return;

        NetworkRequest request = new NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build();

        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                Log.d(TAG, "Network available, triggering fetch");
                handler.post(() -> {
                    backoffMs = INITIAL_BACKOFF_MS;
                    fetchWakeLock.acquire(FETCH_WAKELOCK_TIMEOUT_MS);
                    runFetchCycle();
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
            try { cm.unregisterNetworkCallback(networkCallback); } catch (Exception ignored) {}
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

    // -------------------------------------------------------------------------
    // Config change listener
    // -------------------------------------------------------------------------

    private void registerConfigListener() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        configListener = (sharedPreferences, key) -> {
            Log.d(TAG, "Config changed, triggering immediate fetch");
            handler.post(() -> {
                backoffMs = INITIAL_BACKOFF_MS;
                lastCycleWasQuiet = false;
                fetchWakeLock.acquire(FETCH_WAKELOCK_TIMEOUT_MS);
                runFetchCycle();
            });
        };
        prefs.registerOnSharedPreferenceChangeListener(configListener);
    }

    private void unregisterConfigListener() {
        if (configListener == null) return;
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.unregisterOnSharedPreferenceChangeListener(configListener);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

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
                .setContentTitle("Ditto")
                .setContentText("Checking for notifications")
                .setSmallIcon(R.drawable.ic_stat_ditto)
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
            channel.setDescription("Keeps Ditto connected for instant notifications");
            channel.setShowBadge(false);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
}
