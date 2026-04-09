import Foundation
import Capacitor
import WebKit

// MARK: - Plugin

/// Capacitor plugin that creates isolated WKWebViews for sandboxed content.
///
/// Each sandbox gets a unique custom URL scheme (`sbx-<id>://`) so that
/// every embedded app has its own origin (separate localStorage, cookies, etc.).
/// All requests on the custom scheme are intercepted via `WKURLSchemeHandler`
/// and forwarded to the JS layer as fetch events — the same protocol
/// iframe.diy uses. This lets the existing React code serve files identically.
@objc(SandboxPlugin)
public class SandboxPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SandboxPlugin"
    public let jsName = "SandboxPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "create", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateFrame", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "respondToFetch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "postMessage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "destroy", returnType: CAPPluginReturnPromise),
    ]

    /// Active sandbox instances, keyed by sandbox ID.
    private var sandboxes: [String: SandboxInstance] = [:]

    // MARK: - Plugin Methods

    @objc func create(_ call: CAPPluginCall) {
        guard let sandboxId = call.getString("id") else {
            call.reject("Missing required parameter: id")
            return
        }
        guard let frame = call.getObject("frame"),
              let x = frame["x"] as? Double,
              let y = frame["y"] as? Double,
              let width = frame["width"] as? Double,
              let height = frame["height"] as? Double else {
            call.reject("Missing or invalid parameter: frame")
            return
        }

        if sandboxes[sandboxId] != nil {
            call.reject("Sandbox already exists: \(sandboxId)")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            let webViewFrame = CGRect(x: x, y: y, width: width, height: height)
            let sandbox = SandboxInstance(
                id: sandboxId,
                frame: webViewFrame,
                plugin: self
            )
            self.sandboxes[sandboxId] = sandbox

            // Add the WebView on top of the Capacitor WebView.
            if let bridge = self.bridge,
               let webView = bridge.webView {
                webView.superview?.addSubview(sandbox.webView)
            }

            call.resolve()
        }
    }

    @objc func updateFrame(_ call: CAPPluginCall) {
        guard let sandboxId = call.getString("id") else {
            call.reject("Missing required parameter: id")
            return
        }
        guard let frame = call.getObject("frame"),
              let x = frame["x"] as? Double,
              let y = frame["y"] as? Double,
              let width = frame["width"] as? Double,
              let height = frame["height"] as? Double else {
            call.reject("Missing or invalid parameter: frame")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let sandbox = self?.sandboxes[sandboxId] else {
                call.reject("Sandbox not found: \(sandboxId)")
                return
            }
            sandbox.webView.frame = CGRect(x: x, y: y, width: width, height: height)
            call.resolve()
        }
    }

    @objc func respondToFetch(_ call: CAPPluginCall) {
        guard let sandboxId = call.getString("id") else {
            call.reject("Missing required parameter: id")
            return
        }
        guard let requestId = call.getString("requestId") else {
            call.reject("Missing required parameter: requestId")
            return
        }
        guard let response = call.getObject("response") else {
            call.reject("Missing required parameter: response")
            return
        }

        guard let sandbox = sandboxes[sandboxId] else {
            call.reject("Sandbox not found: \(sandboxId)")
            return
        }

        sandbox.schemeHandler.resolveRequest(
            requestId: requestId,
            status: response["status"] as? Int ?? 200,
            statusText: response["statusText"] as? String ?? "OK",
            headers: response["headers"] as? [String: String] ?? [:],
            bodyBase64: response["body"] as? String
        )

        call.resolve()
    }

    @objc func postMessage(_ call: CAPPluginCall) {
        guard let sandboxId = call.getString("id") else {
            call.reject("Missing required parameter: id")
            return
        }
        guard let message = call.getObject("message") else {
            call.reject("Missing required parameter: message")
            return
        }

        guard let sandbox = sandboxes[sandboxId] else {
            call.reject("Sandbox not found: \(sandboxId)")
            return
        }

        DispatchQueue.main.async {
            sandbox.postMessageToWebView(message)
        }

        call.resolve()
    }

    @objc func destroy(_ call: CAPPluginCall) {
        guard let sandboxId = call.getString("id") else {
            call.reject("Missing required parameter: id")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if let sandbox = self.sandboxes.removeValue(forKey: sandboxId) {
                sandbox.webView.removeFromSuperview()
                sandbox.schemeHandler.cancelAll()
            }
            call.resolve()
        }
    }

    // MARK: - Event Forwarding

    /// Forward a fetch request from the native WebView to JS.
    func emitFetchRequest(sandboxId: String, requestId: String, request: [String: Any]) {
        notifyListeners("fetch", data: [
            "id": sandboxId,
            "requestId": requestId,
            "request": request,
        ])
    }

    /// Forward a script message from the sandbox to JS.
    func emitScriptMessage(sandboxId: String, message: [String: Any]) {
        notifyListeners("scriptMessage", data: [
            "id": sandboxId,
            "message": message,
        ])
    }
}

