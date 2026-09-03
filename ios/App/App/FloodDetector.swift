import Foundation

// MARK: - FloodDetector

/// Reply-flood detection for notification events — a Swift port of the web
/// client's `src/lib/replyFlood.ts` (and Android's `FloodDetector.java`). See
/// that file for the full rationale; the rules and constants here mirror it
/// exactly so a spam wall the web UI folds out of a thread is the same wall
/// this suppresses from iOS notifications.
///
/// A DISPLAY heuristic, not a moderation boundary. It never blocks a write or
/// feeds a report — it only decides which events belong to a visual flood and
/// should be suppressed. Two invariants the caller relies on:
///
///  1. Never flag the reading user's own event (`selfPubkey`).
///  2. Never flag an event from someone the reader follows (`follows`).
///
/// Both exemptions are applied LAST, so they override every rule at once.
///
/// What survives from the port:
///  - ECHO: one near-duplicate template posted across `echoMinAuthors`+ pubkeys.
///  - DENSITY: one pubkey repeating the same template `densityMin`+ times.
///  - A CONTAINMENT sweep that only WIDENS an already-confirmed flood.
///
/// The caller feeds a batch (a poll cycle's worth of events) so the crowd
/// needed by ECHO/DENSITY is visible. Pure and batch-local: it reads only the
/// events passed in.
enum FloodDetector {

    // MARK: - Tunables (mirror replyFlood.ts)

    /// Distinct pubkeys one template must span before it reads as a campaign.
    static let echoMinAuthors = 3
    /// Copies of one template (across any authors) before the echo rule fires.
    static let echoMinCopies = 3
    /// Copies of one template from a SINGLE pubkey before the density rule fires.
    static let densityMin = 4
    /// Words a template needs before either rule will judge it.
    static let minWords = 4
    /// The lower word bar for a template that carries a link.
    static let minWordsLinked = 3
    /// Token overlap (Jaccard) at which two templates are treated as one campaign.
    static let similarityThreshold = 0.6
    /// Overlap coefficient at which a still-visible template is swept into a confirmed campaign.
    static let containmentThreshold = 0.8
    /// Words the SMALLER of two templates needs before the containment sweep will judge them.
    static let containmentMinWords = 6
    /// Document frequency above which a word is skipped when generating merge candidates.
    static let dfCap = 64
    /// Most candidate templates one template is compared against.
    static let candidateCap = 48

    // MARK: - Regex (compiled once)

    private static let urlRun = try! NSRegularExpression(pattern: "https?://\\S+")
    private static let trailingNonce = try! NSRegularExpression(pattern: "([>!])\\s*[a-z0-9]{4,9}$")
    private static let digitToken = try! NSRegularExpression(pattern: "[\\p{L}\\p{N}]*\\p{N}[\\p{L}\\p{N}]*")
    /// Three-plus of one letter: elongation (nooo), laughter (kkkk), mash (ggggg).
    private static let letterRun = try! NSRegularExpression(pattern: "(\\p{L})\\1{2,}")
    private static let invisible = try! NSRegularExpression(pattern: "[\\x{200b}-\\x{200f}\\x{2060}\\x{feff}]")
    private static let whitespace = try! NSRegularExpression(pattern: "\\s+")
    /// Words, in any script. Emoji and punctuation are deliberately not words.
    private static let word = try! NSRegularExpression(pattern: "[\\p{L}][\\p{L}\\p{N}_]*")

    // MARK: - Input

    /// One event for the detector: just the fields the rules read.
    struct Event {
        let id: String
        let pubkey: String
        let content: String
    }

    // MARK: - Internal types

    /// One template and every event that shares it.
    private final class Bucket {
        let words: Set<String>
        let wordCount: Int
        let linked: Bool
        var ids: [String] = []
        var authors: Set<String> = []

        init(words: Set<String>, wordCount: Int, linked: Bool) {
            self.words = words
            self.wordCount = wordCount
            self.linked = linked
        }
    }

