import UIKit
import Capacitor
import WebKit

class DittoBridgeViewController: CAPBridgeViewController {

    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let config = super.webViewConfiguration(for: instanceConfiguration)

        // Register the sandbox scheme handler on the main WKWebView.
        // Iframes with src="sbx://<sandbox-id>/..." will be intercepted here,
        // giving each sandbox-id its own web origin for localStorage isolation.
        Swift.print("⚡️  [DittoBridgeVC] webViewConfiguration — registering sbx scheme handler")
        let handler = IframeSandboxSchemeHandler()
        config.setURLSchemeHandler(handler, forURLScheme: "sbx")
        SandboxPlugin.sharedSchemeHandler = handler
        Swift.print("⚡️  [DittoBridgeVC] webViewConfiguration — sbx scheme handler registered, sharedSchemeHandler set")

        return config
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        let handlerStatus = SandboxPlugin.sharedSchemeHandler == nil ? "nil" : "set"
        let pluginStatus = SandboxPlugin.sharedSchemeHandler?.plugin == nil ? "nil" : "set"
        Swift.print("⚡️  [DittoBridgeVC] capacitorDidLoad — webView=\(webView == nil ? "nil" : "present"), schemeHandler=\(handlerStatus), plugin=\(pluginStatus)")
        webView?.allowsBackForwardNavigationGestures = true

        // Inject a diagnostic log into the WKWebView's JS console so it
        // appears in the Capacitor log stream visible in Xcode.
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
            let h = SandboxPlugin.sharedSchemeHandler == nil ? "nil" : "set"
            let p = SandboxPlugin.sharedSchemeHandler?.plugin == nil ? "nil" : "set"
            let js = "console.log('[DittoBridgeVC-native] diagnostics — schemeHandler=\(h), plugin=\(p)');"
            self?.webView?.evaluateJavaScript(js) { _, error in
                if let error = error {
                    Swift.print("⚡️  [DittoBridgeVC] evaluateJavaScript failed: \(error)")
                }
            }
        }
    }
}
