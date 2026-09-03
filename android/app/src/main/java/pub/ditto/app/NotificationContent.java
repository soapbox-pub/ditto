package pub.ditto.app;

import java.io.ByteArrayOutputStream;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Prepares raw Nostr event content for a notification line, mirroring what the
 * web client's rich-text preview does on-screen. Ported from Armada's
 * {@code NotificationContent.java}.
 *
 *   - {@code nostr:npub1…} / {@code nostr:nprofile1…} (NIP-27) mentions are
 *     resolved to {@code @display-name} so a body reads "hello @Alex" instead
 *     of "hello nostr:npub1abc…". Resolution is best-effort and injected (the
 *     service resolves from its cache, never the network); an author that
 *     can't be named keeps its raw token rather than showing a wrong name.
 *   - Media URLs the UI would render inline (images/video/audio, by extension —
 *     the same lists as {@code src/lib/mediaUrls.ts}) are STRIPPED, so
 *     "lol https://blossom.example/abcd.jpg" becomes "lol". Non-media links
 *     (e.g. an article URL) are kept verbatim.
 *
 * Pure Java + a tiny bech32/NIP-19 decoder — no Android types — so the logic
 * runs in JVM unit tests. The decoder handles only the two mention forms
 * (npub, nprofile) since those are the only NIP-27 references that name a
 * person.
 */
final class NotificationContent {

    /** Resolves a hex pubkey to a display name (never null; short id fallback). */
    interface MentionResolver {
        String nameFor(String pubkeyHex);
    }

    // Media extensions, kept in sync with src/lib/mediaUrls.ts (image + video +
    // audio + webxdc). A URL ending in one of these is rendered inline in the
    // UI, so it carries no textual meaning in a notification and is stripped.
    private static final String IMAGE_EXTS = "jpg|jpeg|png|gif|webp|svg|avif";
    private static final String VIDEO_EXTS = "mp4|webm|mov|qt|avi|mkv|flv";
    private static final String AUDIO_EXTS = "mp3|mpga|wav|ogg|oga|flac|m4a|aac|opus|weba";
    private static final String MEDIA_EXTS =
            IMAGE_EXTS + "|" + VIDEO_EXTS + "|" + AUDIO_EXTS + "|xdc";

    /**
     * A media URL plus any whitespace immediately before it, so stripping it
     * from the middle of a sentence ("a <url> b") doesn't leave a double space.
     * {@code \S+} up to a media extension with an optional query string mirrors
     * {@code IMETA_MEDIA_URL_REGEX}. Group 1 captures the extension so a
     * media-only message can still be labeled by kind.
     */
    private static final Pattern MEDIA_URL = Pattern.compile(
            "\\s*https?://\\S+\\.(" + MEDIA_EXTS + ")(?:\\?\\S*)?",
            Pattern.CASE_INSENSITIVE);

    /** A {@code nostr:npub…}/{@code nostr:nprofile…} (or bare) mention. */
    private static final Pattern MENTION = Pattern.compile(
            "(?:nostr:)?(npub1|nprofile1)([023456789acdefghjklmnpqrstuvwxyz]+)",
            Pattern.CASE_INSENSITIVE);

    private static final String BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

    private NotificationContent() {}

    /** Strip media URLs, resolve mentions to {@code @name}, and trim. */
    static String clean(String content, MentionResolver resolver) {
        if (content == null || content.isEmpty()) return "";
        String out = MEDIA_URL.matcher(content).replaceAll("");
        out = resolveMentions(out, resolver);
        return out.trim();
    }

    /**
     * Human label for the media a message carries — {@code "an image"},
     * {@code "a GIF"}, {@code "a video"}, {@code "a voice message"} or
     * {@code "a game"} — so a media-only body (empty once {@link #clean}
     * strips the URLs) can read "Sent an image" instead of "Sent a message".
     *
     * The imeta {@code m} MIME wins over the URL extension when given: an
     * encrypted attachment's blob URL carries no media extension at all, and a
     * voice message recorded into {@code .webm}/{@code .mp4} containers is only
     * distinguishable from video by its {@code audio/*} MIME. Null when neither
     * the MIME nor any URL in the content names a media kind.
     */
    static String mediaLabel(String imetaMime, String content) {
        String byMime = labelForMime(imetaMime);
        if (byMime != null) return byMime;
        if (content == null || content.isEmpty()) return null;
        Matcher m = MEDIA_URL.matcher(content);
        if (!m.find()) return null;
        return labelForExt(m.group(1).toLowerCase(Locale.ROOT));
    }

    private static String labelForMime(String mime) {
        if (mime == null) return null;
        mime = mime.toLowerCase(Locale.ROOT);
        if (mime.equals("image/gif")) return "a GIF";
        if (mime.startsWith("image/")) return "an image";
        if (mime.startsWith("video/")) return "a video";
        if (mime.startsWith("audio/")) return "a voice message";
        if (mime.equals("application/x-webxdc")) return "a game";
        return null;
    }

