import Foundation
import UserNotifications

// MARK: - NostrPoller

/// Polls Nostr relays for notification events and displays native iOS
/// notifications with author names, content previews, and iOS thread grouping.
///
/// Improvements over the Android implementation:
/// - Fetches kind 0 metadata so notifications show "Alice reacted" not "Someone reacted"
/// - Uses iOS thread identifiers for native notification grouping per category+post
/// - Caches author metadata in UserDefaults (24h TTL) to minimise relay queries
/// - Designed to complete within the ~30s BGAppRefreshTask budget
final class NostrPoller {

    // MARK: - Constants

    private static let prefsKey = "ditto_notifications"
    private static let lastSeenKey = "nostr:notification-last-seen"
    private static let metadataCacheKey = "nostr:author-metadata-cache"
    private static let metadataTTL: TimeInterval = 24 * 60 * 60 // 24 hours

    private static let fetchLimit = 5
    private static let wsTimeout: TimeInterval = 10
    private static let metadataFetchTimeout: TimeInterval = 5

    // MARK: - Notification Categories (registered by AppDelegate)

    /// Category identifiers used for UNNotificationCategory registration.
    static let categoryReactions  = "reactions"
    static let categoryReposts    = "reposts"
    static let categoryZaps       = "zaps"
    static let categoryMentions   = "mentions"
    static let categoryComments   = "comments"
    static let categoryBadges     = "badges"
    static let categoryLetters    = "letters"

    // MARK: - Types

    /// Minimal parsed Nostr event used during polling.
    struct NostrEvent {
        let id: String
        let pubkey: String
        let kind: Int
        let createdAt: Int
        let content: String
        let tags: [[String]]

        init?(json: [String: Any]) {
            guard let id = json["id"] as? String,
                  let pubkey = json["pubkey"] as? String,
                  let kind = json["kind"] as? Int,
                  let createdAt = json["created_at"] as? Int else { return nil }
            self.id = id
            self.pubkey = pubkey
            self.kind = kind
            self.createdAt = createdAt
            self.content = json["content"] as? String ?? ""
            self.tags = (json["tags"] as? [[String]]) ?? []
        }
    }

    /// Cached author display name.
    private struct AuthorCache: Codable {
        let name: String
        let timestamp: TimeInterval
    }

    // MARK: - Public API

    /// Run a single poll cycle: fetch events from a relay, resolve metadata,
    /// and display notifications. Returns the number of notifications shown.
    @discardableResult
    func poll(
        userPubkey: String,
        relayUrls: [String],
        enabledKinds: [Int],
        authors: [String]?
    ) async -> Int {
        guard !relayUrls.isEmpty, !enabledKinds.isEmpty else { return 0 }

        let since = lastSeenTimestamp
        let effectiveSince = since > 0 ? since : Int(Date().timeIntervalSince1970) - 300

        if since == 0 {
            setLastSeenTimestamp(effectiveSince)
        }

        // Try each relay in order until one succeeds.
        for relayUrl in relayUrls {
            guard let events = await fetchEvents(
                relayUrl: relayUrl,
                userPubkey: userPubkey,
                enabledKinds: enabledKinds,
                authors: authors,
                since: effectiveSince
            ) else {
                continue // Try next relay on failure.
            }

            // Deduplicate + filter self-interactions.
            var seenIds = Set<String>()
            let filtered = events.filter { ev in
                guard ev.pubkey != userPubkey, !seenIds.contains(ev.id) else { return false }
                seenIds.insert(ev.id)
                return true
            }

            guard !filtered.isEmpty else {
                // Successful fetch but nothing new — update timestamp and return.
                return 0
            }

            // Verify referenced events for reactions/reposts/zaps.
            let notifiable = await verifyReferencedEvents(
                events: filtered,
                userPubkey: userPubkey,
                relayUrl: relayUrl
            )

            // Update last-seen to newest event in the full filtered set (not
            // just notifiable) so we don't re-fetch already-seen events.
            let newestTs = filtered.map(\.createdAt).max() ?? effectiveSince
            if newestTs > lastSeenTimestamp {
                setLastSeenTimestamp(newestTs)
            }

            guard !notifiable.isEmpty else { return 0 }

            // Fetch author metadata for unique pubkeys.
            let pubkeys = Array(Set(notifiable.map(\.pubkey)))
            let authorNames = await resolveAuthorNames(pubkeys: pubkeys, relayUrl: relayUrl)

            // Display notifications.
            await displayNotifications(events: notifiable, authorNames: authorNames)

            return notifiable.count
        }

        return 0 // All relays failed.
    }

