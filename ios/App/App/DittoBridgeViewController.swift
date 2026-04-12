import UIKit
import Capacitor
import WebKit

class DittoBridgeViewController: CAPBridgeViewController {

    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let config = super.webViewConfiguration(for: instanceConfiguration)

        // Register the sandbox scheme handler on the main WKWebView.
        // Iframes with src="sbx://<sandbox-id>/..." will be intercepted here,
        // giving each sandbox-id its own web origin for localStorage isolation.
        NSLog("[DittoBridgeVC] webViewConfiguration — registering sbx scheme handler")
        let handler = IframeSandboxSchemeHandler()
        config.setURLSchemeHandler(handler, forURLScheme: "sbx")
        SandboxPlugin.sharedSchemeHandler = handler
        NSLog("[DittoBridgeVC] webViewConfiguration — sbx scheme handler registered, sharedSchemeHandler set")

        return config
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        NSLog("[DittoBridgeVC] capacitorDidLoad — webView=\(webView == nil ? "nil" : "present")")
        NSLog("[DittoBridgeVC] capacitorDidLoad — sharedSchemeHandler=\(SandboxPlugin.sharedSchemeHandler == nil ? "nil" : "set"), plugin=\(SandboxPlugin.sharedSchemeHandler?.plugin == nil ? "nil" : "set")")
        webView?.allowsBackForwardNavigationGestures = true
    }
}
