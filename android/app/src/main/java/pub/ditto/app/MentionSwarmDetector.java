package pub.ditto.app;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Mention-swarm detection for a notification inbox — a Java port of the web
 * client's {@code src/lib/mentionSwarm.ts}, and a sibling of
 * {@link FloodDetector} rather than a replacement for it. See that TypeScript
 * file for the full rationale; the rules and constants here mirror it exactly.
 *
 * The two detectors answer the same question about opposite campaigns.
 * {@link FloodDetector} (reply flood) reads CONTENT — one pitch echoed across a
 * crowd. This reads the ENVELOPE — a burst of one-shot strangers all naming the
 * same co-victims, which is the shape a mad-libs generator uses to defeat
 * content clustering (unique message every time, so no two copies resemble each
 * other). The caller unions the two verdicts.
 *
 * A DISPLAY heuristic, not a moderation boundary. The same two invariants hold:
 * never flag the reading user's own event, never flag an event from someone they
 * follow. Both are enforced by excluding those events from the batch UP FRONT,
 * so a follow joining a conversation can neither be folded nor count toward a
 * swarm forming.
 *
 * Pure and batch-local: it reads only the events passed in. The caller feeds a
 * rolling window of recent events (live events arrive one at a time, so the
 * crowd and its timing must be reconstructed).
 */
public final class MentionSwarmDetector {

    private MentionSwarmDetector() {}

    /** Distinct pubkeys a cohort must span before it reads as a swarm. */
    public static final int SWARM_MIN_AUTHORS = 5;
    /**
     * Ratio of distinct authors to events a cohort must hold. At 1.0 every
     * author posted exactly once — a crowd of burner keys. A conversation among
     * a few people repeating themselves sits far below this.
     */
    public static final double SWARM_MIN_ONE_SHOT = 0.8;
    /**
     * Seconds of mean inter-arrival, at or under which a cohort reads as a burst
     * rather than a discussion. Deliberately far tighter than any human cohort
     * observed (real group threads unfold over minutes to hours).
     */
    public static final double SWARM_MAX_MEAN_GAP = 10;
    /**
     * Most co-tagged pubkeys read from one event. A note blasting hundreds of
     * {@code p} tags would otherwise join hundreds of groups. Purely a work
     * bound: the subset is chosen by sorted order rather than tag order, so it
     * is stable across copies of the same victim list.
     */
    private static final int MAX_COHORT_TAGS = 32;

    /** One event for the detector: just the fields the rules read. */
    public static final class Event {
        public final String id;
        public final String pubkey;
        public final long createdAt;
        /** Every {@code p} tag value, including the reader (filtered out here). */
        public final List<String> pTags;

        public Event(String id, String pubkey, long createdAt, List<String> pTags) {
            this.id = id;
            this.pubkey = pubkey;
            this.createdAt = createdAt;
            this.pTags = pTags;
        }
    }

    /** One co-tagged victim and every candidate notification naming them. */
    private static final class Cohort {
        final List<String> ids = new ArrayList<>();
        final Set<String> authors = new HashSet<>();
        final List<Long> times = new ArrayList<>();
    }

    /**
     * The co-tagged pubkeys of one event, deduped, minus the reader, bounded.
     */
    private static List<String> cohortKeys(Event event, String self) {
        Set<String> keys = new HashSet<>();
        for (String value : event.pTags) {
            if (value == null || value.isEmpty() || value.equals(self)) continue;
            keys.add(value);
        }
        List<String> list = new ArrayList<>(keys);
        if (list.size() <= MAX_COHORT_TAGS) return list;
        Collections.sort(list);
        return list.subList(0, MAX_COHORT_TAGS);
    }

    /** Mean seconds between arrivals in a cohort. Infinity for a single event. */
    private static double meanGap(List<Long> times) {
        if (times.size() < 2) return Double.POSITIVE_INFINITY;
        List<Long> sorted = new ArrayList<>(times);
        Collections.sort(sorted);
        return (double) (sorted.get(sorted.size() - 1) - sorted.get(0)) / (sorted.size() - 1);
    }

    /**
     * The ids of notifications belonging to a mention swarm. {@code self} and
     * {@code follows} may be null.
     */
    public static Set<String> swarmIds(List<Event> events, String self, Set<String> follows) {
        Set<String> flagged = new HashSet<>();
        if (events.size() < SWARM_MIN_AUTHORS) return flagged;

        Map<String, Cohort> cohorts = new LinkedHashMap<>();
        for (Event event : events) {
            // Trust exemption, applied FIRST so a follow (or the reader) can
            // neither be folded nor push a cohort over the author bar.
            if (event.pubkey.equals(self) || (follows != null && follows.contains(event.pubkey))) {
                continue;
            }

            for (String key : cohortKeys(event, self)) {
                Cohort cohort = cohorts.get(key);
                if (cohort == null) {
                    cohort = new Cohort();
                    cohorts.put(key, cohort);
                }
                cohort.ids.add(event.id);
                cohort.authors.add(event.pubkey);
                cohort.times.add(event.createdAt);
            }
        }

        for (Cohort cohort : cohorts.values()) {
            if (cohort.authors.size() < SWARM_MIN_AUTHORS) continue;
            if ((double) cohort.authors.size() / cohort.ids.size() < SWARM_MIN_ONE_SHOT) continue;
            if (meanGap(cohort.times) > SWARM_MAX_MEAN_GAP) continue;
            flagged.addAll(cohort.ids);
        }

        return flagged;
    }
}