    // MARK: - Relay Communication

    /// Fetch notification events from a single relay. Returns nil on failure.
    private func fetchEvents(
        relayUrl: String,
        userPubkey: String,
        enabledKinds: [Int],
        authors: [String]?,
        since: Int
    ) async -> [NostrEvent]? {
        guard let url = URL(string: relayUrl) else { return nil }

        var filter: [String: Any] = [
            "kinds": enabledKinds,
            "#p": [userPubkey],
            "since": since + 1,
            "limit": Self.fetchLimit,
        ]
        if let authors, !authors.isEmpty {
            filter["authors"] = authors
        }

        return await relayQuery(url: url, filters: [filter])
    }

    /// Fetch events by IDs from a relay for referenced-event verification.
    private func fetchEventsByIds(ids: [String], relayUrl: String) async -> [String: NostrEvent] {
        guard !ids.isEmpty, let url = URL(string: relayUrl) else { return [:] }

        let filter: [String: Any] = [
            "ids": ids,
            "limit": ids.count,
        ]

        guard let events = await relayQuery(url: url, filters: [filter], timeout: Self.metadataFetchTimeout) else {
            return [:]
        }

        var map = [String: NostrEvent]()
        for ev in events {
            map[ev.id] = ev
        }
        return map
    }

    /// Fetch kind 0 metadata events for a set of pubkeys.
    private func fetchMetadata(pubkeys: [String], relayUrl: String) async -> [String: NostrEvent] {
        guard !pubkeys.isEmpty, let url = URL(string: relayUrl) else { return [:] }

        let filter: [String: Any] = [
            "kinds": [0],
            "authors": pubkeys,
            "limit": pubkeys.count,
        ]

        guard let events = await relayQuery(url: url, filters: [filter], timeout: Self.metadataFetchTimeout) else {
            return [:]
        }

        var map = [String: NostrEvent]()
        for ev in events {
            // Keep only the newest kind 0 per pubkey.
            if let existing = map[ev.pubkey], existing.createdAt > ev.createdAt {
                continue
            }
            map[ev.pubkey] = ev
        }
        return map
    }