    private final class Campaign {
        var ids: [String] = []
        var authors: Set<String> = []
        var eligible = false
    }

    // MARK: - Regex helpers

    private static func replaceAll(_ regex: NSRegularExpression, in s: String, with template: String) -> String {
        let range = NSRange(s.startIndex..<s.endIndex, in: s)
        return regex.stringByReplacingMatches(in: s, range: range, withTemplate: template)
    }

    /// A template fingerprint: what two copies of one broadcast share once the
    /// parts that vary per copy (URLs, digits, a trailing nonce, held-down keys)
    /// are collapsed.
    static func shapeKey(_ content: String) -> String {
        var s = content.lowercased()
        s = replaceAll(invisible, in: s, with: "")
        s = replaceAll(whitespace, in: s, with: " ").trimmingCharacters(in: .whitespaces)
        s = replaceAll(urlRun, in: s, with: "@")
        s = replaceAll(trailingNonce, in: s, with: "$1#")
        s = replaceAll(digitToken, in: s, with: "#")
        // A letter run is one keypress held down: `ggg` and `gggggg` are the same
        // message, and `noooo` is `no`. Two is a word (`gg`), three is a run.
        s = replaceAll(letterRun, in: s, with: "$1")
        s = replaceAll(whitespace, in: s, with: " ").trimmingCharacters(in: .whitespaces)
        return s
    }

    /// The words of a template, for the similarity measure and the length gate.
    static func normalizeTokens(_ shape: String) -> [String] {
        let range = NSRange(shape.startIndex..<shape.endIndex, in: shape)
        var words: [String] = []
        word.enumerateMatches(in: shape, range: range) { match, _, _ in
            if let match, let r = Range(match.range, in: shape) {
                words.append(String(shape[r]))
            }
        }
        return words
    }

    private static func eligible(_ wordCount: Int, _ linked: Bool) -> Bool {
        wordCount >= (linked ? minWordsLinked : minWords)
    }

    /// Jaccard overlap of two token sets.
    private static func similarity(_ a: Set<String>, _ b: Set<String>) -> Double {
        var shared = 0
        for w in a where b.contains(w) { shared += 1 }
        return Double(shared) / Double(a.count + b.count - shared)
    }

    /// Overlap coefficient: shared words over the SMALLER set.
    private static func containment(_ a: Set<String>, _ b: Set<String>) -> Double {
        let small = a.count <= b.count ? a : b
        let big = a.count <= b.count ? b : a
        if small.isEmpty { return 0 }
        var shared = 0
        for w in small where big.contains(w) { shared += 1 }
        return Double(shared) / Double(small.count)
    }

    // MARK: - Union-find

    private static func find(_ parent: inout [Int], _ i: Int) -> Int {
        var i = i
        while parent[i] != i {
            parent[i] = parent[parent[i]]
            i = parent[i]
        }
        return i
    }

    private static func union(_ parent: inout [Int], _ i: Int, _ j: Int) {
        let ri = find(&parent, i)
        let rj = find(&parent, j)
        if ri != rj { parent[max(ri, rj)] = min(ri, rj) }
    }

    // MARK: - Detection

