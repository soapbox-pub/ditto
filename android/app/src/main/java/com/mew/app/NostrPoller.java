package com.mew.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

/**
 * Pure Java Nostr relay poller. Opens WebSocket connections directly to relays,
 * queries for notification events, resolves display names, and dispatches
 * native Android notifications. No WebView involvement.
 */
public class NostrPoller {

    private static final String TAG = "NostrPoller";
    private static final String PREFS_NAME = "mew_notifications";
    private static final String KEY_LAST_SEEN = "nostr:notification-last-seen";
    private static final String CHANNEL_ID = "mew_notifications";
    private static final int MAX_NOTIFICATION_ID = 2147483646;

    private final Context context;
    private final OkHttpClient httpClient;

    public NostrPoller(Context context) {
        this.context = context;
        this.httpClient = new OkHttpClient.Builder()
                .connectTimeout(8, TimeUnit.SECONDS)
                .readTimeout(8, TimeUnit.SECONDS)
                .writeTimeout(5, TimeUnit.SECONDS)
                .build();
        createNotificationChannel();
    }

    /**
     * Poll relays for new notification events and dispatch native notifications.
     */
    public void poll(String userPubkey, List<String> relayUrls) {
        if (userPubkey == null || relayUrls == null || relayUrls.isEmpty()) {
            return;
        }

        long since = getLastSeenTimestamp();
        if (since == 0) {
            // First run: set to 5 minutes ago
            since = (System.currentTimeMillis() / 1000) - 300;
            setLastSeenTimestamp(since);
        }

        Log.d(TAG, "Polling " + relayUrls.size() + " relays since " + since);

        // Query up to 2 relays
        List<JSONObject> allEvents = new ArrayList<>();
        Set<String> seenIds = new HashSet<>();
        int relaysToQuery = Math.min(relayUrls.size(), 2);

        for (int i = 0; i < relaysToQuery; i++) {
            try {
                List<JSONObject> events = queryRelay(relayUrls.get(i), userPubkey, since);
                for (JSONObject event : events) {
                    String id = event.optString("id");
                    String pubkey = event.optString("pubkey");
                    // Skip self-interactions and duplicates
                    if (!pubkey.equals(userPubkey) && !seenIds.contains(id)) {
                        seenIds.add(id);
                        allEvents.add(event);
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "Failed to query relay " + relayUrls.get(i), e);
            }
        }

        if (allEvents.isEmpty()) {
            Log.d(TAG, "No new events");
            return;
        }

        Log.d(TAG, "Found " + allEvents.size() + " new events");

        // Collect unique pubkeys for metadata resolution
        Set<String> pubkeys = new HashSet<>();
        for (JSONObject event : allEvents) {
            pubkeys.add(getActorPubkey(event));
        }

        // Fetch metadata
        Map<String, JSONObject> metadataMap = new HashMap<>();
        if (!relayUrls.isEmpty()) {
            try {
                metadataMap = fetchMetadata(relayUrls.get(0), new ArrayList<>(pubkeys));
            } catch (Exception e) {
                Log.w(TAG, "Failed to fetch metadata", e);
            }
        }

        // Dispatch notifications
        long newestTs = since;
        if (allEvents.size() > 3) {
            // Summary notification
            showNotification(
                    hashId(allEvents.get(0).optString("id") + "-summary"),
                    "Mew",
                    "You have " + allEvents.size() + " new notifications"
            );
        } else {
            for (JSONObject event : allEvents) {
                String actorPubkey = getActorPubkey(event);
                JSONObject metadata = metadataMap.get(actorPubkey);
                String displayName = resolveDisplayName(metadata, actorPubkey);
                String action = kindToAction(event);

                showNotification(
                        hashId(event.optString("id")),
                        "Mew",
                        displayName + " " + action
                );
            }
        }

        for (JSONObject event : allEvents) {
            long ts = event.optLong("created_at", 0);
            if (ts > newestTs) newestTs = ts;
        }
        setLastSeenTimestamp(newestTs);
    }

    /**
     * Query a single relay via WebSocket for notification events.
     */
    private List<JSONObject> queryRelay(String url, String userPubkey, long since) throws Exception {
        List<JSONObject> events = new ArrayList<>();
        String subId = "notif-" + Long.toHexString(System.nanoTime());
        CountDownLatch latch = new CountDownLatch(1);

        JSONObject filter = new JSONObject();
        JSONArray kinds = new JSONArray();
        kinds.put(1); kinds.put(6); kinds.put(7); kinds.put(9735);
        filter.put("kinds", kinds);
        JSONArray pTags = new JSONArray();
        pTags.put(userPubkey);
        filter.put("#p", pTags);
        filter.put("since", since + 1);
        filter.put("limit", 50);

        JSONArray req = new JSONArray();
        req.put("REQ");
        req.put(subId);
        req.put(filter);

        Request request = new Request.Builder().url(url).build();

        WebSocket ws = httpClient.newWebSocket(request, new WebSocketListener() {
            @Override
            public void onOpen(WebSocket webSocket, Response response) {
                webSocket.send(req.toString());
            }

            @Override
            public void onMessage(WebSocket webSocket, String text) {
                try {
                    JSONArray msg = new JSONArray(text);
                    String type = msg.optString(0);
                    if ("EVENT".equals(type) && subId.equals(msg.optString(1))) {
                        events.add(msg.getJSONObject(2));
                    } else if ("EOSE".equals(type) && subId.equals(msg.optString(1))) {
                        JSONArray close = new JSONArray();
                        close.put("CLOSE");
                        close.put(subId);
                        webSocket.send(close.toString());
                        webSocket.close(1000, "done");
                        latch.countDown();
                    }
                } catch (Exception e) {
                    Log.w(TAG, "Parse error", e);
                }
            }

            @Override
            public void onFailure(WebSocket webSocket, Throwable t, Response response) {
                Log.w(TAG, "WebSocket failure: " + url, t);
                latch.countDown();
            }

            @Override
            public void onClosed(WebSocket webSocket, int code, String reason) {
                latch.countDown();
            }
        });

        // Wait up to 8 seconds for response
        if (!latch.await(8, TimeUnit.SECONDS)) {
            ws.cancel();
        }

        return events;
    }

    /**
     * Fetch kind-0 metadata for a list of pubkeys.
     */
    private Map<String, JSONObject> fetchMetadata(String relayUrl, List<String> pubkeys)
            throws Exception {
        Map<String, JSONObject> result = new HashMap<>();
        if (pubkeys.isEmpty()) return result;

        String subId = "meta-" + Long.toHexString(System.nanoTime());
        CountDownLatch latch = new CountDownLatch(1);

        JSONObject filter = new JSONObject();
        JSONArray kinds = new JSONArray();
        kinds.put(0);
        filter.put("kinds", kinds);
        JSONArray authors = new JSONArray();
        for (String pk : pubkeys) authors.put(pk);
        filter.put("authors", authors);
        filter.put("limit", pubkeys.size());

        JSONArray req = new JSONArray();
        req.put("REQ");
        req.put(subId);
        req.put(filter);

        Request request = new Request.Builder().url(relayUrl).build();

        httpClient.newWebSocket(request, new WebSocketListener() {
            @Override
            public void onOpen(WebSocket webSocket, Response response) {
                webSocket.send(req.toString());
            }

            @Override
            public void onMessage(WebSocket webSocket, String text) {
                try {
                    JSONArray msg = new JSONArray(text);
                    String type = msg.optString(0);
                    if ("EVENT".equals(type) && subId.equals(msg.optString(1))) {
                        JSONObject event = msg.getJSONObject(2);
                        String pubkey = event.optString("pubkey");
                        String content = event.optString("content");
                        if (!result.containsKey(pubkey)) {
                            result.put(pubkey, new JSONObject(content));
                        }
                    } else if ("EOSE".equals(type) && subId.equals(msg.optString(1))) {
                        webSocket.close(1000, "done");
                        latch.countDown();
                    }
                } catch (Exception e) {
                    Log.w(TAG, "Metadata parse error", e);
                }
            }

            @Override
            public void onFailure(WebSocket webSocket, Throwable t, Response response) {
                latch.countDown();
            }

            @Override
            public void onClosed(WebSocket webSocket, int code, String reason) {
                latch.countDown();
            }
        });

        latch.await(8, TimeUnit.SECONDS);
        return result;
    }

    /**
     * Get the actor pubkey from an event. For zap receipts, extract the original sender.
     */
    private String getActorPubkey(JSONObject event) {
        int kind = event.optInt("kind");
        if (kind == 9735) {
            JSONArray tags = event.optJSONArray("tags");
            if (tags != null) {
                // Check for uppercase P tag (zapper's pubkey)
                for (int i = 0; i < tags.length(); i++) {
                    JSONArray tag = tags.optJSONArray(i);
                    if (tag != null && "P".equals(tag.optString(0))) {
                        return tag.optString(1);
                    }
                }
                // Fall back to description tag's pubkey
                for (int i = 0; i < tags.length(); i++) {
                    JSONArray tag = tags.optJSONArray(i);
                    if (tag != null && "description".equals(tag.optString(0))) {
                        try {
                            JSONObject zapReq = new JSONObject(tag.optString(1));
                            String pk = zapReq.optString("pubkey");
                            if (!pk.isEmpty()) return pk;
                        } catch (Exception ignored) {}
                    }
                }
            }
        }
        return event.optString("pubkey");
    }

    /**
     * Map event kind to a human-readable action.
     */
    private String kindToAction(JSONObject event) {
        int kind = event.optInt("kind");
        switch (kind) {
            case 7: return "reacted to your post";
            case 6: return "reposted your note";
            case 9735: return "zapped you";
            case 1: {
                JSONArray tags = event.optJSONArray("tags");
                if (tags != null) {
                    for (int i = 0; i < tags.length(); i++) {
                        JSONArray tag = tags.optJSONArray(i);
                        if (tag != null && "e".equals(tag.optString(0))) {
                            return "replied to you";
                        }
                    }
                }
                return "mentioned you";
            }
            default: return "mentioned you";
        }
    }

    /**
     * Resolve a display name from metadata. Priority: nip05 > display_name > name > truncated pubkey.
     */
    private String resolveDisplayName(JSONObject metadata, String pubkey) {
        if (metadata != null) {
            String nip05 = metadata.optString("nip05", "");
            if (!nip05.isEmpty()) {
                if (nip05.startsWith("_@")) return nip05.substring(2);
                return nip05;
            }
            String displayName = metadata.optString("display_name", "");
            if (!displayName.isEmpty()) return displayName;
            String name = metadata.optString("name", "");
            if (!name.isEmpty()) return name;
        }
        // Truncated pubkey as fallback
        if (pubkey.length() > 12) {
            return pubkey.substring(0, 8) + "...";
        }
        return pubkey;
    }

    private void showNotification(int id, String title, String body) {
        NotificationManager manager = (NotificationManager)
                context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(body)
                .setSmallIcon(R.drawable.ic_stat_mew)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true);

        manager.notify(id, builder.build());
    }

    private long getLastSeenTimestamp() {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getLong(KEY_LAST_SEEN, 0);
    }

    private void setLastSeenTimestamp(long timestamp) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putLong(KEY_LAST_SEEN, timestamp).apply();
    }

    private int hashId(String id) {
        int hash = 0;
        for (int i = 0; i < Math.min(id.length(), 16); i++) {
            hash = ((hash << 5) - hash) + id.charAt(i);
        }
        return (Math.abs(hash) % MAX_NOTIFICATION_ID) + 2; // +2 to avoid 0 and 1 (used by foreground service)
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Notifications",
                    NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("Nostr notification alerts");

            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
}
