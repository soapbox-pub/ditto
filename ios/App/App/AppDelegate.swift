import UIKit
import Capacitor
import BackgroundTasks
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Register the background task handler for notification polling.
        // Must happen before the app finishes launching.
        DittoNotificationPlugin.registerBackgroundTask()

        // Set ourselves as the notification center delegate so we can:
        // 1. Show banners even when the app is in the foreground.
        // 2. Handle notification taps to navigate the WebView.
        UNUserNotificationCenter.current().delegate = self

        // Register notification categories with summary formats for iOS grouping.
        registerNotificationCategories()

        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Trigger an immediate poll when returning to foreground to catch up
        // on any notifications missed while backgrounded.
        DittoNotificationPlugin.pollNow()
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // MARK: - UNUserNotificationCenterDelegate

    /// Show notification banners even when the app is in the foreground.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }

    /// Handle notification tap: navigate the Capacitor WebView to /notifications.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        let path = userInfo["url"] as? String ?? "/notifications"

        // Navigate the Capacitor WebView to the notifications page.
        DispatchQueue.main.async { [weak self] in
            guard let rootVC = self?.window?.rootViewController as? DittoBridgeViewController else {
                completionHandler()
                return
            }
            let js = "window.location.pathname !== '\(path)' && (window.location.pathname = '\(path)');"
            rootVC.webView?.evaluateJavaScript(js) { _, _ in }
        }

        completionHandler()
    }

    // MARK: - Notification Categories

    /// Register notification categories with summary formats for native iOS
    /// notification grouping. When multiple notifications share a thread
    /// identifier, iOS automatically collapses them and uses the summary
    /// format to describe the group.
    private func registerNotificationCategories() {
        let categories: [UNNotificationCategory] = [
            makeCategory(id: NostrPoller.categoryReactions, summary: "%u more reactions"),
            makeCategory(id: NostrPoller.categoryReposts, summary: "%u more reposts"),
            makeCategory(id: NostrPoller.categoryZaps, summary: "%u more zaps"),
            makeCategory(id: NostrPoller.categoryMentions, summary: "%u more mentions"),
            makeCategory(id: NostrPoller.categoryComments, summary: "%u more comments"),
            makeCategory(id: NostrPoller.categoryBadges, summary: "%u more badge awards"),
            makeCategory(id: NostrPoller.categoryLetters, summary: "%u more letters"),
        ]
        UNUserNotificationCenter.current().setNotificationCategories(Set(categories))
    }

    private func makeCategory(id: String, summary: String) -> UNNotificationCategory {
        return UNNotificationCategory(
            identifier: id,
            actions: [],
            intentIdentifiers: [],
            hiddenPreviewsBodyPlaceholder: nil,
            categorySummaryFormat: summary,
            options: []
        )
    }
}
