import Foundation
import Capacitor
import BackgroundTasks
import UserNotifications

// MARK: - DittoNotificationPlugin

/// Capacitor plugin that bridges the JS notification configuration to the
/// native iOS background polling system.
///
/// Mirrors the Android `DittoNotificationPlugin.java` interface:
/// - Receives `userPubkey`, `relayUrls`, `enabledKinds`, `authors`, and
///   `notificationStyle` from the JS layer via `configure()`.
/// - Stores configuration in UserDefaults.
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
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
    ]

    // MARK: - Constants

    static let bgTaskIdentifier = "pub.ditto.app.notification-refresh"
    private static let prefsKey = "ditto_notification_config"

    // MARK: - Plugin Methods

    /// Called from JS: `DittoNotification.configure({ ... })`.
    @objc func configure(_ call: CAPPluginCall) {
        let userPubkey = call.getString("userPubkey")
        let notificationStyle = call.getString("notificationStyle") ?? "push"
        let relayUrls = call.getArray("relayUrls")?.compactMap { $0 as? String }
        let enabledKinds = call.getArray("enabledKinds")?.compactMap { $0 as? Int }
        let authors = call.getArray("authors")?.compactMap { $0 as? String }

        let defaults = UserDefaults.standard

        if let userPubkey, let relayUrls, !relayUrls.isEmpty {
            // Save configuration.
            defaults.set(userPubkey, forKey: "\(Self.prefsKey).userPubkey")
            defaults.set(relayUrls, forKey: "\(Self.prefsKey).relayUrls")
            defaults.set(notificationStyle, forKey: "\(Self.prefsKey).notificationStyle")
            if let enabledKinds {
                defaults.set(enabledKinds, forKey: "\(Self.prefsKey).enabledKinds")
            }
            if let authors, !authors.isEmpty {
                defaults.set(authors, forKey: "\(Self.prefsKey).authors")
            } else {
                defaults.removeObject(forKey: "\(Self.prefsKey).authors")
            }

            let kindsStr = enabledKinds?.map(String.init).joined(separator: ",") ?? "none"
            NSLog("[DittoNotification] Configured: pubkey=%@..., style=%@, relays=%d, kinds=%@",
                  String(userPubkey.prefix(8)), notificationStyle,
                  relayUrls.count,
                  kindsStr)
        } else {
            // Clear configuration (user logged out).
            for suffix in ["userPubkey", "relayUrls", "notificationStyle", "enabledKinds", "authors"] {
                defaults.removeObject(forKey: "\(Self.prefsKey).\(suffix)")
            }
            NSLog("[DittoNotification] Config cleared (user logged out)")
        }

        // Schedule or cancel background polling based on style + config.
        let hasConfig = userPubkey != nil && relayUrls != nil && !(relayUrls?.isEmpty ?? true)
        Self.manageBackgroundRefresh(style: notificationStyle, hasConfig: hasConfig)

        call.resolve()
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

        // Read configuration from UserDefaults.
        let defaults = UserDefaults.standard
        guard let userPubkey = defaults.string(forKey: "\(prefsKey).userPubkey"),
              let relayUrls = defaults.stringArray(forKey: "\(prefsKey).relayUrls"),
              !relayUrls.isEmpty else {
            NSLog("[DittoNotification] No config, completing task")
            task.setTaskCompleted(success: true)
            return
        }

        let enabledKinds = defaults.array(forKey: "\(prefsKey).enabledKinds") as? [Int] ?? []
        let authors = defaults.stringArray(forKey: "\(prefsKey).authors")

        guard !enabledKinds.isEmpty else {
            NSLog("[DittoNotification] No enabled kinds, completing task")
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
                userPubkey: userPubkey,
                relayUrls: relayUrls,
                enabledKinds: enabledKinds,
                authors: authors
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
        let defaults = UserDefaults.standard
        guard let userPubkey = defaults.string(forKey: "\(prefsKey).userPubkey"),
              let relayUrls = defaults.stringArray(forKey: "\(prefsKey).relayUrls"),
              !relayUrls.isEmpty else { return }

        let enabledKinds = defaults.array(forKey: "\(prefsKey).enabledKinds") as? [Int] ?? []
        let authors = defaults.stringArray(forKey: "\(prefsKey).authors")

        guard !enabledKinds.isEmpty else { return }

        Task {
            let poller = NostrPoller()
            await poller.poll(
                userPubkey: userPubkey,
                relayUrls: relayUrls,
                enabledKinds: enabledKinds,
                authors: authors
            )
        }
    }
}