    /// Low-level relay query: open WebSocket, send REQ, collect events until
    /// EOSE, close. Returns nil on connection/timeout failure.
    private func relayQuery(
        url: URL,
        filters: [[String: Any]],
        timeout: TimeInterval = wsTimeout
    ) async -> [NostrEvent]? {
        await withCheckedContinuation { continuation in
            var events = [NostrEvent]()
            var resumed = false
            let subId = "ditto-\(UInt64.random(in: 0...UInt64.max))"

            let session = URLSession(configuration: .default)
            let task = session.webSocketTask(with: url)
            task.resume()

            // Build REQ message: ["REQ", subId, filter1, filter2, ...]
            var reqArray: [Any] = ["REQ", subId]
            reqArray.append(contentsOf: filters)

            guard let reqData = try? JSONSerialization.data(withJSONObject: reqArray),
                  let reqStr = String(data: reqData, encoding: .utf8) else {
                continuation.resume(returning: nil)
                return
            }

            // Timeout guard.
            let timeoutWork = DispatchWorkItem { [weak task] in
                guard !resumed else { return }
                resumed = true
                task?.cancel(with: .goingAway, reason: nil)
                session.invalidateAndCancel()
                continuation.resume(returning: events.isEmpty ? nil : events)
            }
            DispatchQueue.global().asyncAfter(deadline: .now() + timeout, execute: timeoutWork)

            func finish(result: [NostrEvent]?) {
                timeoutWork.cancel()
                guard !resumed else { return }
                resumed = true
                // Send CLOSE and disconnect.
                if let closeData = try? JSONSerialization.data(withJSONObject: ["CLOSE", subId]),
                   let closeStr = String(data: closeData, encoding: .utf8) {
                    task.send(.string(closeStr)) { _ in }
                }
                task.cancel(with: .normalClosure, reason: nil)
                session.invalidateAndCancel()
                continuation.resume(returning: result)
            }

            func receiveNext() {
                task.receive { result in
                    switch result {
                    case .success(.string(let text)):
                        guard let data = text.data(using: .utf8),
                              let arr = try? JSONSerialization.jsonObject(with: data) as? [Any],
                              let type = arr.first as? String else {
                            receiveNext()
                            return
                        }

                        if type == "EVENT", arr.count >= 3,
                           let evJson = arr[2] as? [String: Any],
                           let ev = NostrEvent(json: evJson) {
                            events.append(ev)
                            receiveNext()
                        } else if type == "EOSE" || type == "CLOSED" {
                            finish(result: events)
                        } else {
                            receiveNext()
                        }

                    case .failure:
                        finish(result: nil)

                    default:
                        receiveNext()
                    }
                }
            }

            task.send(.string(reqStr)) { error in
                if error != nil {
                    finish(result: nil)
                } else {
                    receiveNext()
                }
            }
        }
    }

    // MARK: - Event Verification

    /// For reactions (7), reposts (6, 16), and zaps (9735), verify that the
    /// referenced event was authored by the current user. Events that pass
    /// verification or don't need it are returned.
    private func verifyReferencedEvents(
        events: [NostrEvent],
        userPubkey: String,
        relayUrl: String
    ) async -> [NostrEvent] {
        let needsVerification: Set<Int> = [7, 6, 16, 9735]

        // Collect referenced IDs that need verification.
        var refIdsNeeded = Set<String>()
        for ev in events where needsVerification.contains(ev.kind) {
            if let refId = referencedEventId(from: ev) {
                refIdsNeeded.insert(refId)
            }
        }

        let refMap: [String: NostrEvent]
        if !refIdsNeeded.isEmpty {
            refMap = await fetchEventsByIds(ids: Array(refIdsNeeded), relayUrl: relayUrl)
        } else {
            refMap = [:]
        }

        return events.filter { ev in
            guard needsVerification.contains(ev.kind) else { return true }

            // Zaps with #p tag targeting the user are valid (profile zaps have no e tag).
            if ev.kind == 9735 {
                return true
            }

            guard let refId = referencedEventId(from: ev) else { return false }
            guard let refEvent = refMap[refId] else {
                // Couldn't fetch — keep the notification rather than silently dropping it.
                return true
            }
            return refEvent.pubkey == userPubkey
        }
    }

    /// Returns the last `e` tag value from an event's tags.
    private func referencedEventId(from event: NostrEvent) -> String? {
        event.tags.last(where: { $0.first == "e" && $0.count > 1 })?[1]
    }

    // MARK: - Author Metadata Resolution

