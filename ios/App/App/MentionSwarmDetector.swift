import Foundation

// MARK: - MentionSwarmDetector

/// Mention-swarm detection for a notification inbox — a Swift port of the web
/// client's `src/lib/mentionSwarm.ts` (and Android's `MentionSwarmDetector.java`),
/// and a sibling of `FloodDetector` rather than a replacement for it. See that
/// TypeScript file for the full rationale; the rules and constants here mirror
/// it exactly.
///
/// The two detectors answer the same question about opposite campaigns.
/// `FloodDetector` (reply flood) reads CONTENT — one pitch echoed across a
/// crowd. This reads the ENVELOPE — a burst of one-shot strangers all naming
/// the same co-victims, which is the shape a mad-libs generator uses to defeat
/// content clustering (unique message every time, so no two copies resemble
/// each other). The caller unions the two verdicts.
///
/// A DISPLAY heuristic, not a moderation boundary. The same two invariants
/// hold: never flag the reading user's own event, never flag an event from
/// someone they follow. Both are enforced by excluding those events from the
/// batch UP FRONT, so a follow joining a conversation can neither be folded nor
/// count toward a swarm forming.
///
/// Pure and batch-local: it reads only the events passed in.
enum MentionSwarmDetector {

    // MARK: - Tunables (mirror mentionSwarm.ts)

    /// Distinct pubkeys a cohort must span before it reads as a swarm.
    static let swarmMinAuthors = 5
    /// Ratio of distinct authors to events a cohort must hold. At 1.0 every
    /// author posted exactly once — a crowd of burner keys. A conversation
    /// among a few people repeating themselves sits far below this.
    static let swarmMinOneShot = 0.8
    /// Seconds of mean inter-arrival, at or under which a cohort reads as a
    /// burst rather than a discussion. Deliberately far tighter than any human
    /// cohort observed (real group threads unfold over minutes to hours).
    static let swarmMaxMeanGap = 10.0
    /// Most co-tagged pubkeys read from one event. A note blasting hundreds of
    /// `p` tags would otherwise join hundreds of groups. Purely a work bound:
    /// the subset is chosen by sorted order rather than tag order, so it is
    /// stable across copies of the same victim list.
    private static let maxCohortTags = 32

    // MARK: - Input

    /// One event for the detector: just the fields the rules read.
    struct Event {
        let id: String
        let pubkey: String
        let createdAt: Int
        /// Every `p` tag value, including the reader (filtered out here).
        let pTags: [String]
    }

    // MARK: - Internal types

    /// One co-tagged victim and every candidate notification naming them.
    private final class Cohort {
        var ids: [String] = []
        var authors: Set<String> = []
        var times: [Int] = []
    }

    /// The co-tagged pubkeys of one event, deduped, minus the reader, bounded.
    private static func cohortKeys(_ event: Event, _ selfPubkey: String?) -> [String] {
        var keys = Set<String>()
        for value in event.pTags {
            if value.isEmpty || value == selfPubkey { continue }
            keys.insert(value)
        }
        if keys.count <= maxCohortTags { return Array(keys) }
        return Array(keys.sorted().prefix(maxCohortTags))
    }

    /// Mean seconds between arrivals in a cohort. Infinity for a single event.
    private static func meanGap(_ times: [Int]) -> Double {
        if times.count < 2 { return .infinity }
        let sorted = times.sorted()
        return Double(sorted[sorted.count - 1] - sorted[0]) / Double(sorted.count - 1)
    }

    // MARK: - Detection

    /// The ids of notifications belonging to a mention swarm. `selfPubkey` and
    /// `follows` may be nil / empty.
    static func swarmIds(_ events: [Event], selfPubkey: String?, follows: Set<String>?) -> Set<String> {
        var flagged = Set<String>()
        if events.count < swarmMinAuthors { return flagged }

        var cohorts = [String: Cohort]()
        for event in events {
            // Trust exemption, applied FIRST so a follow (or the reader) can
            // neither be folded nor push a cohort over the author bar.
            if event.pubkey == selfPubkey || (follows?.contains(event.pubkey) ?? false) {
                continue
            }

            for key in cohortKeys(event, selfPubkey) {
                let cohort: Cohort
                if let existing = cohorts[key] {
                    cohort = existing
                } else {
                    cohort = Cohort()
                    cohorts[key] = cohort
                }
                cohort.ids.append(event.id)
                cohort.authors.insert(event.pubkey)
                cohort.times.append(event.createdAt)
            }
        }

        for cohort in cohorts.values {
            if cohort.authors.count < swarmMinAuthors { continue }
            if Double(cohort.authors.count) / Double(cohort.ids.count) < swarmMinOneShot { continue }
            if meanGap(cohort.times) > swarmMaxMeanGap { continue }
            flagged.formUnion(cohort.ids)
        }

        return flagged
    }
}