// MARK: - SandboxInstance

/// Manages a single sandboxed WKWebView instance.
private class SandboxInstance: NSObject, WKScriptMessageHandler {
    let id: String
    let webView: WKWebView
    let schemeHandler: SandboxSchemeHandler
    private weak var plugin: SandboxPlugin?
    private let customScheme: String

    init(id: String, frame: CGRect, plugin: SandboxPlugin) {
        self.id = id
        self.plugin = plugin

        // Use a shortened ID for the scheme (URL schemes have length limits
        // and must start with a letter). We use "sbx-" prefix + first 12 chars.
        let schemeId = String(id.prefix(12))
        self.customScheme = "sbx-\(schemeId)"

        self.schemeHandler = SandboxSchemeHandler(
            sandboxId: id,
            scheme: self.customScheme,
            plugin: plugin
        )

        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(self.schemeHandler, forURLScheme: self.customScheme)

        // Add a script message handler for communication from injected scripts.
        let userContentController = WKUserContentController()

        // Inject a bridge script that:
        // 1. Provides window.parent.postMessage()-like functionality
        // 2. Routes messages through the native bridge
        let bridgeScript = WKUserScript(
            source: SandboxInstance.bridgeScript(scheme: self.customScheme),
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        )
        userContentController.addUserScript(bridgeScript)

        config.userContentController = userContentController
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.defaultWebpagePreferences.allowsContentJavaScript = true

        self.webView = WKWebView(frame: frame, configuration: config)
        self.webView.isOpaque = false
        self.webView.backgroundColor = .white
        self.webView.scrollView.bounces = false

        super.init()

        // Register the message handler after super.init().
        userContentController.add(self, name: "sandboxBridge")

        // Load the initial page via the custom scheme.
        let initialURL = URL(string: "\(self.customScheme)://app/index.html")!
        self.webView.load(URLRequest(url: initialURL))
    }

    /// Post a JSON-RPC message to injected scripts inside the WebView.
    func postMessageToWebView(_ message: [String: Any]) {
        guard let jsonData = try? JSONSerialization.data(withJSONObject: message),
              let jsonString = String(data: jsonData, encoding: .utf8) else {
            return
        }

        let js = """
        (function() {
            if (window.__sandboxBridge && window.__sandboxBridge.onMessage) {
                window.__sandboxBridge.onMessage(\(jsonString));
            }
        })();
        """
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    // MARK: - WKScriptMessageHandler

    /// Receive messages from injected scripts via webkit.messageHandlers.sandboxBridge.
    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == "sandboxBridge",
              let body = message.body as? [String: Any] else {
            return
        }
        plugin?.emitScriptMessage(sandboxId: id, message: body)
    }

    // MARK: - Bridge Script