    /// Resolve display names for a set of pubkeys, using cache where possible.
    private func resolveAuthorNames(pubkeys: [String], relayUrl: String) async -> [String: String] {
        var result = [String: String]()
        var uncached = [String]()

        let cache = loadMetadataCache()
        let now = Date().timeIntervalSince1970

        for pk in pubkeys {
            if let cached = cache[pk], now - cached.timestamp < Self.metadataTTL {
                result[pk] = cached.name
            } else {
                uncached.append(pk)
            }
        }

        // Fetch uncached metadata from the relay.
        if !uncached.isEmpty {
            let metadataEvents = await fetchMetadata(pubkeys: uncached, relayUrl: relayUrl)
            var updatedCache = cache

            for pk in uncached {
                if let ev = metadataEvents[pk], let name = parseDisplayName(from: ev) {
                    result[pk] = name
                    updatedCache[pk] = AuthorCache(name: name, timestamp: now)
                } else {
                    // Fall back to truncated npub-style identifier.
                    let fallback = formatPubkey(pk)
                    result[pk] = fallback
                    // Don't cache failures — retry next time.
                }
            }

            saveMetadataCache(updatedCache)
        }

        return result
    }

    /// Parse display_name or name from a kind 0 event's content JSON.
    private func parseDisplayName(from event: NostrEvent) -> String? {
        guard let data = event.content.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        // Prefer display_name, fall back to name.
        if let displayName = json["display_name"] as? String, !displayName.isEmpty {
            return displayName
        }
        if let name = json["name"] as? String, !name.isEmpty {
            return name
        }
        return nil
    }

    /// Format a hex pubkey as a short identifier: first 8 + "..." + last 4.
    private func formatPubkey(_ pubkey: String) -> String {
        guard pubkey.count >= 12 else { return pubkey }
        let start = pubkey.prefix(8)
        let end = pubkey.suffix(4)
        return "\(start)...\(end)"
    }

    // MARK: - Metadata Cache (UserDefaults)

    private func loadMetadataCache() -> [String: AuthorCache] {
        let defaults = UserDefaults.standard
        guard let data = defaults.data(forKey: Self.metadataCacheKey),
              let cache = try? JSONDecoder().decode([String: AuthorCache].self, from: data) else {
            return [:]
        }
        return cache
    }

    private func saveMetadataCache(_ cache: [String: AuthorCache]) {
        guard let data = try? JSONEncoder().encode(cache) else { return }
        UserDefaults.standard.set(data, forKey: Self.metadataCacheKey)
    }

    // MARK: - Notification Display

    /// Display native iOS notifications for a batch of verified events.
    private func displayNotifications(events: [NostrEvent], authorNames: [String: String]) async {
        let center = UNUserNotificationCenter.current()

        for event in events {
            let authorName = authorNames[event.pubkey] ?? formatPubkey(event.pubkey)
            let (title, body, categoryId, threadId) = notificationContent(
                event: event,
                authorName: authorName
            )

            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            content.sound = .default
            content.categoryIdentifier = categoryId
            content.threadIdentifier = threadId
            content.userInfo = ["url": "/notifications"]

            let identifier = "ditto-\(event.id.prefix(16))"
            let request = UNNotificationRequest(
                identifier: identifier,
                content: content,
                trigger: nil // Deliver immediately.
            )

            try? await center.add(request)
        }
    }

