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
///  - SALAD: a crowd of throwaway pubkeys each posting a uniquely-shaped word
///    salad drawn from one shared vocabulary pool — the campaign that defeats
///    shape clustering on purpose. Keys off the crowd (many authors, one shared
///    word pool), not shape.
///  - PITCH: a single giveaway-phishing event — a link plus a lure word and an
///    ask.
///  - DISGUISE: a single linked event with `disguiseMinWords`+ words that mix
///    Latin letters with Cyrillic, Greek, Armenian or Cherokee look-alikes.
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
    /// Distinct authors a shared word pool must span before SALAD reads as a campaign.
    static let saladMinAuthors = 5
    /// Distinct words a reply needs before SALAD will judge it.
    static let saladMinWords = 6
    /// Document frequency (over the distinct-author corpus) at/above which a word is "pool".
    static let saladPoolDf = 3
    /// Fraction of a reply's distinct content words that must be pool words to read as salad.
    static let saladPoolFraction = 0.6
    /// Distinct non-function words a reply needs before SALAD will judge it.
    static let saladMinContentWords = 4
    /// Mixed-script words a linked event needs before DISGUISE reads it as disguised.
    static let disguiseMinWords = 2
    /// PITCH rule — words that name the bait of a giveaway-phishing event.
    static let pitchLures: Set<String> = ["airdrop", "airdrops", "giveaway", "giveaways", "presale"]
    /// PITCH rule — words that ask the reader to act on the bait.
    static let pitchAsks: Set<String> = ["claim", "claiming", "claimable", "eligibility", "eligible", "wallet"]
    /// Function words SALAD sets aside — English, Spanish, Portuguese, German,
    /// French. Mirrors `STOPWORDS` in replyFlood.ts.
    static let stopwords: Set<String> = Set("""
        a about above after again against all also am an and any are as at be because been before being below between
        both but by can could d did do does doing don down during each even every few for from further get got go going
        had has have having he her here hers him his how i if in into is it its just know like ll m may me might mine more
        most must my no not now of off ok on once one only onto or other our out over own re really s same see shall she
        should so some still such t than that the their them then there these they think this those through to too under
        until up us ve very was way we well were what when where which while who whom whose why will with would yeah yes
        you your
        al algo algunas algunos ante antes como con contra cual cuando de del desde donde durante el ella ellos en entre
        era es esa eso esta estar estas este esto estos hay hasta la las le les lo los mi mis mucho muchos muy más nada
        ni no nos nosotros o otra otras otro otros para pero poco por porque que quien quienes qué se sin sobre su sus sí
        también tanto te ti todo todos tu tus tú un una uno unos y ya yo él
        ao aos as da das dele deles depois do dos ela elas ele eles em essa essas esse esses está estão eu foi foram há
        isso já lhe mas meu meus minha minhas mesmo na nas nem no nossa nosso num numa não nós os ou pela pelas pelo
        pelos quando seja ser seu seus sua suas são tem tenho ter teu tua têm você vocês à às é
        aber am an auch auf aus bei bin bis da das dass dem den der des dich die dir du durch ein eine einem einen einer
        er es für hat ich ihr im ist ja man mehr mich mir mit nach nicht noch nur oder sich sie sind so um und von vor
        war was wenn werden wie wir wird zu zum zur über
        au aux avec c ce ces cet cette dans des du elle elles et il ils j je l les leur leurs ma mais me mes mon n ne
        nous on ou par pas plus pour qu qui sa ses son sur ta tes toi ton une vous où
        """.split(whereSeparator: { $0 == " " || $0 == "\n" }).map(String.init))
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

    // MARK: - Mixed-script look-alikes

    /// Latin look-alikes as (look-alike, Latin) pairs, in Cyrillic, Greek,
    /// Armenian, and Cherokee order. Mirrors replyFlood.ts.
    private static let confusablePairs = """
        \u{0410}A\u{0412}B\u{0415}E\u{0405}S\u{0406}I\u{0408}J\u{041A}K\u{041C}M\u{041D}H\u{041E}O
        \u{0420}P\u{0421}C\u{0422}T\u{0425}X\u{0423}Y\u{04AE}Y\u{051A}Q\u{051C}W\u{0500}D\u{0430}a
        \u{0432}b\u{0435}e\u{0455}s\u{0456}i\u{0458}j\u{043A}k\u{043C}m\u{043D}h\u{043E}o\u{0440}p
        \u{0441}c\u{0442}t\u{0445}x\u{0443}y\u{04AF}y\u{0501}d\u{04BB}h\u{051B}q\u{051D}w
        \u{0391}A\u{0392}B\u{0395}E\u{0396}Z\u{0397}H\u{0399}I\u{039A}K\u{039C}M\u{039D}N\u{039F}O
        \u{03A1}P\u{03A4}T\u{03A5}Y\u{03A7}X\u{03B1}a\u{03B5}e\u{03B9}i\u{03BA}k\u{03BD}v\u{03BF}o
        \u{03C1}p\u{03C4}t\u{03C5}u\u{03C7}x
        \u{0555}O\u{0585}o\u{054D}U\u{057D}u\u{053C}L\u{0578}n\u{0570}h\u{0581}g\u{0566}q
        \u{13AA}A\u{13F4}B\u{13DF}C\u{13A0}D\u{13AC}E\u{13C0}G\u{13BB}H\u{13A5}i\u{13AB}J\u{13E6}K
        \u{13DE}L\u{13B7}M\u{13E2}P\u{13D2}R\u{13DA}S\u{13A2}T\u{13D9}V\u{13B3}W\u{13C3}Z
        """
    private static let confusables: [Unicode.Scalar: Unicode.Scalar] = {
        let scalars = Array(confusablePairs.unicodeScalars.filter { $0 != "\n" })
        var map = [Unicode.Scalar: Unicode.Scalar]()
        for i in stride(from: 0, to: scalars.count - 1, by: 2) {
            map[scalars[i]] = scalars[i + 1]
        }
        return map
    }()

    private static func isLatin(_ v: UInt32) -> Bool {
        (v >= 0x41 && v <= 0x5a) || (v >= 0x61 && v <= 0x7a) || (v >= 0xc0 && v <= 0x24f)
    }

    /// Greek, Cyrillic, Armenian, and Cherokee: the scripts with Latin look-alikes.
    private static func isLookalikeScript(_ v: UInt32) -> Bool {
        (v >= 0x370 && v <= 0x58f) || (v >= 0x13a0 && v <= 0x13ff) || (v >= 0xab70 && v <= 0xabbf)
    }

    /// Whether `word` spells itself in Latin and a look-alike script at once.
    static func isMixedScript(_ word: String) -> Bool {
        var latin = false
        var lookalike = false
        for scalar in word.unicodeScalars {
            if isLatin(scalar.value) {
                latin = true
            } else if isLookalikeScript(scalar.value) {
                lookalike = true
            }
            if latin && lookalike { return true }
        }
        return false
    }

    /// `content` with every mixed-script word swapped back to the Latin it imitates.
    private static func foldConfusables(_ content: String) -> String {
        let ns = content as NSString
        var out = ""
        var last = 0
        var changed = false
        for match in word.matches(in: content, range: NSRange(location: 0, length: ns.length)) {
            let w = ns.substring(with: match.range)
            guard isMixedScript(w) else { continue }
            changed = true
            out += ns.substring(with: NSRange(location: last, length: match.range.location - last))
            var folded = String.UnicodeScalarView()
            for scalar in w.unicodeScalars { folded.append(confusables[scalar] ?? scalar) }
            out += String(folded)
            last = match.range.location + match.range.length
        }
        guard changed else { return content }
        out += ns.substring(from: last)
        return out
    }

    /// How many words of `content`, outside its links, are mixed-script.
    private static func countMixedScript(_ content: String) -> Int {
        normalizeTokens(replaceAll(urlRun, in: content, with: " ")).filter(isMixedScript).count
    }

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
        // Folded before lowercasing: Cherokee look-alikes lowercase into a block
        // that no longer matches the table.
        var s = foldConfusables(content).lowercased()
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

        // PITCH and DISGUISE: judged per event, so they run before the
        // batch-size gate below.
        for ev in replies {
            let shape = shapeKey(ev.content)
            if !shape.contains("@") { continue }
            if countMixedScript(ev.content) >= disguiseMinWords {
                flagged.insert(ev.id)
                continue
            }
            let words = normalizeTokens(shape)
            if words.contains(where: pitchLures.contains) && words.contains(where: pitchAsks.contains) {
                flagged.insert(ev.id)
            }
        }

        if replies.count < echoMinCopies {
            return exempt(flagged, replies, selfPubkey: selfPubkey, follows: follows)
        }

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

        // SALAD: a crowd of throwaway pubkeys each posting a uniquely-shaped word
        // salad drawn from one shared vocabulary pool. Shape-based ECHO/DENSITY
        // are blind to it, so this reads the crowd instead: build a corpus of
        // substantial replies (one per pubkey), take the pool to be the words
        // recurring across saladPoolDf+ distinct authors, and flag replies mostly
        // built from that pool — but only when they span a large enough crowd.
        // Both the pool and the score read content words only: function words
        // recur across every author of any real discussion.
        var perAuthor = [String: Set<String>]()
        for ev in replies {
            if perAuthor[ev.pubkey] != nil { continue }
            if let content = saladWords(ev) { perAuthor[ev.pubkey] = content }
        }
        if perAuthor.count >= saladMinAuthors {
            var poolDf = [String: Int]()
            for set in perAuthor.values {
                for w in set { poolDf[w, default: 0] += 1 }
            }
            var memberIds: [String] = []
            var memberAuthors = Set<String>()
            for ev in replies {
                guard let distinct = saladWords(ev) else { continue }
                var pool = 0
                for w in distinct where (poolDf[w] ?? 0) >= saladPoolDf { pool += 1 }
                if Double(pool) / Double(distinct.count) >= saladPoolFraction {
                    memberIds.append(ev.id)
                    memberAuthors.insert(ev.pubkey)
                }
            }
            if memberAuthors.count >= saladMinAuthors {
                flagged.formUnion(memberIds)
            }
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

        return exempt(flagged, replies, selfPubkey: selfPubkey, follows: follows)
    }

    /// Trust exemption, applied LAST so it overrides every rule.
    private static func exempt(
        _ flagged: Set<String>, _ replies: [Event], selfPubkey: String?, follows: Set<String>?
    ) -> Set<String> {
        var flagged = flagged
        if !flagged.isEmpty && (selfPubkey != nil || !(follows?.isEmpty ?? true)) {
            for ev in replies {
                if ev.pubkey == selfPubkey || (follows?.contains(ev.pubkey) ?? false) {
                    flagged.remove(ev.id)
                }
            }
        }
        return flagged
    }

    /// An event's distinct content words (function words set aside), or nil
    /// when it is too short for SALAD to judge.
    private static func saladWords(_ ev: Event) -> Set<String>? {
        let words = normalizeTokens(shapeKey(ev.content))
        if words.count < saladMinWords { return nil }
        let content = Set(words.filter { !stopwords.contains($0) })
        return content.count >= saladMinContentWords ? content : nil
    }
}