    /// JavaScript injected at document start that provides:
    ///   - `window.parent.postMessage()` emulation via WKScriptMessageHandler
    ///   - `window.__sandboxBridge.onMessage()` for receiving messages from parent
    ///   - `window.addEventListener("message", ...)` support for injected scripts
    private static func bridgeScript(scheme: String) -> String {
        return """
        (function() {
            'use strict';

            // Message listeners registered by injected scripts.
            var messageListeners = [];

            // Bridge object for native communication.
            window.__sandboxBridge = {
                onMessage: function(data) {
                    // Dispatch to all registered message listeners.
                    var event = {
                        data: data,
                        origin: '\(scheme)://app',
                        source: window.parent,
                        type: 'message'
                    };
                    for (var i = 0; i < messageListeners.length; i++) {
                        try {
                            messageListeners[i](event);
                        } catch (e) {
                            console.error('[SandboxBridge] Listener error:', e);
                        }
                    }
                }
            };

            // Override addEventListener to capture "message" listeners.
            var originalAddEventListener = window.addEventListener;
            window.addEventListener = function(type, listener, options) {
                if (type === 'message' && typeof listener === 'function') {
                    messageListeners.push(listener);
                }
                return originalAddEventListener.call(window, type, listener, options);
            };

            var originalRemoveEventListener = window.removeEventListener;
            window.removeEventListener = function(type, listener, options) {
                if (type === 'message') {
                    var idx = messageListeners.indexOf(listener);
                    if (idx !== -1) messageListeners.splice(idx, 1);
                }
                return originalRemoveEventListener.call(window, type, listener, options);
            };

            // Emulate window.parent.postMessage for scripts that use it
            // (e.g. the webxdc bridge script, preview injected script).
            if (!window.parent || window.parent === window) {
                window.parent = {};
            }
            window.parent.postMessage = function(data, targetOrigin, transfer) {
                if (data && typeof data === 'object' && data.jsonrpc === '2.0') {
                    try {
                        window.webkit.messageHandlers.sandboxBridge.postMessage(data);
                    } catch (e) {
                        console.error('[SandboxBridge] postMessage failed:', e);
                    }
                }
            };
        })();
        """;
    }
}

// MARK: - SandboxSchemeHandler

/// WKURLSchemeHandler that intercepts all requests on the sandbox's custom
/// URL scheme and forwards them to the JS layer as fetch events.
private class SandboxSchemeHandler: NSObject, WKURLSchemeHandler {
    private let sandboxId: String
    private let scheme: String
    private weak var plugin: SandboxPlugin?

    /// Pending scheme tasks waiting for a response from JS.
    /// Key: requestId (UUID string), Value: the WKURLSchemeTask to respond to.
    private var pendingTasks: [String: WKURLSchemeTask] = [:]
    private let lock = NSLock()

    init(sandboxId: String, scheme: String, plugin: SandboxPlugin) {
        self.sandboxId = sandboxId
        self.scheme = scheme
        self.plugin = plugin
    }

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

        // Serialise the request for the fetch event.
        // Rewrite the URL so it looks like a normal HTTP URL to the parent
        // (e.g. "sbx-abc123://app/index.html" -> "https://<sandboxId>.sandbox.native/index.html")
        // The JS side only cares about the pathname.
        var headers: [String: String] = [:]
        if let allHeaders = request.allHTTPHeaderFields {
            headers = allHeaders
        }

        var bodyBase64: String? = nil
        if let bodyData = request.httpBody {
            bodyBase64 = bodyData.base64EncodedString()
        }

        let path = url.path.isEmpty ? "/" : url.path
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
        // Remove the task from pending — JS response will be ignored if it arrives later.
        lock.lock()
        let removed = pendingTasks.first(where: { $0.value === urlSchemeTask })
        if let key = removed?.key {
            pendingTasks.removeValue(forKey: key)
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
            return
        }
        lock.unlock()

        // Decode the base64 body.
        var bodyData: Data? = nil
        if let b64 = bodyBase64 {
            bodyData = Data(base64Encoded: b64)
        }

        // Build the response.
        // Use the task's original URL for the response.
        let responseURL = task.request.url ?? URL(string: "\(scheme)://app/")!
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

    /// Cancel all pending tasks (called on destroy).
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
