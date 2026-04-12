import UIKit
import Capacitor
import WebKit

class DittoBridgeViewController: CAPBridgeViewController {

    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let config = super.webViewConfiguration(for: instanceConfiguration)

        // Register the sandbox scheme handler on the main WKWebView.
        // Iframes with src="sbx://<sandbox-id>/..." will be intercepted here,
        // giving each sandbox-id its own web origin for localStorage isolation.
        let handler = IframeSandboxSchemeHandler()
        config.setURLSchemeHandler(handler, forURLScheme: "sbx")
        SandboxPlugin.sharedSchemeHandler = handler

        return config
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        webView?.allowsBackForwardNavigationGestures = true
    }
}
