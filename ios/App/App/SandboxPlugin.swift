import Foundation
import Capacitor
import WebKit

// MARK: - Shared Handler Singleton

/// The sandbox request handler singleton.
/// Created by `DittoBridgeViewController` at WKWebView configuration time,
/// then connected to the `SandboxPlugin` when the plugin loads.
var _sandboxHandler: SandboxRequestHandler?

// MARK: - Sandbox Scheme Handler

/// `WKURLSchemeHandler` for the `sbx://` custom scheme.
///
/// Each sandbox iframe loads from `sbx://<sandbox-id>/path`, giving every
/// sandbox a unique web origin with full localStorage / IndexedDB / cookie
/// isolation.
///
/// Intercepted requests are forwarded to the JS layer via the Capacitor
/// plugin bridge. JS resolves the file and responds with `respondToFetch()`.
class SandboxRequestHandler: NSObject, WKURLSchemeHandler {
    private var pendingTasks: [String: WKURLSchemeTask] = [:]
    private let lock = NSLock()

    weak var plugin: SandboxPlugin?

    /// Number of pending tasks (for diagnostics).
    var pendingTaskCount: Int {
        lock.lock()
        let count = pendingTasks.count
        lock.unlock()
        return count
    }

    // MARK: WKURLSchemeHandler

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        let request = urlSchemeTask.request
        guard let url = request.url else {
            urlSchemeTask.didFailWithError(NSError(
                domain: "SandboxPlugin", code: -1,
                userInfo: [NSLocalizedDescriptionKey: "No URL in request"]
            ))
            return
        }

        let requestId = UUID().uuidString

        lock.lock()
        pendingTasks[requestId] = urlSchemeTask
        lock.unlock()

        // Extract the sandbox ID from the hostname: sbx://<sandbox-id>/path
        let sandboxId = url.host ?? "unknown"

        var headers: [String: String] = [:]
        if let allHeaders = request.allHTTPHeaderFields {
            headers = allHeaders
        }

        var bodyBase64: String? = nil
        if let bodyData = request.httpBody {
            bodyBase64 = bodyData.base64EncodedString()
        }

        let path = url.path.isEmpty ? "/" : url.path

        // Rewrite URL so JS sees a consistent format matching Android.
        let rewrittenURL = "https://\(sandboxId).sandbox.native\(path)"

        let serialisedRequest: [String: Any] = [
            "url": rewrittenURL,
            "method": request.httpMethod ?? "GET",
            "headers": headers,
            "body": bodyBase64 as Any,
        ]

        plugin?.emitFetchRequest(
            sandboxId: sandboxId,
            requestId: requestId,
            request: serialisedRequest
        )
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        lock.lock()
        let removed = pendingTasks.first(where: { $0.value === urlSchemeTask })
        if let key = removed?.key {
            pendingTasks.removeValue(forKey: key)
        }
        lock.unlock()
    }

    // MARK: Response Resolution

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
            return
        }
        lock.unlock()

        var bodyData: Data? = nil
        if let b64 = bodyBase64 {
            bodyData = Data(base64Encoded: b64)
        }

        let responseURL = task.request.url ?? URL(string: "sbx://unknown/")!
        let response = HTTPURLResponse(
            url: responseURL,
            statusCode: status,
            httpVersion: "HTTP/1.1",
            headerFields: headers
        )!

        DispatchQueue.main.async {
            task.didReceive(response)
            if let data = bodyData {
                task.didReceive(data)
            }
            task.didFinish()
        }
    }

    func cancelAll() {
        lock.lock()
        let tasks = pendingTasks
        pendingTasks.removeAll()
        lock.unlock()

        for (_, task) in tasks {
            task.didFailWithError(NSError(
                domain: "SandboxPlugin", code: -999,
                userInfo: [NSLocalizedDescriptionKey: "Sandbox destroyed"]
            ))
        }
    }
}

// MARK: - Plugin

/// Capacitor plugin that bridges sandbox fetch events between native and JS.
///
/// On iOS, sandbox iframes use the `sbx://` custom URL scheme, registered
/// on the WKWebView configuration before the web view is created. Each
/// sandbox loads from `sbx://<sandbox-id>/path`, providing full origin
/// isolation (separate localStorage, cookies, etc.).
///
/// On Android, a custom `BridgeWebViewClient` subclass intercepts requests
/// to `https://<sandbox-id>.sandbox.native/path`.
@objc(SandboxPlugin)
public class SandboxPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SandboxPlugin"
    public let jsName = "SandboxPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "respondToFetch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "diagnose", returnType: CAPPluginReturnPromise),
    ]

    public override func load() {
        // Connect the shared handler to this plugin so it can emit events.
        _sandboxHandler?.plugin = self
    }

    @objc func respondToFetch(_ call: CAPPluginCall) {
        guard let requestId = call.getString("requestId") else {
            call.reject("Missing required parameter: requestId")
            return
        }
        guard let response = call.getObject("response") else {
            call.reject("Missing required parameter: response")
            return
        }

        guard let handler = _sandboxHandler else {
            call.reject("Sandbox handler not initialised")
            return
        }

        handler.resolveRequest(
            requestId: requestId,
            status: response["status"] as? Int ?? 200,
            statusText: response["statusText"] as? String ?? "OK",
            headers: response["headers"] as? [String: String] ?? [:],
            bodyBase64: response["body"] as? String
        )

        call.resolve()
    }

    /// Diagnostic method callable from JS to inspect native state.
    @objc func diagnose(_ call: CAPPluginCall) {
        let handler = _sandboxHandler
        call.resolve([
            "sandboxHandlerSet": handler != nil,
            "pluginConnected": handler?.plugin != nil,
            "bridgeHasWebView": bridge?.webView != nil,
            "hasListenersFetch": hasListeners("fetch"),
            "pendingTaskCount": handler?.pendingTaskCount ?? 0,
        ])
    }

    // MARK: - Event Forwarding

    func emitFetchRequest(sandboxId: String, requestId: String, request: [String: Any]) {
        notifyListeners("fetch", data: [
            "id": sandboxId,
            "requestId": requestId,
            "request": request,
        ])
    }
}
