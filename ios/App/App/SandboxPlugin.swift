import Foundation
import Capacitor
import WebKit

// MARK: - Asset Handler Swizzling

/// On iOS, Capacitor registers a single `WebViewAssetHandler` for the
/// `capacitor://` scheme. WKWebView only invokes `WKURLSchemeHandler` for
/// requests whose scheme matches one registered on the configuration —
/// and it does NOT invoke handlers for cross-scheme iframe loads.
///
/// Since `iosScheme: 'https'` in capacitor.config.ts is normalised to
/// `capacitor://` by Capacitor (because `https` is a built-in scheme),
/// sandbox iframes must also use the `capacitor://` scheme to be
/// intercepted by the handler.
///
/// We swizzle `WebViewAssetHandler.webView(_:start:)` at runtime to
/// intercept requests whose hostname ends with `.sandbox.local`, forwarding
/// them to the JS layer for resolution. All other requests pass through to
/// the original Capacitor implementation.
///
/// Sandbox iframes load from `capacitor://<sandbox-id>.sandbox.local/path`.
/// Each hostname is a different web origin, giving full localStorage /
/// IndexedDB / cookie isolation per sandbox.
private let sandboxHostSuffix = ".sandbox.local"

/// The sandbox request handler singleton, set up by the plugin.
private var _sandboxHandler: SandboxRequestHandler?

/// Original IMP of `WebViewAssetHandler.webView(_:start:)`.
private var _originalStartIMP: IMP?
/// Original IMP of `WebViewAssetHandler.webView(_:stop:)`.
private var _originalStopIMP: IMP?

/// ObjC selectors for `WKURLSchemeHandler` methods on `WebViewAssetHandler`.
private let startSelector = Selector(("webView:startURLSchemeTask:"))
private let stopSelector  = Selector(("webView:stopURLSchemeTask:"))

/// Swizzled replacement for `webView(_:start:)`.
/// If the request targets `*.sandbox.local`, route it to JS. Otherwise call
/// the original Capacitor implementation.
private let swizzledStart: @convention(block) (AnyObject, WKWebView, WKURLSchemeTask) -> Void = { selfObj, webView, task in
    if let url = task.request.url,
       let host = url.host,
       host.hasSuffix(sandboxHostSuffix) {
        _sandboxHandler?.handleStart(webView: webView, urlSchemeTask: task)
        return
    }
    // Call the original Capacitor implementation.
    typealias OriginalFunc = @convention(c) (AnyObject, Selector, WKWebView, WKURLSchemeTask) -> Void
    let original = unsafeBitCast(_originalStartIMP!, to: OriginalFunc.self)
    original(selfObj, startSelector, webView, task)
}

/// Swizzled replacement for `webView(_:stop:)`.
private let swizzledStop: @convention(block) (AnyObject, WKWebView, WKURLSchemeTask) -> Void = { selfObj, webView, task in
    if let url = task.request.url,
       let host = url.host,
       host.hasSuffix(sandboxHostSuffix) {
        _sandboxHandler?.handleStop(urlSchemeTask: task)
        return
    }
    typealias OriginalFunc = @convention(c) (AnyObject, Selector, WKWebView, WKURLSchemeTask) -> Void
    let original = unsafeBitCast(_originalStopIMP!, to: OriginalFunc.self)
    original(selfObj, stopSelector, webView, task)
}

/// Install the swizzle on `WebViewAssetHandler` (idempotent).
private func installAssetHandlerSwizzle() {
    guard _originalStartIMP == nil else { return }

    let cls: AnyClass = WebViewAssetHandler.self

    guard let startMethod = class_getInstanceMethod(cls, startSelector),
          let stopMethod  = class_getInstanceMethod(cls, stopSelector) else {
        return
    }

    _originalStartIMP = method_getImplementation(startMethod)
    _originalStopIMP  = method_getImplementation(stopMethod)

    method_setImplementation(startMethod, imp_implementationWithBlock(swizzledStart))
    method_setImplementation(stopMethod, imp_implementationWithBlock(swizzledStop))
}

// MARK: - Sandbox Request Handler

/// Handles sandbox iframe requests intercepted via the swizzled asset handler.
/// Forwards requests to the JS layer and resolves responses back to WKWebView.
class SandboxRequestHandler {
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

    func handleStart(webView: WKWebView, urlSchemeTask: WKURLSchemeTask) {
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

        // Extract the sandbox ID: "<sandbox-id>.sandbox.local" -> "<sandbox-id>"
        let host = url.host ?? "unknown"
        let sandboxId = String(host.dropLast(sandboxHostSuffix.count))

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

        plugin?.emitFetchRequest(
            sandboxId: sandboxId,
            requestId: requestId,
            request: serialisedRequest
        )
    }

    func handleStop(urlSchemeTask: WKURLSchemeTask) {
        lock.lock()
        let removed = pendingTasks.first(where: { $0.value === urlSchemeTask })
        if let key = removed?.key {
            pendingTasks.removeValue(forKey: key)
        }
        lock.unlock()
    }

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

        let responseURL = task.request.url ?? URL(string: "capacitor://unknown.sandbox.local/")!
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

/// Capacitor plugin that handles sandbox fetch responses.
///
/// On iOS, sandbox iframes use the same `capacitor://` scheme as the parent
/// app but with `*.sandbox.local` hostnames. Requests are intercepted by
/// swizzling Capacitor's `WebViewAssetHandler` and forwarded to the JS layer.
///
/// On Android, a custom `BridgeWebViewClient` subclass intercepts requests to
/// `*.sandbox.native` hostnames.
@objc(SandboxPlugin)
public class SandboxPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SandboxPlugin"
    public let jsName = "SandboxPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "respondToFetch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "diagnose", returnType: CAPPluginReturnPromise),
    ]

    public override func load() {
        // Install the swizzle and create the handler.
        let handler = SandboxRequestHandler()
        handler.plugin = self
        _sandboxHandler = handler
        installAssetHandlerSwizzle()
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
        let hasHandler = handler != nil
        let hasPlugin = handler?.plugin != nil
        let hasBridgeWebView = bridge?.webView != nil
        let hasListenersFetch = hasListeners("fetch")
        let pendingCount = handler?.pendingTaskCount ?? 0
        let swizzled = _originalStartIMP != nil

        call.resolve([
            "sandboxHandlerSet": hasHandler,
            "pluginConnected": hasPlugin,
            "bridgeHasWebView": hasBridgeWebView,
            "hasListenersFetch": hasListenersFetch,
            "pendingTaskCount": pendingCount,
            "swizzleInstalled": swizzled,
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
