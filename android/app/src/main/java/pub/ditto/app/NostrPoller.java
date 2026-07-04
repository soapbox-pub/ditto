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

import java.util.HashMap;
import java.util.Map;

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
 * All notifications join a single group with a summary, so pile-ups collapse
 * into one expandable shade entry and alert once instead of buzzing per event.
 */
public class NostrPoller {

    private static final String PREFS_NAME = "ditto_notifications";
    private static final String KEY_LAST_SEEN = "nostr:notification-last-seen";
    private static final String CHANNEL_ID = "ditto_notifications";
    private static final int MAX_NOTIFICATION_ID = 2147483646;

    /** Group key so event notifications stack into one shade entry. */
    private static final String GROUP_KEY = "pub.ditto.app.EVENTS";

    /**
     * Fixed id for the group summary. {@link #hashId} never returns less than
     * 2 and the foreground service owns id 1, so 0 is free.
     */
    private static final int GROUP_SUMMARY_ID = 0;

    /** Max characters of quoted content shown in a notification body. */
    private static final int SNIPPET_CAP = 120;

    /** Avatar bitmap size (px) for the notification large icon. */
    private static final int AVATAR_PX = 128;

    /** Font size (px) used to rasterize emoji avatar-shape masks. */
    private static final int MASK_FONT_PX = 256;

    /** Alpha threshold (~10%) so shadows/AA fringes don't inflate the mask box. */
    private static final int MASK_ALPHA_THRESHOLD = 25;

    private final Context context;
    private final Handler handler = new Handler(Looper.getMainLooper());

    /** picture URL + shape → shaped bitmap, decoded once per service lifetime. */
    private final Map<String, Bitmap> avatarCache = new HashMap<>();

    /** emoji → glyph alpha-mask bitmap (AVATAR_PX²). */
    private final Map<String, Bitmap> emojiMaskCache = new HashMap<>();

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
     * @param authorShape     emoji avatar shape from kind-0 metadata (may be null)
     * @param referencedEvent the user's own post being acted on (may be null)
     * @param httpClient      client used to fetch the avatar bitmap
     */
    public void showEventNotification(
            JSONObject event,
            String authorName,
            String authorPicture,
            String authorShape,
            JSONObject referencedEvent,
            OkHttpClient httpClient
    ) {
        String title = (authorName != null && !authorName.isEmpty()) ? authorName : "Someone";
        String body = buildBody(event, referencedEvent);
        int notifId = hashId(event.optString("id"));
        String senderKey = getSenderPubkey(event);
        long createdAt = event.optLong("created_at", 0);
        long whenMs = createdAt > 0 ? createdAt * 1000L : System.currentTimeMillis();

        // Post immediately without the avatar — never block a notification on
        // an image fetch. Re-posts silently in place once the avatar loads.
        showNotification(notifId, title, body, null, senderKey, whenMs, false);

        if (authorPicture != null && !authorPicture.isEmpty()) {
            loadAvatar(authorPicture, authorShape, httpClient, bitmap -> {
                if (bitmap != null) {
                    showNotification(notifId, title, body, bitmap, senderKey, whenMs, true);
                }
            });
        }
    }

