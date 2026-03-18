package pub.ditto.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;

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

/**
 * Handles notification dispatch for Nostr events.
 */
public class NostrPoller {

    private static final String PREFS_NAME = "ditto_notifications";
    private static final String KEY_LAST_SEEN = "nostr:notification-last-seen";
    private static final String CHANNEL_ID = "ditto_notifications";
    private static final int MAX_NOTIFICATION_ID = 2147483646;

    private final Context context;

    public NostrPoller(Context context) {
        this.context = context;
        createNotificationChannel();
    }

    /**
     * Process a single incoming event and dispatch a native notification.
     */
    public void handleEvent(JSONObject event, String userPubkey, String relayUrl, OkHttpClient httpClient) {
        String pubkey = event.optString("pubkey");
        if (pubkey.equals(userPubkey)) return; // Skip self-interactions

        String action = kindToAction(event);
        showNotification(
                hashId(event.optString("id")),
                "Ditto",
                "Someone " + action
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

        // Collect referenced event IDs for reactions, reposts, and zaps so we
        // can verify the referenced post was authored by the current user.
        Set<String> refIdsNeeded = new HashSet<>();
        for (JSONObject event : filtered) {
            int kind = event.optInt("kind");
            if (kind == 7 || kind == 6 || kind == 16 || kind == 9735) {
                String refId = getReferencedEventId(event);
                if (refId != null) refIdsNeeded.add(refId);
            }
        }

        // Fetch referenced events synchronously so we can filter before notifying.
        Map<String, JSONObject> referencedMap = refIdsNeeded.isEmpty()
                ? new HashMap<>()
                : fetchEventsByIds(new ArrayList<>(refIdsNeeded), relayUrl, httpClient);

        // Filter out reactions/reposts/zaps on posts the user didn't author.
        List<JSONObject> notifiable = new ArrayList<>();
        for (JSONObject event : filtered) {
            int kind = event.optInt("kind");
            if (kind == 7 || kind == 6 || kind == 16 || kind == 9735) {
                String refId = getReferencedEventId(event);
                if (refId == null) continue;
                JSONObject refEvent = referencedMap.get(refId);
                if (refEvent == null || !userPubkey.equals(refEvent.optString("pubkey"))) continue;
            }
            notifiable.add(event);
        }

        if (notifiable.isEmpty()) return;

        // Dispatch notifications
        if (notifiable.size() > 3) {
            showNotification(
                    hashId(notifiable.get(0).optString("id") + "-summary"),
                    "Ditto",
                    "You have " + notifiable.size() + " new notifications"
            );
        } else {
            for (JSONObject event : notifiable) {
                String action = kindToAction(event);
                showNotification(
                        hashId(event.optString("id")),
                        "Ditto",
                        "Someone " + action
                );
            }
        }

        // Update last-seen to newest event (use full filtered list, not just
        // notifiable, so we don't re-fetch already-seen events on next cycle).
        long newestTs = getLastSeenTimestamp();
        for (JSONObject event : filtered) {
            long ts = event.optLong("created_at", 0);
            if (ts > newestTs) newestTs = ts;
        }
        setLastSeenTimestamp(newestTs);
    }

    /** Returns the last `e` tag value from the event, or null if absent. */
    private String getReferencedEventId(JSONObject event) {
        JSONArray tags = event.optJSONArray("tags");
        if (tags == null) return null;
        String last = null;
        for (int i = 0; i < tags.length(); i++) {
            JSONArray tag = tags.optJSONArray(i);
            if (tag != null && "e".equals(tag.optString(0)) && tag.length() > 1) {
                last = tag.optString(1);
            }
        }
        return last;
    }

    /**
     * Synchronously fetch a set of events by ID from the relay.
     * Uses a CountDownLatch so the caller blocks until EOSE or timeout (5 s).
     */
    private Map<String, JSONObject> fetchEventsByIds(List<String> ids, String relayUrl, OkHttpClient httpClient) {
        Map<String, JSONObject> result = new HashMap<>();
        if (ids.isEmpty()) return result;

        CountDownLatch latch = new CountDownLatch(1);
        String subId = "ref-" + Long.toHexString(System.nanoTime());

        try {
            JSONArray idsArr = new JSONArray();
            for (String id : ids) idsArr.put(id);

            JSONObject filter = new JSONObject();
            filter.put("ids", idsArr);
            filter.put("limit", ids.size());

            JSONArray req = new JSONArray();
            req.put("REQ");
            req.put(subId);
            req.put(filter);
            String reqStr = req.toString();

            okhttp3.Request request = new okhttp3.Request.Builder().url(relayUrl).build();
            httpClient.newWebSocket(request, new okhttp3.WebSocketListener() {
                @Override
                public void onOpen(okhttp3.WebSocket webSocket, okhttp3.Response response) {
                    webSocket.send(reqStr);
                }

                @Override
                public void onMessage(okhttp3.WebSocket webSocket, String text) {
                    try {
                        JSONArray msg = new JSONArray(text);
                        String type = msg.optString(0);
                        if ("EVENT".equals(type) && subId.equals(msg.optString(1))) {
                            JSONObject ev = msg.getJSONObject(2);
                            result.put(ev.optString("id"), ev);
                        } else if ("EOSE".equals(type) || "CLOSED".equals(type)) {
                            JSONArray close = new JSONArray();
                            close.put("CLOSE");
                            close.put(subId);
                            webSocket.send(close.toString());
                            webSocket.close(1000, "done");
                            latch.countDown();
                        }
                    } catch (Exception ignored) {}
                }

                @Override
                public void onFailure(okhttp3.WebSocket webSocket, Throwable t, okhttp3.Response response) {
                    latch.countDown();
                }

                @Override
                public void onClosed(okhttp3.WebSocket webSocket, int code, String reason) {
                    latch.countDown();
                }
            });

            latch.await(5, TimeUnit.SECONDS);
        } catch (Exception ignored) {}

        return result;
    }

    // --- Event helpers ---

    private String kindToAction(JSONObject event) {
        int kind = event.optInt("kind");
        switch (kind) {
            case 7: return "reacted to your post";
            case 6: // fall-through
            case 16: return "reposted your note";
            case 9735: {
                long sats = getZapAmount(event);
                if (sats > 0) {
                    return "zapped you " + formatSats(sats) + " sats";
                }
                return "zapped you";
            }
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
            case 1111: {
                // NIP-22 comment. If the lowercase k tag is "1111", the parent is another
                // comment — this is a reply. Otherwise it's a top-level comment on content.
                JSONArray tags = event.optJSONArray("tags");
                if (tags != null) {
                    for (int i = 0; i < tags.length(); i++) {
                        JSONArray tag = tags.optJSONArray(i);
                        if (tag != null && "k".equals(tag.optString(0)) && "1111".equals(tag.optString(1))) {
                            return "replied to your comment";
                        }
                    }
                }
                return "commented on your post";
            }
            default: return "mentioned you";
        }
    }

    /**
     * Extract zap amount in sats from a kind 9735 zap receipt event.
     * Checks the "amount" tag first (millisats), then falls back to
     * parsing the "description" tag's zap request JSON for an amount tag.
     * Returns 0 if no amount can be determined.
     */
    private long getZapAmount(JSONObject event) {
        JSONArray tags = event.optJSONArray("tags");
        if (tags == null) return 0;

        // Check for direct "amount" tag (value in millisats)
        for (int i = 0; i < tags.length(); i++) {
            JSONArray tag = tags.optJSONArray(i);
            if (tag != null && "amount".equals(tag.optString(0))) {
                try {
                    long msats = Long.parseLong(tag.optString(1));
                    if (msats > 0) return msats / 1000;
                } catch (NumberFormatException ignored) {}
            }
        }

        // Fall back to "description" tag (zap request JSON) -> amount tag
        for (int i = 0; i < tags.length(); i++) {
            JSONArray tag = tags.optJSONArray(i);
            if (tag != null && "description".equals(tag.optString(0))) {
                try {
                    JSONObject zapReq = new JSONObject(tag.optString(1));
                    JSONArray reqTags = zapReq.optJSONArray("tags");
                    if (reqTags != null) {
                        for (int j = 0; j < reqTags.length(); j++) {
                            JSONArray reqTag = reqTags.optJSONArray(j);
                            if (reqTag != null && "amount".equals(reqTag.optString(0))) {
                                long msats = Long.parseLong(reqTag.optString(1));
                                if (msats > 0) return msats / 1000;
                            }
                        }
                    }
                } catch (Exception ignored) {}
            }
        }

        return 0;
    }

    /**
     * Format sats for compact display.
     * e.g., 500 -> "500", 1500 -> "1.5K", 1000000 -> "1M"
     */
    private String formatSats(long sats) {
        if (sats >= 1_000_000) {
            double val = sats / 1_000_000.0;
            if (val == Math.floor(val)) return String.format("%d", (long) val) + "M";
            return String.format("%.1f", val).replaceAll("\\.0$", "") + "M";
        } else if (sats >= 1_000) {
            double val = sats / 1_000.0;
            if (val == Math.floor(val)) return String.format("%d", (long) val) + "K";
            return String.format("%.1f", val).replaceAll("\\.0$", "") + "K";
        }
        return String.valueOf(sats);
    }

    private void showNotification(int id, String title, String body) {
        NotificationManager manager = (NotificationManager)
                context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        Intent intent = new Intent(context, MainActivity.class);
        intent.setData(Uri.parse("https://ditto.pub/notifications"));
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                context, id, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(body)
                .setSmallIcon(R.drawable.ic_stat_ditto)
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