    private static String labelForExt(String ext) {
        if (ext.equals("gif")) return "a GIF";
        if (extIn(IMAGE_EXTS, ext)) return "an image";
        if (extIn(VIDEO_EXTS, ext)) return "a video";
        if (extIn(AUDIO_EXTS, ext)) return "a voice message";
        if (ext.equals("xdc")) return "a game";
        return null;
    }

    /** Whether {@code ext} is one of the {@code |}-separated alternatives. */
    private static boolean extIn(String alternation, String ext) {
        return ("|" + alternation + "|").contains("|" + ext + "|");
    }

    private static String resolveMentions(String s, MentionResolver resolver) {
        Matcher m = MENTION.matcher(s);
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            String bech = (m.group(1) + m.group(2)).toLowerCase(Locale.ROOT);
            String pubkey = pubkeyHex(bech);
            String name = (pubkey != null && resolver != null) ? resolver.nameFor(pubkey) : null;
            String repl = (name != null && !name.isEmpty()) ? "@" + name : m.group();
            m.appendReplacement(sb, Matcher.quoteReplacement(repl));
        }
        m.appendTail(sb);
        return sb.toString();
    }

    /**
     * Decode an {@code npub1…} or {@code nprofile1…} bech32 string to a 32-byte
     * hex pubkey, or null if it isn't a valid, checksummed reference to one.
     */
    static String pubkeyHex(String bech) {
        if (bech == null) return null;
        int sep = bech.lastIndexOf('1');
        if (sep < 1) return null;
        String hrp = bech.substring(0, sep);
        byte[] payload = bech32Payload(bech, hrp, sep);
        if (payload == null) return null;
        if (hrp.equals("npub")) {
            return payload.length == 32 ? hex(payload) : null;
        }
        if (hrp.equals("nprofile")) {
            // NIP-19 TLV: type 0 is the 32-byte pubkey (required, first).
            int i = 0;
            while (i + 2 <= payload.length) {
                int type = payload[i] & 0xff;
                int len = payload[i + 1] & 0xff;
                if (i + 2 + len > payload.length) break;
                if (type == 0 && len == 32) {
                    byte[] pk = new byte[32];
                    System.arraycopy(payload, i + 2, pk, 0, 32);
                    return hex(pk);
                }
                i += 2 + len;
            }
        }
        return null;
    }

    /**
     * Verify the bech32 checksum for {@code hrp} and return the data section
     * converted from 5-bit groups to 8-bit bytes, or null on any malformation.
     */
    private static byte[] bech32Payload(String bech, String hrp, int sep) {
        int dataLen = bech.length() - sep - 1;
        if (dataLen < 6) return null; // must hold at least the 6-char checksum
        int[] values = new int[dataLen];
        for (int i = 0; i < dataLen; i++) {
            int v = BECH32_CHARSET.indexOf(bech.charAt(sep + 1 + i));
            if (v < 0) return null; // non-bech32 char
            values[i] = v;
        }
        if (!checksumOk(hrp, values)) return null;
        return convertBits(values, values.length - 6); // drop the 6-char checksum
    }

    private static boolean checksumOk(String hrp, int[] values) {
        int[] expanded = new int[hrp.length() * 2 + 1 + values.length];
        int p = 0;
        for (int i = 0; i < hrp.length(); i++) expanded[p++] = hrp.charAt(i) >>> 5;
        expanded[p++] = 0;
        for (int i = 0; i < hrp.length(); i++) expanded[p++] = hrp.charAt(i) & 31;
        for (int v : values) expanded[p++] = v;
        return polymod(expanded) == 1; // bech32 (not bech32m) constant
    }

    private static int polymod(int[] values) {
        final int[] gen = {0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3};
        int chk = 1;
        for (int v : values) {
            int top = chk >>> 25;
            chk = ((chk & 0x1ffffff) << 5) ^ v;
            for (int i = 0; i < 5; i++) {
                if (((top >>> i) & 1) != 0) chk ^= gen[i];
            }
        }
        return chk;
    }

    /** Convert {@code count} 5-bit groups to 8-bit bytes; null on bad padding. */
    private static byte[] convertBits(int[] data, int count) {
        int acc = 0, bits = 0;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (int i = 0; i < count; i++) {
            acc = (acc << 5) | data[i];
            bits += 5;
            while (bits >= 8) {
                bits -= 8;
                out.write((acc >>> bits) & 0xff);
            }
        }
        // Leftover bits must be zero padding fewer than 5 bits wide.
        if (bits >= 5 || ((acc << (8 - bits)) & 0xff) != 0) return null;
        return out.toByteArray();
    }

    private static String hex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(Character.forDigit((b >> 4) & 0xf, 16));
            sb.append(Character.forDigit(b & 0xf, 16));
        }
        return sb.toString();
    }
}
