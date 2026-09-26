import Foundation
import Capacitor
import BackgroundTasks
import UserNotifications

// MARK: - DittoNotificationPlugin

/// Capacitor plugin that bridges the JS notification configuration to the
/// native iOS background polling system.
///
/// Mirrors the Android `DittoNotificationPlugin.java` interface, and makes the
/// app a napp push host:
/// - Receives the same subscriptions (`[{ filters, relays }]`) Tenna and the
///   nostr-push service take, plus the user, follow set and "only following",
///   via `setSubscriptions()`.
/// - Stores them in UserDefaults.
/// - Schedules / cancels a `BGAppRefreshTask` to periodically poll relays
///   and display local notifications via `NostrPoller`.
///
/// On iOS the "push" vs "persistent" distinction maps to:
/// - **"push"**: No background polling. Relies on Web Push (where supported)
///   or in-app polling when the app is open.
/// - **"persistent"**: Schedules `BGAppRefreshTask` for periodic relay polling.
///   iOS manages the interval (~15 min minimum, adaptive based on app usage).
@objc(DittoNotificationPlugin)
public class DittoNotificationPlugin: CAPPlugin, CAPBridgedPlugin {

    // MARK: - Capacitor Bridging

    public let identifier = "DittoNotificationPlugin"
    public let jsName = "DittoNotification"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setSubscriptions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSubscriptions", returnType: CAPPluginReturnPromise),
    ]

    // MARK: - Constants

    static let bgTaskIdentifier = "pub.ditto.app.notification-refresh"
    private static let prefsKey = "ditto_notification_config"

    // MARK: - Notification-tap bridge

    /// Live plugin instance, set once the bridge loads the plugin. Taps that
    /// arrive before the WebView/bridge is ready (cold start) are stashed in
    /// `pendingTaps` and flushed here.
    private static weak var instance: DittoNotificationPlugin?

    /// Notification-tap paths emitted before the plugin instance existed.
    private static var pendingTaps: [String] = []
    private static let pendingLock = NSLock()

    override public func load() {
        Self.instance = self
        Self.flushPendingTaps()
    }

    /// Forward a notification tap into the JS layer as structured data.
    ///
    /// Called from `AppDelegate`'s `UNUserNotificationCenterDelegate`. The path
    /// crosses the Capacitor bridge as a JSON object — never concatenated into
    /// a code string — so there is no `evaluateJavaScript` sink to escape. The
    /// event is retained until a listener consumes it, covering the cold-start
    /// race where the tap arrives before the JS layer has mounted its listener.
    static func emitNotificationTap(path: String) {
        pendingLock.lock()
        pendingTaps.append(path)
        pendingLock.unlock()
        if instance != nil {
            flushPendingTaps()
        }
    }

    private static func flushPendingTaps() {
        guard let plugin = instance else { return }
        pendingLock.lock()
        let toSend = pendingTaps
        pendingTaps.removeAll()
        pendingLock.unlock()
        for path in toSend {
            plugin.notifyListeners("notificationTap", data: ["path": path], retainUntilConsumed: true)
        }
    }

    // MARK: - Plugin Methods

    private static let subscriptionsKey = "\(prefsKey).subscriptions"
    /// Keys written by builds from before subscriptions, cleared on the next set.
    private static let legacyKeys = ["relayUrls", "enabledKinds", "authors"]
    private static let configKeys = ["userPubkey", "subscriptions", "follows", "onlyFollowing", "notificationStyle"]

    /// Called from JS: `DittoNotification.setSubscriptions({ ... })`.
    ///
    /// Replaces the watched subscriptions — napp's `NappSubscription[]`, built
    /// by the JS layer exactly as it is for Tenna and the nostr-push service.
    /// An empty list stops watching. Also carries what the renderer needs
    /// beside the filters: the user, the follow set, and "only following".
    @objc func setSubscriptions(_ call: CAPPluginCall) {
        let userPubkey = call.getString("userPubkey")
        let notificationStyle = call.getString("notificationStyle") ?? "push"
        let subscriptions = call.getArray("subscriptions") ?? []
        let follows = call.getArray("follows")?.compactMap { $0 as? String } ?? []
        let onlyFollowing = call.getBool("onlyFollowing") ?? false

        let defaults = UserDefaults.standard
        for suffix in Self.legacyKeys + Self.configKeys {
            defaults.removeObject(forKey: "\(Self.prefsKey).\(suffix)")
        }

        let hasConfig = userPubkey != nil && !subscriptions.isEmpty
        if let userPubkey, hasConfig,
           let data = try? JSONSerialization.data(withJSONObject: subscriptions) {
            defaults.set(userPubkey, forKey: "\(Self.prefsKey).userPubkey")
            defaults.set(data, forKey: Self.subscriptionsKey)
            defaults.set(follows, forKey: "\(Self.prefsKey).follows")
            defaults.set(onlyFollowing, forKey: "\(Self.prefsKey).onlyFollowing")
            defaults.set(notificationStyle, forKey: "\(Self.prefsKey).notificationStyle")
            NSLog("[DittoNotification] Subscriptions set: pubkey=%@..., subscriptions=%d",
                  String(userPubkey.prefix(8)), subscriptions.count)
        } else {
            NSLog("[DittoNotification] Subscriptions cleared")
        }

        Self.manageBackgroundRefresh(style: notificationStyle, hasConfig: hasConfig)
        call.resolve()
    }

    /// Called from JS: `DittoNotification.getSubscriptions()`.
    @objc func getSubscriptions(_ call: CAPPluginCall) {
        call.resolve(["subscriptions": Self.storedSubscriptions()])
    }

    private static func storedSubscriptions() -> [[String: Any]] {
        guard let data = UserDefaults.standard.data(forKey: subscriptionsKey),
              let parsed = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }
        return parsed
    }

    /// Everything a poll needs, or nil when nothing is configured.
    private static func pollConfig() -> (userPubkey: String, relays: [NostrPoller.RelayFilters], follows: Set<String>, onlyFollowing: Bool)? {
        let defaults = UserDefaults.standard
        guard let userPubkey = defaults.string(forKey: "\(prefsKey).userPubkey") else { return nil }
        let relays = NostrPoller.relayFilters(from: storedSubscriptions())
        guard !relays.isEmpty else { return nil }
        let follows = Set(defaults.stringArray(forKey: "\(prefsKey).follows") ?? [])
        let onlyFollowing = defaults.bool(forKey: "\(prefsKey).onlyFollowing")
        return (userPubkey, relays, follows, onlyFollowing)
    }

    // MARK: - Background Task Management

    /// Register the BGAppRefreshTask handler. Must be called from
    /// `application(_:didFinishLaunchingWithOptions:)` before the app
    /// finishes launching.
    static func registerBackgroundTask() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: bgTaskIdentifier,
            using: nil
        ) { task in
            guard let refreshTask = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            Self.handleBackgroundRefresh(task: refreshTask)
        }
        NSLog("[DittoNotification] Registered BGAppRefreshTask: %@", bgTaskIdentifier)
    }

    /// Schedule or cancel the BGAppRefreshTask.
    /// On iOS both "push" and "persistent" modes use BGAppRefreshTask
    /// (there is no Web Push in WKWebView and no foreground service concept),
    /// so we schedule whenever there is a valid config.
    static func manageBackgroundRefresh(style: String, hasConfig: Bool) {
        if hasConfig {
            scheduleBackgroundRefresh()
        } else {
            cancelBackgroundRefresh()
        }
    }

    /// Schedule the next background refresh. iOS decides the actual timing
    /// (minimum ~15 minutes, adaptive based on user app usage patterns).
    static func scheduleBackgroundRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: bgTaskIdentifier)
        // Suggest earliest begin date of 8 minutes from now (iOS may defer).
        request.earliestBeginDate = Date(timeIntervalSinceNow: 8 * 60)

        do {
            try BGTaskScheduler.shared.submit(request)
            NSLog("[DittoNotification] Scheduled background refresh")
        } catch {
            NSLog("[DittoNotification] Failed to schedule background refresh: %@", error.localizedDescription)
        }
    }

    private static func cancelBackgroundRefresh() {
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: bgTaskIdentifier)
        NSLog("[DittoNotification] Cancelled background refresh")
    }

    /// Handle a BGAppRefreshTask: read config, poll, reschedule.
    private static func handleBackgroundRefresh(task: BGAppRefreshTask) {
        NSLog("[DittoNotification] Background refresh triggered")

        guard let config = pollConfig() else {
            NSLog("[DittoNotification] No config, completing task")
            task.setTaskCompleted(success: true)
            return
        }

        // Schedule the next refresh before starting work (in case we're
        // terminated mid-task, the next refresh is already queued).
        scheduleBackgroundRefresh()

        // Run the poll in a detached Task.
        let pollTask = Task {
            let poller = NostrPoller()
            let count = await poller.poll(
                userPubkey: config.userPubkey,
                relays: config.relays,
                follows: config.follows,
                onlyFollowing: config.onlyFollowing
            )
            NSLog("[DittoNotification] Background poll complete: %d notifications", count)
            task.setTaskCompleted(success: true)
        }

        // Handle task expiration (iOS is about to kill us).
        task.expirationHandler = {
            NSLog("[DittoNotification] Background task expired")
            pollTask.cancel()
            task.setTaskCompleted(success: false)
        }
    }

    // MARK: - Immediate Poll

    /// Trigger an immediate poll (e.g., when the app enters the foreground
    /// after being backgrounded, to catch up on missed notifications).
    static func pollNow() {
        guard let config = pollConfig() else { return }

        Task {
            let poller = NostrPoller()
            await poller.poll(
                userPubkey: config.userPubkey,
                relays: config.relays,
                follows: config.follows,
                onlyFollowing: config.onlyFollowing
            )
        }
    }
}
