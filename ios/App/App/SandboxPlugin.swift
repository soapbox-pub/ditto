import Foundation
import Capacitor
import WebKit

// MARK: - Scheme Handler (registered on the main Capacitor WKWebView)

/// `WKURLSchemeHandler` for the `sbx` scheme, registered on the **main**
/// Capacitor WKWebView via `DittoBridgeViewController.webViewConfiguration(for:)`.
///
/// Iframes inside the React app load from `sbx://<sandbox-id>/path`. Each
/// hostname is a different web origin, so localStorage / IndexedDB / cookies
/// are fully isolated per sandbox — without needing to create a separate
/// WKWebView per sandbox.
///
/// Requests are forwarded to the JS layer as Capacitor plugin events. The JS
/// layer resolves the file (e.g. from Blossom) and responds with
/// `SandboxPlugin.respondToFetch()`.
class IframeSandboxSchemeHandler: NSObject, WKURLSchemeHandler {
    /// Pending scheme tasks waiting for a response from JS.
    /// Key: requestId (UUID string), Value: the WKURLSchemeTask to respond to.
    private var pendingTasks: [String: WKURLSchemeTask] = [:]
    private let lock = NSLock()

    /// Weak reference to the plugin so we can emit events.
    weak var plugin: SandboxPlugin?