    /// The ids of events belonging to a visual flood. `selfPubkey` and
    /// `follows` may be nil / empty.
    static func floodIds(_ replies: [Event], selfPubkey: String?, follows: Set<String>?) -> Set<String> {
        var flagged = Set<String>()
        if replies.count < echoMinCopies { return flagged }

        // Bucket by exact normalized shape. A reply with no words joins no bucket.
        var byShape = [String: Bucket]()
        var shapeOrder: [String] = []
        for ev in replies {
            let shape = shapeKey(ev.content)
            if shape.isEmpty { continue }
            let words = normalizeTokens(shape)
            if words.isEmpty { continue }
            let bucket: Bucket
            if let existing = byShape[shape] {
                bucket = existing
            } else {
                bucket = Bucket(words: Set(words), wordCount: words.count, linked: shape.contains("@"))
                byShape[shape] = bucket
                shapeOrder.append(shape)
            }
            bucket.ids.append(ev.id)
            bucket.authors.insert(ev.pubkey)
        }

        let buckets = shapeOrder.map { byShape[$0]! }
        let n = buckets.count

        // Merge near-duplicate templates into campaigns via union-find.
        var parent = Array(0..<n)

        var elig: [Int] = []
        for i in 0..<n where eligible(buckets[i].wordCount, buckets[i].linked) {
            elig.append(i)
        }

        if elig.count >= 2 {
            // Document frequency, to drop words too common to narrow anything.
            var df = [String: Int]()
            for i in elig {
                for w in buckets[i].words { df[w, default: 0] += 1 }
            }

            // Inverted word→template index: only templates that share a word
            // are merge candidates.
            var index = [String: [Int]]()
            for i in elig {
                for w in buckets[i].words {
                    if (df[w] ?? 0) > dfCap { continue }
                    index[w, default: []].append(i)
                }
            }

            var count = Array(repeating: 0, count: n)
            var touched: [Int] = []
            for i in elig {
                touched.removeAll(keepingCapacity: true)
                for w in buckets[i].words {
                    guard let list = index[w] else { continue }
                    for j in list {
                        if j >= i { continue } // each pair once
                        if count[j] == 0 { touched.append(j) }
                        count[j] += 1
                    }
                }
                // Above the cap, compare the candidates sharing the MOST words first.
                if touched.count > candidateCap {
                    touched.sort { count[$0] > count[$1] }
                }
                let limit = min(touched.count, candidateCap)
                for k in 0..<limit {
                    let j = touched[k]
                    if find(&parent, i) != find(&parent, j)
                        && similarity(buckets[i].words, buckets[j].words) >= similarityThreshold {
                        union(&parent, i, j)
                    }
                }
                for j in touched { count[j] = 0 }
            }
        }

        // Gather campaigns (union-find roots), merging ids and author sets.
        var campaigns = [Int: Campaign]()
        for b in 0..<n {
            let root = find(&parent, b)
            let c = campaigns[root] ?? Campaign()
            c.ids.append(contentsOf: buckets[b].ids)
            c.authors.formUnion(buckets[b].authors)
            if eligible(buckets[b].wordCount, buckets[b].linked) { c.eligible = true }
            campaigns[root] = c
        }

        for c in campaigns.values {
            if !c.eligible { continue }
            let echo = c.authors.count >= echoMinAuthors && c.ids.count >= echoMinCopies
            let density = c.authors.count == 1 && c.ids.count >= densityMin
            if echo || density { flagged.formUnion(c.ids) }
        }

        // Containment sweep: only WIDENS an already-confirmed flood, never forms one.
        if !flagged.isEmpty {
            var flaggedWords: [Set<String>] = []
            var unflagged: [Int] = []
            for b in 0..<n {
                if buckets[b].ids.isEmpty { continue }
                if flagged.contains(buckets[b].ids[0]) {
                    flaggedWords.append(buckets[b].words)
                } else if buckets[b].wordCount >= containmentMinWords {
                    unflagged.append(b)
                }
            }
            for b in unflagged {
                for fw in flaggedWords {
                    if fw.count < containmentMinWords { continue }
                    if containment(buckets[b].words, fw) >= containmentThreshold {
                        flagged.formUnion(buckets[b].ids)
                        break
                    }
                }
            }
        }

        // Trust exemption, applied LAST so it overrides every rule.
        if !flagged.isEmpty && (selfPubkey != nil || !(follows?.isEmpty ?? true)) {
            for ev in replies {
                if ev.pubkey == selfPubkey || (follows?.contains(ev.pubkey) ?? false) {
                    flagged.remove(ev.id)
                }
            }
        }

        return flagged
    }
}
