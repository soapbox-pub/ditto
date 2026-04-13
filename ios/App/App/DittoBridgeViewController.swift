import UIKit
import WebKit
import Capacitor

class DittoBridgeViewController: CAPBridgeViewController {

    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let config = super.webViewConfiguration(for: instanceConfiguration)

        // Register the sbx:// custom scheme handler BEFORE the WKWebView is
        // created. Each sandbox iframe loads from sbx://<sandbox-id>/path,
        // giving every sandbox a unique web origin with full storage isolation.
        let handler = SandboxRequestHandler()
        _sandboxHandler = handler
        config.setURLSchemeHandler(handler, forURLScheme: "sbx")

        return config
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        webView?.allowsBackForwardNavigationGestures = true
    }
}