    private func log(_ message: String) {
        NSLog("[SandboxSchemeHandler] %@", message)
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        let request = urlSchemeTask.request
        log("start — raw URL: \(request.url?.absoluteString ?? "nil")")

        guard let url = request.url else {
            log("start — FAILED: no URL in request")
            urlSchemeTask.didFailWithError(NSError(
                domain: "SandboxPlugin", code: -1,
                userInfo: [NSLocalizedDescriptionKey: "No URL in request"]
            ))
            return
        }

        let requestId = UUID().uuidString

        lock.lock()
        pendingTasks[requestId] = urlSchemeTask
        let pendingCount = pendingTasks.count
        lock.unlock()

        // Extract the sandbox ID from the hostname.
        let sandboxId = url.host ?? "unknown"

        log("start — scheme=\(url.scheme ?? "nil") host=\(url.host ?? "nil") path=\(url.path) sandboxId=\(sandboxId) requestId=\(requestId) pendingCount=\(pendingCount)")

        // Serialise the request for the JS layer.
        var headers: [String: String] = [:]
        if let allHeaders = request.allHTTPHeaderFields {
            headers = allHeaders
        }

        var bodyBase64: String? = nil
        if let bodyData = request.httpBody {
            bodyBase64 = bodyData.base64EncodedString()
        }

        let path = url.path.isEmpty ? "/" : url.path

        // Rewrite URL so JS sees a parseable URL with the sandbox ID as host.
        let rewrittenURL = "https://\(sandboxId).sandbox.native\(path)"

        let serialisedRequest: [String: Any] = [
            "url": rewrittenURL,
            "method": request.httpMethod ?? "GET",
            "headers": headers,
            "body": bodyBase64 as Any,
        ]

        if let p = plugin {
            log("start — emitting fetch event to plugin (hasListeners=\(p.hasListeners("fetch"))) rewrittenURL=\(rewrittenURL)")
            p.emitFetchRequest(
                sandboxId: sandboxId,
                requestId: requestId,
                request: serialisedRequest
            )
        } else {
            log("start — WARNING: plugin reference is nil, cannot emit fetch event for requestId=\(requestId)")
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        let stoppedURL = urlSchemeTask.request.url?.absoluteString ?? "nil"
        lock.lock()
        let removed = pendingTasks.first(where: { $0.value === urlSchemeTask })
        if let key = removed?.key {
            pendingTasks.removeValue(forKey: key)
            log("stop — cancelled requestId=\(key) url=\(stoppedURL)")
        } else {
            log("stop — task not found in pending (already resolved?) url=\(stoppedURL)")
        }
        lock.unlock()
    }

    /// Called by the plugin when JS responds to a fetch request.
    func resolveRequest(
        requestId: String,
        status: Int,
        statusText: String,
        headers: [String: String],
        bodyBase64: String?
    ) {
        lock.lock()
        guard let task = pendingTasks.removeValue(forKey: requestId) else {
            lock.unlock()
            log("resolveRequest — WARNING: no pending task for requestId=\(requestId) (already cancelled?)")
            return
        }
        let remainingCount = pendingTasks.count
        lock.unlock()

        let bodyLen = bodyBase64.map { $0.count } ?? 0
        let taskURL = task.request.url?.absoluteString ?? "nil"
        log("resolveRequest — requestId=\(requestId) status=\(status) bodyBase64Len=\(bodyLen) remainingPending=\(remainingCount) url=\(taskURL)")

        var bodyData: Data? = nil
        if let b64 = bodyBase64 {
            bodyData = Data(base64Encoded: b64)
            if bodyData == nil {
                log("resolveRequest — WARNING: base64 decode failed for requestId=\(requestId)")
            }
        }

        let responseURL = task.request.url ?? URL(string: "sbx://unknown/")!
        let response = HTTPURLResponse(
            url: responseURL,
            statusCode: status,
            httpVersion: "HTTP/1.1",
            headerFields: headers
        )!

        DispatchQueue.main.async { [weak self] in
            self?.log("resolveRequest — delivering response on main thread for requestId=\(requestId) dataBytes=\(bodyData?.count ?? 0)")
            task.didReceive(response)
            if let data = bodyData {
                task.didReceive(data)
            }
            task.didFinish()
        }
    }

    /// Cancel all pending tasks (called on cleanup).
    func cancelAll() {
        lock.lock()
        let tasks = pendingTasks
        pendingTasks.removeAll()
        lock.unlock()

        log("cancelAll — cancelling \(tasks.count) pending tasks")

        for (requestId, task) in tasks {
            log("cancelAll — failing requestId=\(requestId)")
            task.didFailWithError(NSError(
                domain: "SandboxPlugin", code: -999,
                userInfo: [NSLocalizedDescriptionKey: "Sandbox destroyed"]
            ))
        }
    }
}

// MARK: - Plugin

/// Capacitor plugin that handles sandbox fetch responses.
///
/// The actual request interception is done by `IframeSandboxSchemeHandler`,
/// registered on the main WKWebView's configuration. This plugin provides:
///   - `respondToFetch()`: JS calls this to respond to intercepted requests.
///   - `fetch` event: Emitted when a sandbox iframe makes a request.
///
/// The old native-WebView-overlay approach (create/navigate/updateFrame/destroy)
/// is no longer needed — sandboxes are now regular `<iframe>` elements in the DOM.
@objc(SandboxPlugin)
public class SandboxPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SandboxPlugin"
    public let jsName = "SandboxPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "respondToFetch", returnType: CAPPluginReturnPromise),
    ]

    /// The shared scheme handler — set by `DittoBridgeViewController` before
    /// the plugin loads, so it's available when JS starts sending responses.
    static var sharedSchemeHandler: IframeSandboxSchemeHandler?

    private func log(_ message: String) {
        NSLog("[SandboxPlugin] %@", message)
    }

    public override func load() {
        log("load — sharedSchemeHandler is \(SandboxPlugin.sharedSchemeHandler == nil ? "nil" : "set")")
        // Connect the scheme handler to this plugin so it can emit events.
        SandboxPlugin.sharedSchemeHandler?.plugin = self
        log("load — plugin reference \(SandboxPlugin.sharedSchemeHandler?.plugin == nil ? "NOT set (handler nil)" : "connected")")
    }

    @objc func respondToFetch(_ call: CAPPluginCall) {
        guard let requestId = call.getString("requestId") else {
            log("respondToFetch — REJECTED: missing requestId")
            call.reject("Missing required parameter: requestId")
            return
        }
        guard let response = call.getObject("response") else {
            log("respondToFetch — REJECTED: missing response for requestId=\(requestId)")
            call.reject("Missing required parameter: response")
            return
        }

        guard let handler = SandboxPlugin.sharedSchemeHandler else {
            log("respondToFetch — REJECTED: scheme handler not initialised for requestId=\(requestId)")
            call.reject("Scheme handler not initialised")
            return
        }

        let status = response["status"] as? Int ?? 200
        let bodyStr = response["body"] as? String
        log("respondToFetch — requestId=\(requestId) status=\(status) hasBody=\(bodyStr != nil) bodyLen=\(bodyStr?.count ?? 0)")

        handler.resolveRequest(
            requestId: requestId,
            status: status,
            statusText: response["statusText"] as? String ?? "OK",
            headers: response["headers"] as? [String: String] ?? [:],
            bodyBase64: bodyStr
        )

        call.resolve()
    }

    // MARK: - Event Forwarding

    /// Forward a fetch request from the scheme handler to JS.
    func emitFetchRequest(sandboxId: String, requestId: String, request: [String: Any]) {
        let url = request["url"] as? String ?? "unknown"
        log("emitFetchRequest — sandboxId=\(sandboxId) requestId=\(requestId) url=\(url) hasListeners=\(hasListeners("fetch"))")
        notifyListeners("fetch", data: [
            "id": sandboxId,
            "requestId": requestId,
            "request": request,
        ])
    }
}
