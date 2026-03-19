package pub.ditto.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

/**
 * WorkManager Worker that polls Nostr relays for new notification events
 * and displays them as Android notifications.
 *
 * Replaces the previous foreground service approach, removing the need for
 * FOREGROUND_SERVICE_DATA_SYNC permission. WorkManager handles scheduling,
 * Doze compatibility, network constraints, and retry/backoff natively.
 *
 * Each execution: connect to a relay via WebSocket, send a REQ with a
 * since filter, collect events until EOSE, disconnect, and dispatch
 * notifications via NostrPoller.
 */
public class NotificationWorker extends Worker {

    private static final String TAG = "NotificationWorker";
    private static final String PREFS_NAME = "ditto_notification_config";
    private static final int FETCH_LIMIT = 5;
    private static final long FETCH_TIMEOUT_SECONDS = 20;

    public NotificationWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        SharedPreferences prefs = getApplicationContext()
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String userPubkey = prefs.getString("userPubkey", null);
        String relayUrlsJson = prefs.getString("relayUrls", null);

        if (userPubkey == null || relayUrlsJson == null) {
            Log.d(TAG, "No config, skipping fetch");
            return Result.success();
        }

        List<String> relayUrls = parseRelayUrls(relayUrlsJson);
        if (relayUrls.isEmpty()) {
            Log.d(TAG, "No relay URLs, skipping fetch");
            return Result.success();
        }

        NostrPoller poller = new NostrPoller(getApplicationContext());

        // Try each relay in order until one succeeds.
        for (String relayUrl : relayUrls) {
            FetchResult result = fetchFromRelay(relayUrl, userPubkey, poller);
            if (result == FetchResult.SUCCESS) {
                return Result.success();
            }
            // On failure, try next relay.
            Log.d(TAG, "Relay " + relayUrl + " failed, trying next");
        }

        // All relays failed — tell WorkManager to retry with backoff.
        Log.w(TAG, "All relays failed, requesting retry");
        return Result.retry();
    }

    private enum FetchResult {
        SUCCESS,
        FAILURE
    }

    private FetchResult fetchFromRelay(String relayUrl, String userPubkey, NostrPoller poller) {
        long since = poller.getLastSeenTimestamp();
        if (since == 0) {
            since = (System.currentTimeMillis() / 1000) - 300; // 5 min ago on first run
            poller.setLastSeenTimestamp(since);
        }

        String subId = "notif-" + Long.toHexString(System.nanoTime());
        List<JSONObject> fetchedEvents = new ArrayList<>();
        CountDownLatch latch = new CountDownLatch(1);
        AtomicBoolean success = new AtomicBoolean(false);

        OkHttpClient client = new OkHttpClient.Builder()
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(15, TimeUnit.SECONDS)
                .writeTimeout(5, TimeUnit.SECONDS)
                .build();

        try {
            JSONObject filter = new JSONObject();
            JSONArray kinds = new JSONArray();
            kinds.put(1); kinds.put(6); kinds.put(16); kinds.put(7); kinds.put(9735); kinds.put(1111);
            filter.put("kinds", kinds);
            JSONArray pTags = new JSONArray();
            pTags.put(userPubkey);
            filter.put("#p", pTags);
            filter.put("since", since + 1);
            filter.put("limit", FETCH_LIMIT);

            JSONArray req = new JSONArray();
            req.put("REQ");
            req.put(subId);
            req.put(filter);
            String reqStr = req.toString();

            Log.d(TAG, "Fetching from " + relayUrl + " since=" + since);

            Request request = new Request.Builder().url(relayUrl).build();
            client.newWebSocket(request, new WebSocketListener() {
                @Override
                public void onOpen(WebSocket webSocket, Response response) {
                    webSocket.send(reqStr);
                }

                @Override
                public void onMessage(WebSocket webSocket, String text) {
                    try {
                        JSONArray msg = new JSONArray(text);
                        String type = msg.optString(0);

                        if ("EVENT".equals(type) && subId.equals(msg.optString(1))) {
                            fetchedEvents.add(msg.getJSONObject(2));

                        } else if ("EOSE".equals(type) && subId.equals(msg.optString(1))) {
                            JSONArray close = new JSONArray();
                            close.put("CLOSE");
                            close.put(subId);
                            webSocket.send(close.toString());
                            webSocket.close(1000, "done");
                            success.set(true);
                            latch.countDown();

                        } else if ("CLOSED".equals(type) && subId.equals(msg.optString(1))) {
                            Log.w(TAG, "Subscription closed by relay: " + msg.optString(2));
                            webSocket.close(1000, "sub closed");
                            success.set(true); // Treat as empty fetch
                            latch.countDown();
                        }
                    } catch (Exception e) {
                        Log.w(TAG, "Parse error", e);
                    }
                }

                @Override
                public void onFailure(WebSocket webSocket, Throwable t, Response response) {
                    Log.w(TAG, "WebSocket failure: " + t.getMessage());
                    success.set(false);
                    latch.countDown();
                }

                @Override
                public void onClosed(WebSocket webSocket, int code, String reason) {
                    // May fire after we already counted down — safe to ignore.
                    latch.countDown();
                }
            });

            // Block until EOSE/failure or timeout.
            boolean completed = latch.await(FETCH_TIMEOUT_SECONDS, TimeUnit.SECONDS);

            if (!completed) {
                Log.w(TAG, "Fetch timed out for " + relayUrl);
                return FetchResult.FAILURE;
            }

            if (!success.get()) {
                return FetchResult.FAILURE;
            }

            // Process fetched events.
            if (!fetchedEvents.isEmpty()) {
                poller.handleEventBatch(fetchedEvents, userPubkey, relayUrl, client);
            }

            Log.d(TAG, "Fetch complete: " + fetchedEvents.size() + " events from " + relayUrl);
            return FetchResult.SUCCESS;

        } catch (JSONException e) {
            Log.w(TAG, "Failed to build REQ", e);
            return FetchResult.FAILURE;
        } catch (InterruptedException e) {
            Log.w(TAG, "Fetch interrupted", e);
            Thread.currentThread().interrupt();
            return FetchResult.FAILURE;
        } finally {
            client.dispatcher().executorService().shutdownNow();
        }
    }

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
}