    /** Show a single summary notification for a large backfill batch. */
    public void showSummaryNotification(int count) {
        showNotification(
                hashId("summary"),
                "Ditto",
                "You have " + count + " new notifications",
                null,
                null,
                System.currentTimeMillis(),
                false
        );
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

    /**
     * Fetch an avatar and crop it to the author's shape (emoji mask from the
     * kind-0 `shape` property, mirroring the web client's avatar shapes) or a
     * circle by default. Served from cache when possible.
     */
    private void loadAvatar(String url, String shape, OkHttpClient httpClient, BitmapCallback cb) {
        String maskShape = isEmojiShape(shape) ? shape : null;
        String cacheKey = url + "\n" + (maskShape != null ? maskShape : "");
        Bitmap cached = avatarCache.get(cacheKey);
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
                                result = shapeCrop(raw, maskShape);
                            }
                        }
                    } catch (Exception ignored) {
                    } finally {
                        response.close();
                    }
                    final Bitmap finalResult = result;
                    handler.post(() -> {
                        if (finalResult != null) avatarCache.put(cacheKey, finalResult);
                        cb.onBitmap(finalResult);
                    });
                }
            });
        } catch (Exception e) {
            // Malformed URL etc.
            cb.onBitmap(null);
        }
    }

    /**
     * Mirrors the web client's `isEmoji()` check: an avatar shape is a short
     * non-ASCII string (specific Unicode emoji matching is fragile and would
     * exclude flags, keycaps, and ZWJ families).
     */
    public static boolean isEmojiShape(String value) {
        if (value == null || value.isEmpty() || value.length() > 20) return false;
        for (int i = 0; i < value.length(); i++) {
            if (value.charAt(i) > 127) return true;
        }
        return false;
    }

    /** Crop to the emoji shape when set (circle fallback on any failure). */
    private Bitmap shapeCrop(Bitmap src, String shape) {
        if (shape != null) {
            Bitmap mask = emojiMask(shape);
            if (mask != null) {
                return maskCrop(src, mask);
            }
        }
        return circleCrop(src);
    }

    /** Center-crop {@code src} square, scale to AVATAR_PX, keep only mask alpha. */
    private static Bitmap maskCrop(Bitmap src, Bitmap mask) {
        Bitmap scaled = squareScale(src);
        Bitmap output = Bitmap.createBitmap(AVATAR_PX, AVATAR_PX, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(output);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        canvas.drawBitmap(mask, 0, 0, paint);
        paint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_IN));
        canvas.drawBitmap(scaled, new Rect(0, 0, AVATAR_PX, AVATAR_PX), new Rect(0, 0, AVATAR_PX, AVATAR_PX), paint);
        return output;
    }

    /**
     * Rasterize an emoji glyph into an AVATAR_PX² alpha mask, mirroring the
     * web client's `getEmojiMaskUrl()`: draw large, find the tight alpha
     * bounding box (ignoring faint shadow pixels), square the crop, and
     * scale so the glyph fills the mask edge-to-edge. Returns null when the
     * glyph can't be rendered (tofu/empty), which falls back to a circle.
     */
    private Bitmap emojiMask(String emoji) {
        Bitmap cached = emojiMaskCache.get(emoji);
        if (cached != null) return cached;

        try {
            // Pass 1: draw the emoji on an oversized scratch bitmap.
            int scratch = MASK_FONT_PX * 3 / 2;
            Bitmap scratchBmp = Bitmap.createBitmap(scratch, scratch, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(scratchBmp);
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
            paint.setTextSize(MASK_FONT_PX);
            paint.setTextAlign(Paint.Align.CENTER);
            float x = scratch / 2f;
            float y = scratch / 2f - (paint.ascent() + paint.descent()) / 2f;
            canvas.drawText(emoji, x, y, paint);

            // Pass 2: tight bounding box of pixels above the alpha threshold.
            int[] px = new int[scratch * scratch];
            scratchBmp.getPixels(px, 0, scratch, 0, 0, scratch, scratch);
            int top = scratch, bottom = -1, left = scratch, right = -1;
            for (int row = 0; row < scratch; row++) {
                for (int col = 0; col < scratch; col++) {
                    if ((px[row * scratch + col] >>> 24) > MASK_ALPHA_THRESHOLD) {
                        if (row < top) top = row;
                        if (row > bottom) bottom = row;
                        if (col < left) left = col;
                        if (col > right) right = col;
                    }
                }
            }
            if (bottom < top || right < left) return null; // nothing drawn

            // Pass 3: square the bounding box (centered on the shorter axis).
            int cropW = right - left + 1;
            int cropH = bottom - top + 1;
            if (cropW > cropH) {
                top -= (cropW - cropH) / 2;
                cropH = cropW;
            } else if (cropH > cropW) {
                left -= (cropH - cropW) / 2;
                cropW = cropH;
            }
            if (top < 0) top = 0;
            if (left < 0) left = 0;
            if (top + cropH > scratch) cropH = scratch - top;
            if (left + cropW > scratch) cropW = scratch - left;

            // Pass 4: scale the crop to the mask size. Only alpha is used.
            Bitmap cropped = Bitmap.createBitmap(scratchBmp, left, top, cropW, cropH);
            Bitmap mask = Bitmap.createScaledBitmap(cropped, AVATAR_PX, AVATAR_PX, true);
            emojiMaskCache.put(emoji, mask);
            return mask;
        } catch (Exception e) {
            return null;
        }
    }

    /** Center-crop to a square and scale to AVATAR_PX. */
    private static Bitmap squareScale(Bitmap src) {
        int size = Math.min(src.getWidth(), src.getHeight());
        int x = (src.getWidth() - size) / 2;
        int y = (src.getHeight() - size) / 2;
        Bitmap square = Bitmap.createBitmap(src, x, y, size, size);
        return Bitmap.createScaledBitmap(square, AVATAR_PX, AVATAR_PX, true);
    }

    /** Scale to AVATAR_PX and crop to a circle for the large icon slot. */
    private static Bitmap circleCrop(Bitmap src) {
        Bitmap scaled = squareScale(src);

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
     * Build and post a notification.
     *
     * When {@code senderKey} is non-null the notification is rendered with
     * MessagingStyle so the system shows the sender's avatar (or a monogram
     * fallback while it loads) as the shade icon instead of the app logo.
     */
    private void showNotification(int id, String title, String body, Bitmap avatar,
                                  String senderKey, long whenMs, boolean silentUpdate) {
        NotificationManager manager = (NotificationManager)
                context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(body)
                .setSmallIcon(R.drawable.ic_stat_ditto)
                .setWhen(whenMs)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setContentIntent(notificationsIntent(id))
                .setAutoCancel(true)
                // Stack into one group entry; only the group summary alerts,
                // so a burst of events buzzes once instead of once per event.
                .setGroup(GROUP_KEY)
                .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_SUMMARY);

        if (senderKey != null) {
            // Conversation-style rendering: the Person icon (the author's
            // avatar) replaces the app logo as the notification icon.
            Person.Builder sender = new Person.Builder()
                    .setName(title)
                    .setKey(senderKey);
            if (avatar != null) {
                sender.setIcon(IconCompat.createWithBitmap(avatar));
            }
            Person senderPerson = sender.build();
            NotificationCompat.MessagingStyle style = new NotificationCompat.MessagingStyle(
                    new Person.Builder().setName("You").setKey("self").build());
            style.addMessage(body, whenMs, senderPerson);
            builder.setStyle(style);
        } else {
            builder.setStyle(new NotificationCompat.BigTextStyle().bigText(body));
        }

        if (avatar != null) {
            // Fallback for OS versions that don't surface the Person icon.
            builder.setLargeIcon(avatar);
        }
        if (silentUpdate) {
            // Avatar re-post: replace in place without a second buzz.
            builder.setOnlyAlertOnce(true).setSilent(true);
        }

        manager.notify(id, builder.build());

        if (!silentUpdate) {
            showGroupSummary(manager);
        }
    }

    /**
     * Post (or refresh) the collapsed group summary. {@code setOnlyAlertOnce}
     * means the group buzzes on its first notification and pile-ons arrive
     * quietly until the user opens or dismisses the stack.
     */
    private void showGroupSummary(NotificationManager manager) {
        NotificationCompat.Builder summary = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setContentTitle("Ditto")
                .setContentText("New notifications")
                .setSmallIcon(R.drawable.ic_stat_ditto)
                .setStyle(new NotificationCompat.InboxStyle())
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setContentIntent(notificationsIntent(GROUP_SUMMARY_ID))
                .setAutoCancel(true)
                .setGroup(GROUP_KEY)
                .setGroupSummary(true)
                .setOnlyAlertOnce(true);

        manager.notify(GROUP_SUMMARY_ID, summary.build());
    }

    /** Tap intent deep-linking to the in-app notifications page. */
    private PendingIntent notificationsIntent(int requestCode) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setData(Uri.parse("https://ditto.pub/notifications"));
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(
                context, requestCode, intent,
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
