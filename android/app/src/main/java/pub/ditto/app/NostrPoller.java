package pub.ditto.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import androidx.core.graphics.drawable.IconCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

/**
 * Builds and dispatches rich Android notifications for Nostr events.
 *
 * Text style follows the Twitter convention: the title is WHO (the resolved
 * author display name), the body is WHAT and HOW — the action verb plus a
 * snippet of the relevant content, e.g.:
 *
 *   Alice
 *   Reacted ❤️ to your post: “Just shipped the new release…”
 *
 *   Bob
 *   Replied: “Totally agree with this take”
 *
 * The caller (NotificationRelayService) resolves the author's kind-0 profile
 * and the referenced event before invoking {@link #showEventNotification}, so
 * this class is purely synchronous text generation + dispatch. Avatars load
 * asynchronously: the notification posts immediately name-only, then silently
 * re-posts in place once the picture is fetched. Event notifications use
 * MessagingStyle so the sender's avatar — not the Ditto logo — is rendered as
 * the notification icon in the shade (the status-bar small icon stays the
 * monochrome Ditto glyph, which Android requires to be an alpha mask).
 *
 * All events accumulate into ONE MessagingStyle notification (id
 * {@link #EVENTS_NOTIFICATION_ID}), each event a message from its author.
 * Modern Android promotes MessagingStyle notifications into the
 * Conversations section where custom groups are ignored, so posting
 * per-event notifications can never collapse — a single accumulating
 * conversation is the only reliable way to combine them. The notification
 * alerts when first posted and updates silently until the user opens or
 * dismisses it ({@link NotificationDismissReceiver} resets the
 * accumulator).
 */
public class NostrPoller {

    private static final String PREFS_NAME = "ditto_notifications";
    private static final String KEY_LAST_SEEN = "nostr:notification-last-seen";
    private static final String CHANNEL_ID = "ditto_notifications";

    /** Fixed id for the single combined notification (the foreground service owns 1). */
    private static final int EVENTS_NOTIFICATION_ID = 2;

    /** Max messages retained in the combined notification (newest win). */
    private static final int MAX_MESSAGES = 10;

    /** Max characters of quoted content shown in a notification body. */
    private static final int SNIPPET_CAP = 120;

    /** Avatar bitmap size (px) for the notification large icon. */
    private static final int AVATAR_PX = 128;

    private final Context context;
    private final Handler handler = new Handler(Looper.getMainLooper());

    /** picture URL → circle-cropped bitmap, decoded once per service lifetime. */
    private final Map<String, Bitmap> avatarCache = new HashMap<>();

    /** One message line in the combined notification. */
    private static final class Entry {
        final String senderKey;
        final String senderName;
        final String text;
        final long when;
        Bitmap avatar; // filled in asynchronously

        Entry(String senderKey, String senderName, String text, long when) {
            this.senderKey = senderKey;
            this.senderName = senderName;
            this.text = text;
            this.when = when;
        }
    }

    /**
     * Messages accumulated since the user last opened or dismissed the
     * notification. Static so {@link NotificationDismissReceiver} can reset
     * it without a service reference.
     */
    private static final List<Entry> MESSAGES = new ArrayList<>();

    /** Called when the user dismisses the combined notification. */
    public static void clearAccumulatedMessages() {
        synchronized (MESSAGES) {
            MESSAGES.clear();
        }
    }

