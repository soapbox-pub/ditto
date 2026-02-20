package com.mew.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

/**
 * Handles notification dispatch and metadata resolution for Nostr events.
 * Caches display name metadata in SharedPreferences to avoid redundant
 * WebSocket connections for repeat authors.
 */
public class NostrPoller {

    private static final String TAG = "NostrPoller";
    private static final String PREFS_NAME = "mew_notifications";
    private static final String META_PREFS_NAME = "mew_metadata_cache";
    private static final String KEY_LAST_SEEN = "nostr:notification-last-seen";
    private static final String CHANNEL_ID = "mew_notifications";
    private static final int MAX_NOTIFICATION_ID = 2147483646;

    private final Context context;

    public NostrPoller(Context context) {
        this.context = context;
        createNotificationChannel();
    }

    /**
     * Process a single incoming event: resolve display name (from cache or
     * network) and dispatch a native notification.
     */
    public void handleEvent(JSONObject event, String userPubkey, String relayUrl, OkHttpClient httpClient) {
        String pubkey = event.optString("pubkey");
        if (pubkey.equals(userPubkey)) return; // Skip self-interactions

        String actorPubkey = getActorPubkey(event);
        String displayName = getCachedDisplayName(actorPubkey);

        if (displayName == null) {
            // Fetch from relay and cache
            displayName = fetchAndCacheMetadata(actorPubkey, relayUrl, httpClient);
        }

        String action = kindToAction(event);
        showNotification(
                hashId(event.optString("id")),
                "Mew",
                displayName + " " + action
        );

        long ts = event.optLong("created_at", 0);
        long currentLastSeen = getLastSeenTimestamp();
        if (ts > currentLastSeen) {
            setLastSeenTimestamp(ts);
        }
    }

    /**
     * Process a batch of events (used after EOSE to handle the initial backfill).
     */
    public void handleEventBatch(List<JSONObject> events, String userPubkey, String relayUrl, OkHttpClient httpClient) {
        if (events.isEmpty()) return;

        // Deduplicate and filter self-interactions
        Set<String> seenIds = new HashSet<>();
        List<JSONObject> filtered = new ArrayList<>();
        for (JSONObject event : events) {
            String id = event.optString("id");
            String pubkey = event.optString("pubkey");
            if (!pubkey.equals(userPubkey) && !seenIds.contains(id)) {
                seenIds.add(id);
                filtered.add(event);
            }
        }

        if (filtered.isEmpty()) return;

        // Collect unknown pubkeys for batch metadata fetch
        Set<String> unknownPubkeys = new HashSet<>();
        for (JSONObject event : filtered) {
            String actorPubkey = getActorPubkey(event);
            if (getCachedDisplayName(actorPubkey) == null) {
                unknownPubkeys.add(actorPubkey);
            }
        }

        // Batch fetch metadata for unknown pubkeys
        if (!unknownPubkeys.isEmpty()) {
            fetchAndCacheMetadataBatch(new ArrayList<>(unknownPubkeys), relayUrl, httpClient);
        }

        // Dispatch notifications
        if (filtered.size() > 3) {
            showNotification(
                    hashId(filtered.get(0).optString("id") + "-summary"),
                    "Mew",
                    "You have " + filtered.size() + " new notifications"
            );
        } else {
            for (JSONObject event : filtered) {
                String actorPubkey = getActorPubkey(event);
                String displayName = getCachedDisplayName(actorPubkey);
                if (displayName == null) displayName = truncatePubkey(actorPubkey);
                String action = kindToAction(event);
                showNotification(
                        hashId(event.optString("id")),
                        "Mew",
                        displayName + " " + action
                );
            }
        }

        // Update last-seen to newest event
        long newestTs = getLastSeenTimestamp();
        for (JSONObject event : filtered) {
            long ts = event.optLong("created_at", 0);
            if (ts > newestTs) newestTs = ts;
        }
        setLastSeenTimestamp(newestTs);
    }

    // --- Metadata caching ---

    private String getCachedDisplayName(String pubkey) {
        SharedPreferences prefs = context.getSharedPreferences(META_PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getString("name:" + pubkey, null);
    }

    private void cacheDisplayName(String pubkey, String displayName) {
        SharedPreferences prefs = context.getSharedPreferences(META_PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString("name:" + pubkey, displayName).apply();
    }

    private String fetchAndCacheMetadata(String pubkey, String relayUrl, OkHttpClient httpClient) {
        List<String> pubkeys = new ArrayList<>();
        pubkeys.add(pubkey);
        fetchAndCacheMetadataBatch(pubkeys, relayUrl, httpClient);
        String cached = getCachedDisplayName(pubkey);
        return cached != null ? cached : truncatePubkey(pubkey);
    }

    private void fetchAndCacheMetadataBatch(List<String> pubkeys, String relayUrl, OkHttpClient httpClient) {
        if (pubkeys.isEmpty() || relayUrl == null) return;

        String subId = "meta-" + Long.toHexString(System.nanoTime());
        CountDownLatch latch = new CountDownLatch(1);
        Map<String, JSONObject> results = new ConcurrentHashMap<>();

        try {
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
                            String pk = event.optString("pubkey");
                            String content = event.optString("content");
                            if (!results.containsKey(pk)) {
                                results.put(pk, new JSONObject(content));
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
        } catch (Exception e) {
            Log.w(TAG, "Failed to fetch metadata", e);
        }

        // Cache all resolved names
        for (Map.Entry<String, JSONObject> entry : results.entrySet()) {
            String displayName = resolveDisplayName(entry.getValue(), entry.getKey());
            cacheDisplayName(entry.getKey(), displayName);
        }
    }

    // --- Event helpers ---

    String getActorPubkey(JSONObject event) {
        int kind = event.optInt("kind");
        if (kind == 9735) {
            JSONArray tags = event.optJSONArray("tags");
            if (tags != null) {
                for (int i = 0; i < tags.length(); i++) {
                    JSONArray tag = tags.optJSONArray(i);
                    if (tag != null && "P".equals(tag.optString(0))) {
                        return tag.optString(1);
                    }
                }
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
        return truncatePubkey(pubkey);
    }

    private String truncatePubkey(String pubkey) {
        if (pubkey.length() > 12) {
            return pubkey.substring(0, 8) + "...";
        }
        return pubkey;
    }

    private void showNotification(int id, String title, String body) {
        NotificationManager manager = (NotificationManager)
                context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        Intent intent = new Intent(context, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(body)
                .setSmallIcon(R.drawable.ic_stat_mew)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true);

        manager.notify(id, builder.build());
    }

    public long getLastSeenTimestamp() {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getLong(KEY_LAST_SEEN, 0);
    }

    public void setLastSeenTimestamp(long timestamp) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putLong(KEY_LAST_SEEN, timestamp).apply();
    }

    private int hashId(String id) {
        int hash = 0;
        for (int i = 0; i < Math.min(id.length(), 16); i++) {
            hash = ((hash << 5) - hash) + id.charAt(i);
        }
        return (Math.abs(hash) % MAX_NOTIFICATION_ID) + 2;
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