    /// Build notification title, body, category ID, and thread identifier for an event.
    private func notificationContent(
        event: NostrEvent,
        authorName: String
    ) -> (title: String, body: String, categoryId: String, threadId: String) {
        let refId = referencedEventId(from: event) ?? ""

        switch event.kind {
        case 7:
            // Reaction — show the reaction content (emoji) if available.
            let reaction = event.content.isEmpty || event.content == "+" ? "❤️" : event.content
            return (
                "\(authorName) reacted \(reaction)",
                "Reacted to your post",
                Self.categoryReactions,
                "reactions:\(refId)"
            )

        case 6, 16:
            return (
                "\(authorName) reposted your note",
                "",
                Self.categoryReposts,
                "reposts:\(refId)"
            )

        case 9735:
            let sats = zapAmount(from: event)
            if sats > 0 {
                return (
                    "\(formatSats(sats)) sats from \(authorName)",
                    "You received a zap",
                    Self.categoryZaps,
                    "zaps"
                )
            }
            return (
                "\(authorName) zapped you",
                "",
                Self.categoryZaps,
                "zaps"
            )

        case 1:
            let hasETag = event.tags.contains(where: { $0.first == "e" })
            let preview = contentPreview(event.content, maxLength: 120)
            if hasETag {
                return (
                    "\(authorName) replied to you",
                    preview,
                    Self.categoryMentions,
                    "mentions"
                )
            }
            return (
                "\(authorName) mentioned you",
                preview,
                Self.categoryMentions,
                "mentions"
            )

        case 1111, 1222, 1244:
            let preview = contentPreview(event.content, maxLength: 120)
            // Check if this is a reply to another comment (k tag == "1111").
            let isReply = event.tags.contains(where: { $0.first == "k" && $0.count > 1 && $0[1] == "1111" })
            let action = isReply ? "replied to your comment" : "commented on your post"
            return (
                "\(authorName) \(action)",
                preview,
                Self.categoryComments,
                "comments:\(refId)"
            )

        case 8:
            return (
                "\(authorName) awarded you a badge",
                "You received a new badge",
                Self.categoryBadges,
                "badges"
            )

        case 8211:
            return (
                "\(authorName) sent you a letter",
                "You have a new letter waiting for you",
                Self.categoryLetters,
                "letters"
            )

        default:
            return (
                "\(authorName) interacted with you",
                "",
                Self.categoryMentions,
                "mentions"
            )
        }
    }

    /// Truncate content for notification body preview.
    private func contentPreview(_ content: String, maxLength: Int) -> String {
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        // Replace newlines with spaces for a single-line preview.
        let singleLine = trimmed.replacingOccurrences(
            of: "\\s*\\n+\\s*",
            with: " ",
            options: .regularExpression
        )
        guard singleLine.count > maxLength else { return singleLine }
        return String(singleLine.prefix(maxLength)) + "…"
    }

    // MARK: - Zap Amount Extraction

    /// Extract zap amount in sats from a kind 9735 zap receipt event.
    /// Checks the "amount" tag first (millisats), then falls back to
    /// parsing the "description" tag's zap request JSON.
    private func zapAmount(from event: NostrEvent) -> Int {
        // Check for direct "amount" tag (value in millisats).
        for tag in event.tags where tag.first == "amount" && tag.count > 1 {
            if let msats = Int(tag[1]), msats > 0 {
                return msats / 1000
            }
        }

        // Fall back to "description" tag (zap request JSON) -> amount tag.
        for tag in event.tags where tag.first == "description" && tag.count > 1 {
            guard let data = tag[1].data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let reqTags = json["tags"] as? [[String]] else { continue }
            for reqTag in reqTags where reqTag.first == "amount" && reqTag.count > 1 {
                if let msats = Int(reqTag[1]), msats > 0 {
                    return msats / 1000
                }
            }
        }

        return 0
    }

    /// Format sats for compact display: 500 -> "500", 1500 -> "1.5K", 1000000 -> "1M".
    private func formatSats(_ sats: Int) -> String {
        if sats >= 1_000_000 {
            let val = Double(sats) / 1_000_000.0
            if val == val.rounded(.down) {
                return "\(Int(val))M"
            }
            return String(format: "%.1fM", val).replacingOccurrences(of: ".0M", with: "M")
        } else if sats >= 1_000 {
            let val = Double(sats) / 1_000.0
            if val == val.rounded(.down) {
                return "\(Int(val))K"
            }
            return String(format: "%.1fK", val).replacingOccurrences(of: ".0K", with: "K")
        }
        return "\(sats)"
    }

    // MARK: - Last-Seen Timestamp

    var lastSeenTimestamp: Int {
        UserDefaults.standard.integer(forKey: Self.lastSeenKey)
    }

    func setLastSeenTimestamp(_ ts: Int) {
        UserDefaults.standard.set(ts, forKey: Self.lastSeenKey)
    }
}
