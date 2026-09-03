package pub.ditto.app;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reply-flood detection for notification events — a Java port of the web
 * client's {@code src/lib/replyFlood.ts}. See that file for the full rationale;
 * the rules and constants here mirror it exactly so a spam wall the web UI folds
 * out of a thread is the same wall this suppresses from Android notifications.
 *
 * A DISPLAY heuristic, not a moderation boundary. It never blocks a write or
 * feeds a report — it only decides which notification events belong to a visual
 * flood and should be suppressed. The two invariants the caller relies on:
 *
 *  1. Never flag the reading user's own event ({@code self}).
 *  2. Never flag an event from someone the reader follows ({@code follows}).
 *
 * Both exemptions are applied LAST, so they override every rule at once.
 *
 * What survives from the port:
 *  - ECHO: one near-duplicate template posted across {@link #ECHO_MIN_AUTHORS}+
 *    distinct pubkeys.
 *  - DENSITY: one pubkey repeating the same template {@link #DENSITY_MIN}+ times.
 *  - SALAD: a crowd of throwaway pubkeys each posting a uniquely-shaped word
 *    salad drawn from one shared vocabulary pool — the campaign that defeats
 *    shape clustering on purpose. Keys off the crowd (many authors, one shared
 *    word pool), not shape.
 *  - A CONTAINMENT sweep that only WIDENS an already-confirmed flood.
 *
 * Because notifications arrive one at a time on the live socket, the caller
 * feeds a rolling window of recent events (not just the current one) so the
 * crowd needed by ECHO/DENSITY is visible. Pure and batch-local: it reads only
 * the events passed in.
 */
public final class FloodDetector {

    private FloodDetector() {}

    /** Distinct pubkeys one template must span before it reads as a campaign. */
    public static final int ECHO_MIN_AUTHORS = 3;
    /** Copies of one template (across any authors) before the echo rule fires. */
    public static final int ECHO_MIN_COPIES = 3;
    /** Copies of one template from a SINGLE pubkey before the density rule fires. */
    public static final int DENSITY_MIN = 4;
    /** Words a template needs before either rule will judge it. */
    public static final int MIN_WORDS = 4;
    /** The lower word bar for a template that carries a link. */
    public static final int MIN_WORDS_LINKED = 3;
    /** Token overlap (Jaccard) at which two templates are treated as one campaign. */
    public static final double SIMILARITY = 0.6;
    /** Overlap coefficient at which a still-visible template is swept into a confirmed campaign. */
    public static final double CONTAINMENT = 0.8;
    /** Words the SMALLER of two templates needs before the containment sweep will judge them. */
    public static final int CONTAINMENT_MIN_WORDS = 6;
    /** Distinct authors a shared word pool must span before SALAD reads as a campaign. */
    public static final int SALAD_MIN_AUTHORS = 5;
    /** Distinct words a reply needs before SALAD will judge it. */
    public static final int SALAD_MIN_WORDS = 6;
    /** Document frequency (over the distinct-author corpus) at/above which a word is "pool". */
    public static final int SALAD_POOL_DF = 3;
    /** Fraction of a reply's distinct words that must be pool words to read as salad. */
    public static final double SALAD_POOL_FRACTION = 0.6;
    /** Document frequency above which a word is skipped when generating merge candidates. */
    private static final int DF_CAP = 64;
    /** Most candidate templates one template is compared against. */
    private static final int CANDIDATE_CAP = 48;

    private static final Pattern URL_RUN = Pattern.compile("https?://\\S+");
    private static final Pattern TRAILING_NONCE = Pattern.compile("([>!])\\s*[a-z0-9]{4,9}$");
    // Note: `\p{L}`/`\p{N}` are already Unicode general-category properties in
    // Java, so no UNICODE_CHARACTER_CLASS flag is needed (and Android's regex
    // engine throws IllegalArgumentException if that flag is passed).
    private static final Pattern DIGIT_TOKEN =
            Pattern.compile("[\\p{L}\\p{N}]*\\p{N}[\\p{L}\\p{N}]*");
    /** Three-plus of one letter: elongation (nooo), laughter (kkkk), mash (ggggg). */
    private static final Pattern LETTER_RUN =
            Pattern.compile("(\\p{L})\\1{2,}");
    private static final Pattern INVISIBLE =
            Pattern.compile("[\\u200b-\\u200f\\u2060\\ufeff]");
    private static final Pattern WHITESPACE = Pattern.compile("\\s+");
    /** Words, in any script. Emoji and punctuation are deliberately not words. */
    private static final Pattern WORD =
            Pattern.compile("[\\p{L}][\\p{L}\\p{N}_]*");

    /** One event for the detector: just the fields the rules read. */
    public static final class Event {
        public final String id;
        public final String pubkey;
        public final String content;

        public Event(String id, String pubkey, String content) {
            this.id = id;
            this.pubkey = pubkey;
            this.content = content;
        }
    }

    /**
     * A template fingerprint: what two copies of one broadcast share once the
     * parts that vary per copy (URLs, digits, a trailing nonce, held-down keys)
     * are collapsed.
     */
    public static String shapeKey(String content) {
        String s = content.toLowerCase(Locale.ROOT);
        s = INVISIBLE.matcher(s).replaceAll("");
        s = WHITESPACE.matcher(s).replaceAll(" ").trim();
        s = URL_RUN.matcher(s).replaceAll("@");
        s = TRAILING_NONCE.matcher(s).replaceAll("$1#");
        s = DIGIT_TOKEN.matcher(s).replaceAll("#");
        // A letter run is one keypress held down: `ggg` and `gggggg` are the same
        // message, and `noooo` is `no`. Two is a word (`gg`), three is a run.
        s = LETTER_RUN.matcher(s).replaceAll("$1");
        s = WHITESPACE.matcher(s).replaceAll(" ").trim();
        return s;
    }

    /** The words of a template, for the similarity measure and the length gate. */
    public static List<String> normalizeTokens(String shape) {
        List<String> words = new ArrayList<>();
        Matcher m = WORD.matcher(shape);
        while (m.find()) words.add(m.group());
        return words;
    }

    /** One template and every event that shares it. */
    private static final class Bucket {
        final Set<String> words;
        final int wordCount;
        final boolean linked;
        final List<String> ids = new ArrayList<>();
        final Set<String> authors = new HashSet<>();

        Bucket(Set<String> words, int wordCount, boolean linked) {
            this.words = words;
            this.wordCount = wordCount;
            this.linked = linked;
        }
    }

    private static boolean eligible(int wordCount, boolean linked) {
        return wordCount >= (linked ? MIN_WORDS_LINKED : MIN_WORDS);
    }

    /** Jaccard overlap of two token sets. */
    private static double similarity(Set<String> a, Set<String> b) {
        int shared = 0;
        for (String w : a) if (b.contains(w)) shared++;
        return (double) shared / (a.size() + b.size() - shared);
    }

    /** Overlap coefficient: shared words over the SMALLER set. */
    private static double containment(Set<String> a, Set<String> b) {
        Set<String> small = a.size() <= b.size() ? a : b;
        Set<String> big = a.size() <= b.size() ? b : a;
        if (small.isEmpty()) return 0;
        int shared = 0;
        for (String w : small) if (big.contains(w)) shared++;
        return (double) shared / small.size();
    }

    /**
     * The ids of events belonging to a visual flood. {@code self} and
     * {@code follows} may be null.
     */
    public static Set<String> floodIds(List<Event> replies, String self, Set<String> follows) {
        Set<String> flagged = new HashSet<>();
        if (replies.size() < ECHO_MIN_COPIES) return flagged;

        // Bucket by exact normalized shape. A reply with no words joins no bucket.
        Map<String, Bucket> byShape = new LinkedHashMap<>();
        for (Event ev : replies) {
            String shape = shapeKey(ev.content);
            if (shape.isEmpty()) continue;
            List<String> words = normalizeTokens(shape);
            if (words.isEmpty()) continue;
            Bucket bucket = byShape.get(shape);
            if (bucket == null) {
                bucket = new Bucket(new HashSet<>(words), words.size(), shape.indexOf('@') >= 0);
                byShape.put(shape, bucket);
            }
            bucket.ids.add(ev.id);
            bucket.authors.add(ev.pubkey);
        }

        List<Bucket> buckets = new ArrayList<>(byShape.values());
        int n = buckets.size();

        // Merge near-duplicate templates into campaigns via union-find.
        int[] parent = new int[n];
        for (int i = 0; i < n; i++) parent[i] = i;

        List<Integer> elig = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            if (eligible(buckets.get(i).wordCount, buckets.get(i).linked)) elig.add(i);
        }

        if (elig.size() >= 2) {
            // Document frequency, to drop words too common to narrow anything.
            Map<String, Integer> df = new HashMap<>();
            for (int i : elig) {
                for (String w : buckets.get(i).words) {
                    df.merge(w, 1, Integer::sum);
                }
            }

            // Inverted word→template index: only templates that share a word
            // are merge candidates.
            Map<String, List<Integer>> index = new HashMap<>();
            for (int i : elig) {
                for (String w : buckets.get(i).words) {
                    if (df.getOrDefault(w, 0) > DF_CAP) continue;
                    index.computeIfAbsent(w, k -> new ArrayList<>()).add(i);
                }
            }

            int[] count = new int[n];
            List<Integer> touched = new ArrayList<>();
            for (int i : elig) {
                touched.clear();
                for (String w : buckets.get(i).words) {
                    List<Integer> list = index.get(w);
                    if (list == null) continue;
                    for (int j : list) {
                        if (j >= i) continue; // each pair once
                        if (count[j] == 0) touched.add(j);
                        count[j]++;
                    }
                }
                // Above the cap, compare the candidates sharing the MOST words first.
                if (touched.size() > CANDIDATE_CAP) {
                    touched.sort((a, b) -> count[b] - count[a]);
                }
                int limit = Math.min(touched.size(), CANDIDATE_CAP);
                for (int k = 0; k < limit; k++) {
                    int j = touched.get(k);
                    if (find(parent, i) != find(parent, j)
                            && similarity(buckets.get(i).words, buckets.get(j).words) >= SIMILARITY) {
                        union(parent, i, j);
                    }
                }
                for (int j : touched) count[j] = 0;
            }
        }

        // Gather campaigns (union-find roots), merging ids and author sets.
        Map<Integer, Campaign> campaigns = new HashMap<>();
        for (int b = 0; b < n; b++) {
            int root = find(parent, b);
            Campaign c = campaigns.get(root);
            if (c == null) {
                c = new Campaign();
                campaigns.put(root, c);
            }
            c.ids.addAll(buckets.get(b).ids);
            c.authors.addAll(buckets.get(b).authors);
            if (eligible(buckets.get(b).wordCount, buckets.get(b).linked)) c.eligible = true;
        }

        for (Campaign c : campaigns.values()) {
            if (!c.eligible) continue;
            boolean echo = c.authors.size() >= ECHO_MIN_AUTHORS && c.ids.size() >= ECHO_MIN_COPIES;
            boolean density = c.authors.size() == 1 && c.ids.size() >= DENSITY_MIN;
            if (echo || density) flagged.addAll(c.ids);
        }

        // SALAD: a crowd of throwaway pubkeys each posting a uniquely-shaped word
        // salad drawn from one shared vocabulary pool. Shape-based ECHO/DENSITY
        // are blind to it, so this reads the crowd instead: build a corpus of
        // substantial replies (one per pubkey), take the pool to be the words
        // recurring across SALAD_POOL_DF+ distinct authors, and flag replies
        // mostly built from that pool — but only when they span a big enough crowd.
        Map<String, Set<String>> perAuthor = new HashMap<>();
        for (Event ev : replies) {
            if (perAuthor.containsKey(ev.pubkey)) continue;
            List<String> words = normalizeTokens(shapeKey(ev.content));
            if (words.size() < SALAD_MIN_WORDS) continue;
            perAuthor.put(ev.pubkey, new HashSet<>(words));
        }
        if (perAuthor.size() >= SALAD_MIN_AUTHORS) {
            Map<String, Integer> poolDf = new HashMap<>();
            for (Set<String> set : perAuthor.values()) {
                for (String w : set) poolDf.merge(w, 1, Integer::sum);
            }
            List<String> memberIds = new ArrayList<>();
            Set<String> memberAuthors = new HashSet<>();
            for (Event ev : replies) {
                List<String> words = normalizeTokens(shapeKey(ev.content));
                if (words.size() < SALAD_MIN_WORDS) continue;
                Set<String> distinct = new HashSet<>(words);
                int pool = 0;
                for (String w : distinct) {
                    if (poolDf.getOrDefault(w, 0) >= SALAD_POOL_DF) pool++;
                }
                if ((double) pool / distinct.size() >= SALAD_POOL_FRACTION) {
                    memberIds.add(ev.id);
                    memberAuthors.add(ev.pubkey);
                }
            }
            if (memberAuthors.size() >= SALAD_MIN_AUTHORS) {
                flagged.addAll(memberIds);
            }
        }

        // Containment sweep: only WIDENS an already-confirmed flood, never forms one.
        if (!flagged.isEmpty()) {
            List<Set<String>> flaggedWords = new ArrayList<>();
            List<Integer> unflagged = new ArrayList<>();
            for (int b = 0; b < n; b++) {
                if (buckets.get(b).ids.isEmpty()) continue;
                if (flagged.contains(buckets.get(b).ids.get(0))) {
                    flaggedWords.add(buckets.get(b).words);
                } else if (buckets.get(b).wordCount >= CONTAINMENT_MIN_WORDS) {
                    unflagged.add(b);
                }
            }
            for (int b : unflagged) {
                for (Set<String> fw : flaggedWords) {
                    if (fw.size() < CONTAINMENT_MIN_WORDS) continue;
                    if (containment(buckets.get(b).words, fw) >= CONTAINMENT) {
                        flagged.addAll(buckets.get(b).ids);
                        break;
                    }
                }
            }
        }

        // Trust exemption, applied LAST so it overrides every rule.
        if (!flagged.isEmpty() && (self != null || (follows != null && !follows.isEmpty()))) {
            for (Event ev : replies) {
                if (ev.pubkey.equals(self) || (follows != null && follows.contains(ev.pubkey))) {
                    flagged.remove(ev.id);
                }
            }
        }

        return flagged;
    }

    private static final class Campaign {
        final List<String> ids = new ArrayList<>();
        final Set<String> authors = new HashSet<>();
        boolean eligible = false;
    }

    private static int find(int[] parent, int i) {
        while (parent[i] != i) {
            parent[i] = parent[parent[i]];
            i = parent[i];
        }
        return i;
    }

    private static void union(int[] parent, int i, int j) {
        int ri = find(parent, i);
        int rj = find(parent, j);
        if (ri != rj) parent[Math.max(ri, rj)] = Math.min(ri, rj);
    }
}
