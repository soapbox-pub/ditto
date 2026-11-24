package pub.ditto.app;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * The user's mute list, for dropping notifications from muted people, threads,
 * hashtags, and words — a Java port of {@code createMuteMatcher} in the web
 * client's {@code src/lib/muteHelpers.ts}, so a notification the in-app list
 * hides never reaches the shade either.
 *
 * Handed over by the JS layer with the subscriptions, private half already
 * decrypted. It stays in the app's own storage and is never sent anywhere.
 */
public final class MuteFilter {

    public static final MuteFilter EMPTY = new MuteFilter();

    /** Tags whose value is text a client shows in place of, or beside, the content. */
    private static final Set<String> TEXT_TAGS = new HashSet<>(java.util.Arrays.asList(
            "title", "summary", "name", "description", "subject", "location", "content-warning"));

    private final Set<String> pubkeys = new HashSet<>();
    private final Set<String> threads = new HashSet<>();
    private final Set<String> hashtags = new HashSet<>();
    private final List<String> words = new ArrayList<>();
    /** Skip hashtag, word, and profile mutes for people the user follows. */
    private boolean exemptFollows = false;
    /** Also mute authors whose profile contains a muted word. */
    private boolean profiles = false;

    private MuteFilter() {}

    /** Parse the stored JSON. Anything unreadable mutes nothing. */
    public static MuteFilter parse(String json) {
        if (json == null || json.isEmpty()) return EMPTY;
        try {
            JSONObject obj = new JSONObject(json);
            MuteFilter filter = new MuteFilter();
            addAll(filter.pubkeys, obj.optJSONArray("pubkeys"), false);
            addAll(filter.threads, obj.optJSONArray("threads"), false);
            addAll(filter.hashtags, obj.optJSONArray("hashtags"), true);
            Set<String> words = new HashSet<>();
            addAll(words, obj.optJSONArray("words"), true);
            filter.words.addAll(words);
            filter.exemptFollows = obj.optBoolean("exemptFollows", false);
            filter.profiles = obj.optBoolean("profiles", false);
            return filter;
        } catch (JSONException e) {
            return EMPTY;
        }
    }

    private static void addAll(Set<String> into, JSONArray values, boolean lowercase) {
        if (values == null) return;
        for (int i = 0; i < values.length(); i++) {
            String value = values.optString(i, "");
            if (value.isEmpty()) continue;
            into.add(lowercase ? value.toLowerCase(Locale.ROOT) : value);
        }
    }

    public boolean isEmpty() {
        return pubkeys.isEmpty() && threads.isEmpty() && hashtags.isEmpty() && words.isEmpty();
    }

    /**
     * Whether the mute list hides {@code event}. {@code sender} is who it is
     * from — for a zap, the zapper rather than the receipt's signer — and
     * {@code followed} whether the user follows them.
     */
    public boolean isMuted(JSONObject event, String sender, boolean followed) {
        if (isEmpty()) return false;
        if (pubkeys.contains(event.optString("pubkey")) || pubkeys.contains(sender)) return true;

        if (isInMutedThread(event)) return true;

        JSONArray tags = event.optJSONArray("tags");

        if (exemptFollows && followed) return false;

        if (!hashtags.isEmpty() && tags != null) {
            for (int i = 0; i < tags.length(); i++) {
                JSONArray tag = tags.optJSONArray(i);
                if (tag == null || tag.length() < 2 || !"t".equals(tag.optString(0))) continue;
                if (hashtags.contains(tag.optString(1).toLowerCase(Locale.ROOT))) return true;
            }
        }

        if (words.isEmpty()) return false;
        String text = mutableText(event, tags);
        for (String word : words) {
            if (text.contains(word)) return true;
        }
        return false;
    }

    /**
     * Whether {@code event} is a muted thread or a reply inside one. Checked
     * against the post a reaction, repost, or zap targets, so acting on any
     * reply in a muted thread is hidden too, not only acting on its root.
     */
    public boolean isInMutedThread(JSONObject event) {
        if (threads.isEmpty()) return false;
        if (threads.contains(event.optString("id"))) return true;
        // A NIP-10 reply names the thread in its `e` tags; a NIP-22 comment
        // names the root in `E`. NIP-10 `mention` e-tags are inline quotes.
        JSONArray tags = event.optJSONArray("tags");
        if (tags == null) return false;
        for (int i = 0; i < tags.length(); i++) {
            JSONArray tag = tags.optJSONArray(i);
            if (tag == null || tag.length() < 2) continue;
            String name = tag.optString(0);
            boolean thread = ("e".equals(name) && !"mention".equals(tag.optString(3)))
                    || "E".equals(name);
            if (thread && threads.contains(tag.optString(1))) return true;
        }
        return false;
    }

    /**
     * Whether the author's profile contains a muted word, when the user asked
     * for profiles to be checked. {@code profileText} comes from
     * {@link #profileText}; {@code followed} is whether the user follows them.
     */
    public boolean isProfileMuted(String profileText, boolean followed) {
        if (!profiles || words.isEmpty() || profileText == null) return false;
        if (exemptFollows && followed) return false;
        for (String word : words) {
            if (profileText.contains(word)) return true;
        }
        return false;
    }

    /** Profile fields shown to people, matched instead of the raw kind 0 JSON. */
    private static final String[] PROFILE_TEXT_FIELDS = {"name", "display_name", "about", "nip05", "website"};

    /**
     * The lowercased text muted words are matched against in a kind 0's
     * content: the name, bio, and other visible fields, not the JSON keys.
     */
    public static String profileText(String content) {
        try {
            JSONObject meta = new JSONObject(content);
            StringBuilder text = new StringBuilder();
            for (String field : PROFILE_TEXT_FIELDS) {
                Object value = meta.opt(field);
                if (!(value instanceof String)) continue;
                if (text.length() > 0) text.append('\n');
                text.append((String) value);
            }
            return text.toString().toLowerCase(Locale.ROOT);
        } catch (JSONException e) {
            return content.toLowerCase(Locale.ROOT);
        }
    }

    /**
     * The lowercased text muted words are matched against: the content plus the
     * visible text some kinds keep in tags. A reaction's {@code +} or empty
     * content is a 👍 like, so a muted 👍 hides those too.
     */
    private static String mutableText(JSONObject event, JSONArray tags) {
        int kind = event.optInt("kind");
        String content = event.optString("content");
        if (kind == 7) {
            String trimmed = content.trim();
            if (trimmed.equals("+") || trimmed.isEmpty()) return "👍";
        }
        StringBuilder text = new StringBuilder(content);
        if (tags != null) {
            for (int i = 0; i < tags.length(); i++) {
                JSONArray tag = tags.optJSONArray(i);
                if (tag == null || tag.length() < 2) continue;
                String name = tag.optString(0);
                // A zap receipt's `description` is the zap request JSON, not prose.
                if (TEXT_TAGS.contains(name) && !("description".equals(name) && kind == 9735)) {
                    text.append('\n').append(tag.optString(1));
                } else if ("option".equals(name) && tag.length() >= 3) {
                    text.append('\n').append(tag.optString(2));
                } else if ("imeta".equals(name)) {
                    for (int j = 1; j < tag.length(); j++) {
                        String entry = tag.optString(j);
                        if (entry.startsWith("alt ")) text.append('\n').append(entry.substring(4));
                    }
                }
            }
        }
        return text.toString().toLowerCase(Locale.ROOT);
    }
}
