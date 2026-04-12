import UIKit
import Capacitor
import WebKit

class DittoBridgeViewController: CAPBridgeViewController {

    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let config = super.webViewConfiguration(for: instanceConfiguration)

        // Register the sandbox scheme handler on the main WKWebView.
        // Iframes with src="sbx://<sandbox-id>/..." will be intercepted here,
        // giving each sandbox-id its own web origin for localStorage isolation.
        CAPLog.print("⚡️  [DittoBridgeVC] webViewConfiguration — registering sbx scheme handler")
        let handler = IframeSandboxSchemeHandler()
        config.setURLSchemeHandler(handler, forURLScheme: "sbx")
        SandboxPlugin.sharedSchemeHandler = handler
        CAPLog.print("⚡️  [DittoBridgeVC] webViewConfiguration — sbx scheme handler registered, sharedSchemeHandler set")

        return config
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        CAPLog.print("⚡️  [DittoBridgeVC] capacitorDidLoad — webView=\(webView == nil ? "nil" : "present")")
        CAPLog.print("⚡️  [DittoBridgeVC] capacitorDidLoad — sharedSchemeHandler=\(SandboxPlugin.sharedSchemeHandler == nil ? "nil" : "set"), plugin=\(SandboxPlugin.sharedSchemeHandler?.plugin == nil ? "nil" : "set")")
        webView?.allowsBackForwardNavigationGestures = true

        // Inject a diagnostic log into the JS console once the page loads,
        // so we can confirm the native side is alive in the same log stream.
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
            let handlerStatus = SandboxPlugin.sharedSchemeHandler == nil ? "nil" : "set"
            let pluginStatus = SandboxPlugin.sharedSchemeHandler?.plugin == nil ? "nil" : "set"
            let js = "console.log('[DittoBridgeVC-native] diagnostics: schemeHandler=\(handlerStatus), plugin=\(pluginStatus)');"
            self?.webView?.evaluateJavaScript(js, completionHandler: nil)
        }
    }
}