    public NostrPoller(Context context) {
        this.context = context;
        createNotificationChannel();
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Show a rich notification for a single event.
     *
     * @param event           the notification event (kind 1, 6, 7, …)
     * @param authorName      resolved display name of the acting user (may be null)
     * @param authorPicture   resolved profile picture URL (may be null)
     * @param referencedEvent the user's own post being acted on (may be null)
     * @param httpClient      client used to fetch the avatar bitmap
     */
    public void showEventNotification(
            JSONObject event,
            String authorName,
            String authorPicture,
            JSONObject referencedEvent,
            OkHttpClient httpClient
    ) {
        String title = (authorName != null && !authorName.isEmpty()) ? authorName : "Someone";
        String body = buildBody(event, referencedEvent);
        String senderKey = getSenderPubkey(event);
        long createdAt = event.optLong("created_at", 0);
        long whenMs = createdAt > 0 ? createdAt * 1000L : System.currentTimeMillis();

        Entry entry = new Entry(senderKey, title, body, whenMs);
        addEntry(entry);

        // Post immediately without the avatar — never block a notification on
        // an image fetch. Re-posts silently in place once the avatar loads.
        postCombinedNotification(false);

        if (authorPicture != null && !authorPicture.isEmpty()) {
            loadAvatar(authorPicture, httpClient, bitmap -> {
                if (bitmap != null) {
                    entry.avatar = bitmap;
                    postCombinedNotification(true);
                }
            });
        }
    }

    /** Fold a large backfill batch into the combined notification. */
    public void showSummaryNotification(int count) {
        addEntry(new Entry(
                "ditto",
                "Ditto",
                "You have " + count + " new notifications",
                System.currentTimeMillis()
        ));
        postCombinedNotification(false);
    }

    private static void addEntry(Entry entry) {
        synchronized (MESSAGES) {
            MESSAGES.add(entry);
            while (MESSAGES.size() > MAX_MESSAGES) {
                MESSAGES.remove(0);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Text generation
    // -------------------------------------------------------------------------

    /** Build the descriptive body line for an event. */
    private String buildBody(JSONObject event, JSONObject referencedEvent) {
        int kind = event.optInt("kind");
        String refSnippet = referencedEvent != null
                ? snippet(referencedEvent.optString("content"))
                : null;
        String refNoun = kindNoun(referencedEvent);

        switch (kind) {
            case 7: {
                String base = "Reacted " + reactionEmoji(event) + " to your " + refNoun;
                return appendQuote(base, refSnippet);
            }
            case 6:
            case 16: {
                String base = "Reposted your " + refNoun;
                return appendQuote(base, refSnippet);
            }
            case 9735: {
                long sats = getZapAmount(event);
                String base = sats > 0
                        ? "Zapped you " + formatSats(sats) + " sats"
                        : "Zapped you";
                return appendQuote(base, refSnippet);
            }
            case 1: {
                String content = snippet(event.optString("content"));
                if (hasTag(event, "e")) {
                    return content != null ? "Replied: “" + content + "”" : "Replied to your post";
                }
                return content != null ? "Mentioned you: “" + content + "”" : "Mentioned you";
            }
            case 1111: {
                String content = snippet(event.optString("content"));
                boolean isCommentReply = "1111".equals(tagValue(event, "k"));
                String base = isCommentReply ? "Replied to your comment" : "Commented on your " + refNoun;
                return content != null ? base + ": “" + content + "”" : base;
            }
            case 9802: {
                // The highlight's own content IS the excerpt of the user's post.
                String excerpt = snippet(event.optString("content"));
                String base = "Highlighted your " + refNoun;
                return excerpt != null ? base + ": “" + excerpt + "”" : base;
            }
            case 1222:
                return "Sent you a voice message";
            case 1244:
                return "Replied with a voice message";
            case 8:
                return "Awarded you a badge";
            case 8211:
                return "Sent you a letter";
            default: {
                String content = snippet(event.optString("content"));
                return content != null ? "Mentioned you: “" + content + "”" : "Mentioned you";
            }
        }
    }

    private static String appendQuote(String base, String snippet) {
        return snippet != null ? base + ": “" + snippet + "”" : base;
    }

    /** Noun for the referenced (acted-upon) event, mirroring the in-app labels. */
    private static String kindNoun(JSONObject referencedEvent) {
        if (referencedEvent == null) return "post";
        switch (referencedEvent.optInt("kind", 1)) {
            case 0: return "profile";
            case 20: return "photo";
            case 21:
            case 22: return "video";
            case 1063: return "file";
            case 1068: return "poll";
            case 1111: return "comment";
            case 1222:
            case 1244: return "voice message";
            case 9802: return "highlight";
            case 30023: return "article";
            default: return "post";
        }
    }

    /**
     * Normalize a kind-7 reaction into a display emoji, mirroring the web
     * client: "+"/empty → 👍, "-" → 👎, ":shortcode:" → bare shortcode,
     * anything else verbatim.
     */
    private static String reactionEmoji(JSONObject event) {
        String c = event.optString("content", "").trim();
        if (c.isEmpty() || c.equals("+")) return "👍";
        if (c.equals("-")) return "👎";
        if (c.length() >= 2 && c.startsWith(":") && c.endsWith(":")) {
            return c.substring(1, c.length() - 1);
        }
        return c;
    }

    /**
     * Collapse whitespace and cap the string for inline quoting.
     * Returns null when there is nothing quotable.
     */
    private static String snippet(String content) {
        if (content == null) return null;
        String collapsed = content.replaceAll("\\s+", " ").trim();
        if (collapsed.isEmpty()) return null;
        if (collapsed.length() > SNIPPET_CAP) {
            return collapsed.substring(0, SNIPPET_CAP - 1).trim() + "…";
        }
        return collapsed;
    }

    /** Returns the first value of the given tag, or null. */
    private static String tagValue(JSONObject event, String name) {
        JSONArray tags = event.optJSONArray("tags");
        if (tags == null) return null;
        for (int i = 0; i < tags.length(); i++) {
            JSONArray tag = tags.optJSONArray(i);
            if (tag != null && name.equals(tag.optString(0)) && tag.length() > 1) {
                return tag.optString(1);
            }
        }
        return null;
    }

    private static boolean hasTag(JSONObject event, String name) {
        JSONArray tags = event.optJSONArray("tags");
        if (tags == null) return false;
        for (int i = 0; i < tags.length(); i++) {
            JSONArray tag = tags.optJSONArray(i);
            if (tag != null && name.equals(tag.optString(0))) return true;
        }
        return false;
    }

    /** Returns the last `e` tag value from the event, or null if absent. */
    public static String getReferencedEventId(JSONObject event) {
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
     * The pubkey of the acting user. For kind 9735 zap receipts the event is
     * signed by the LNURL provider, not the sender — mirror the web client's
     * resolution order: uppercase `P` tag → `description` zap-request pubkey →
     * event pubkey.
     */
    public static String getSenderPubkey(JSONObject event) {
        if (event.optInt("kind") != 9735) return event.optString("pubkey");

        JSONArray tags = event.optJSONArray("tags");
        if (tags != null) {
            for (int i = 0; i < tags.length(); i++) {
                JSONArray tag = tags.optJSONArray(i);
                if (tag != null && "P".equals(tag.optString(0)) && tag.length() > 1) {
                    String p = tag.optString(1);
                    if (!p.isEmpty()) return p;
                }
            }
            for (int i = 0; i < tags.length(); i++) {
                JSONArray tag = tags.optJSONArray(i);
                if (tag != null && "description".equals(tag.optString(0))) {
                    try {
                        JSONObject zapReq = new JSONObject(tag.optString(1));
                        String p = zapReq.optString("pubkey", "");
                        if (!p.isEmpty()) return p;
                    } catch (Exception ignored) {}
                }
            }
        }
        return event.optString("pubkey");
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

    // -------------------------------------------------------------------------
    // Avatar loading
    // -------------------------------------------------------------------------

    private interface BitmapCallback {
        void onBitmap(Bitmap bitmap);
    }

    /** Fetch + circle-crop an avatar, served from cache when possible. */
    private void loadAvatar(String url, OkHttpClient httpClient, BitmapCallback cb) {
        Bitmap cached = avatarCache.get(url);
        if (cached != null) {
            cb.onBitmap(cached);
            return;
        }
        try {
            Request request = new Request.Builder().url(url).build();
            httpClient.newCall(request).enqueue(new Callback() {
                @Override
                public void onFailure(Call call, java.io.IOException e) {
                    handler.post(() -> cb.onBitmap(null));
                }

                @Override
                public void onResponse(Call call, Response response) {
                    Bitmap result = null;
                    try {
                        if (response.isSuccessful() && response.body() != null) {
                            byte[] bytes = response.body().bytes();
                            Bitmap raw = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                            if (raw != null) {
                                result = circleCrop(raw);
                            }
                        }
                    } catch (Exception ignored) {
                    } finally {
                        response.close();
                    }
                    final Bitmap finalResult = result;
                    handler.post(() -> {
                        if (finalResult != null) avatarCache.put(url, finalResult);
                        cb.onBitmap(finalResult);
                    });
                }
            });
        } catch (Exception e) {
            // Malformed URL etc.
            cb.onBitmap(null);
        }
    }

    /** Scale to AVATAR_PX and crop to a circle for the large icon slot. */
    private static Bitmap circleCrop(Bitmap src) {
        int size = Math.min(src.getWidth(), src.getHeight());
        int x = (src.getWidth() - size) / 2;
        int y = (src.getHeight() - size) / 2;
        Bitmap square = Bitmap.createBitmap(src, x, y, size, size);
        Bitmap scaled = Bitmap.createScaledBitmap(square, AVATAR_PX, AVATAR_PX, true);

        Bitmap output = Bitmap.createBitmap(AVATAR_PX, AVATAR_PX, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(output);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        canvas.drawCircle(AVATAR_PX / 2f, AVATAR_PX / 2f, AVATAR_PX / 2f, paint);
        paint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_IN));
        canvas.drawBitmap(scaled, new Rect(0, 0, AVATAR_PX, AVATAR_PX), new Rect(0, 0, AVATAR_PX, AVATAR_PX), paint);
        return output;
    }

    // -------------------------------------------------------------------------
    // Dispatch
    // -------------------------------------------------------------------------

    /**
     * Build and post the single combined notification from the accumulated
     * messages. Each message renders with its author's name and avatar via
     * MessagingStyle. {@code setOnlyAlertOnce} makes the first post buzz and
     * pile-ons update quietly; once the user opens or dismisses it, the
     * accumulator resets and the next event alerts again.
     */
    private void postCombinedNotification(boolean silentUpdate) {
        NotificationManager manager = (NotificationManager)
                context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        List<Entry> snapshot;
        synchronized (MESSAGES) {
            if (MESSAGES.isEmpty()) return;
            snapshot = new ArrayList<>(MESSAGES);
        }

        Person self = new Person.Builder().setName("You").setKey("self").build();
        NotificationCompat.MessagingStyle style = new NotificationCompat.MessagingStyle(self);

        Set<String> senders = new HashSet<>();
        Entry newest = snapshot.get(snapshot.size() - 1);
        for (Entry entry : snapshot) {
            senders.add(entry.senderKey);
            Person.Builder person = new Person.Builder()
                    .setName(entry.senderName)
                    .setKey(entry.senderKey);
            if (entry.avatar != null) {
                person.setIcon(IconCompat.createWithBitmap(entry.avatar));
            }
            style.addMessage(entry.text, entry.when, person.build());
        }
        if (senders.size() > 1) {
            style.setConversationTitle("Notifications").setGroupConversation(true);
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setStyle(style)
                .setSmallIcon(R.drawable.ic_stat_ditto)
                .setWhen(newest.when)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setContentIntent(notificationsIntent())
                .setDeleteIntent(dismissIntent())
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .setNumber(snapshot.size());

        if (newest.avatar != null) {
            // Fallback for renderers that don't surface the Person icons.
            builder.setLargeIcon(newest.avatar);
        }
        if (silentUpdate) {
            // Avatar re-post: replace in place without any chance of a buzz.
            builder.setSilent(true);
        }

        manager.notify(EVENTS_NOTIFICATION_ID, builder.build());
    }

    /** Tap intent deep-linking to the in-app notifications page. */
    private PendingIntent notificationsIntent() {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setData(Uri.parse("https://ditto.pub/notifications"));
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(
                context, EVENTS_NOTIFICATION_ID, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    /** Fired on dismissal (swipe / clear-all / tap with autoCancel). */
    private PendingIntent dismissIntent() {
        Intent intent = new Intent(context, NotificationDismissReceiver.class);
        return PendingIntent.getBroadcast(
                context, EVENTS_NOTIFICATION_ID, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    public long getLastSeenTimestamp() {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getLong(KEY_LAST_SEEN, 0);
    }

    public void setLastSeenTimestamp(long timestamp) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putLong(KEY_LAST_SEEN, timestamp).apply();
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
