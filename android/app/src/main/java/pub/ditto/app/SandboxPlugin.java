package pub.ditto.app;

import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.coordinatorlayout.widget.CoordinatorLayout;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Capacitor plugin that creates isolated Android WebViews for sandboxed content.
 *
 * Each sandbox uses shouldInterceptRequest to intercept all requests and forward
 * them to the JS layer as fetch events — the same protocol iframe.diy uses.
 * The React code can serve files identically regardless of platform.
 */
@CapacitorPlugin(name = "SandboxPlugin")
public class SandboxPlugin extends Plugin {

    private static final String TAG = "SandboxPlugin";
    private final Map<String, SandboxInstance> sandboxes = new HashMap<>();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void create(PluginCall call) {
        String sandboxId = call.getString("id");
        if (sandboxId == null) {
            call.reject("Missing required parameter: id");
            return;
        }

        JSObject frame = call.getObject("frame");
        if (frame == null) {
            call.reject("Missing required parameter: frame");
            return;
        }

        int x = frame.optInt("x", 0);
        int y = frame.optInt("y", 0);
        int width = frame.optInt("width", 0);
        int height = frame.optInt("height", 0);

        if (sandboxes.containsKey(sandboxId)) {
            call.reject("Sandbox already exists: " + sandboxId);
            return;
        }

        float density = getActivity().getResources().getDisplayMetrics().density;
        int pxX = Math.round(x * density);
        int pxY = Math.round(y * density);
        int pxWidth = Math.round(width * density);
        int pxHeight = Math.round(height * density);

        mainHandler.post(() -> {
            SandboxInstance sandbox = new SandboxInstance(sandboxId, this);
            sandboxes.put(sandboxId, sandbox);

            // Add the WebView on top of the Capacitor WebView.
            // The parent is a CoordinatorLayout — using the wrong LayoutParams
            // type causes a ClassCastException when it intercepts touch events.
            View capWebView = getBridge().getWebView();
            ViewGroup parent = (ViewGroup) capWebView.getParent();
            CoordinatorLayout.LayoutParams params = new CoordinatorLayout.LayoutParams(pxWidth, pxHeight);
            params.leftMargin = pxX;
            params.topMargin = pxY;
            parent.addView(sandbox.webView, params);

            // Load the initial page.
            sandbox.webView.loadUrl("https://" + sandboxId + ".sandbox.native/index.html");

            call.resolve();
        });
    }

    @PluginMethod
    public void updateFrame(PluginCall call) {
        String sandboxId = call.getString("id");
        if (sandboxId == null) {
            call.reject("Missing required parameter: id");
            return;
        }

        JSObject frame = call.getObject("frame");
        if (frame == null) {
            call.reject("Missing required parameter: frame");
            return;
        }

        int x = frame.optInt("x", 0);
        int y = frame.optInt("y", 0);
        int width = frame.optInt("width", 0);
        int height = frame.optInt("height", 0);

        float density = getActivity().getResources().getDisplayMetrics().density;
        int pxX = Math.round(x * density);
        int pxY = Math.round(y * density);
        int pxWidth = Math.round(width * density);
        int pxHeight = Math.round(height * density);

        mainHandler.post(() -> {
            SandboxInstance sandbox = sandboxes.get(sandboxId);
            if (sandbox == null) {
                call.reject("Sandbox not found: " + sandboxId);
                return;
            }

            CoordinatorLayout.LayoutParams params = new CoordinatorLayout.LayoutParams(pxWidth, pxHeight);
            params.leftMargin = pxX;
            params.topMargin = pxY;
            sandbox.webView.setLayoutParams(params);

            call.resolve();
        });
    }

    @PluginMethod
    public void respondToFetch(PluginCall call) {
        String sandboxId = call.getString("id");
        if (sandboxId == null) {
            call.reject("Missing required parameter: id");
            return;
        }
        String requestId = call.getString("requestId");
        if (requestId == null) {
            call.reject("Missing required parameter: requestId");
            return;
        }
        JSObject response = call.getObject("response");
        if (response == null) {
            call.reject("Missing required parameter: response");
            return;
        }

        SandboxInstance sandbox = sandboxes.get(sandboxId);
        if (sandbox == null) {
            call.reject("Sandbox not found: " + sandboxId);
            return;
        }

        int status = response.optInt("status", 200);
        String statusText = response.optString("statusText", "OK");
        String bodyBase64 = response.optString("body", null);

        Map<String, String> headers = new HashMap<>();
        JSONObject headersObj = response.optJSONObject("headers");
        if (headersObj != null) {
            for (java.util.Iterator<String> it = headersObj.keys(); it.hasNext(); ) {
                String key = it.next();
                headers.put(key, headersObj.optString(key));
            }
        }

        sandbox.resolveRequest(requestId, status, statusText, headers, bodyBase64);

        call.resolve();
    }

    @PluginMethod
    public void postMessage(PluginCall call) {
        String sandboxId = call.getString("id");
        if (sandboxId == null) {
            call.reject("Missing required parameter: id");
            return;
        }
        JSObject message = call.getObject("message");
        if (message == null) {
            call.reject("Missing required parameter: message");
            return;
        }

        SandboxInstance sandbox = sandboxes.get(sandboxId);
        if (sandbox == null) {
            call.reject("Sandbox not found: " + sandboxId);
            return;
        }

        mainHandler.post(() -> sandbox.postMessageToWebView(message.toString()));

        call.resolve();
    }

    @PluginMethod
    public void destroy(PluginCall call) {
        String sandboxId = call.getString("id");
        if (sandboxId == null) {
            call.reject("Missing required parameter: id");
            return;
        }

        mainHandler.post(() -> {
            SandboxInstance sandbox = sandboxes.remove(sandboxId);
            if (sandbox != null) {
                ViewGroup parent = (ViewGroup) sandbox.webView.getParent();
                if (parent != null) {
                    parent.removeView(sandbox.webView);
                }
                sandbox.webView.destroy();
            }
            call.resolve();
        });
    }

    void emitFetchRequest(String sandboxId, String requestId, JSObject request) {
        JSObject data = new JSObject();
        data.put("id", sandboxId);
        data.put("requestId", requestId);
        data.put("request", request);
        notifyListeners("fetch", data);
    }

    void emitScriptMessage(String sandboxId, JSObject message) {
        JSObject data = new JSObject();
        data.put("id", sandboxId);
        data.put("message", message);
        notifyListeners("scriptMessage", data);
    }

    /**
     * A single sandboxed WebView instance.
     */
    private static class SandboxInstance {
        final String id;
        final WebView webView;
        final SandboxPlugin plugin;
        private final ConcurrentHashMap<String, PendingRequest> pendingRequests = new ConcurrentHashMap<>();

        SandboxInstance(String id, SandboxPlugin plugin) {
            this.id = id;
            this.plugin = plugin;
            this.webView = new WebView(plugin.getActivity());

            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(false);
            settings.setDatabaseEnabled(true);

            webView.setBackgroundColor(Color.WHITE);

            // Add JavaScript interface for script->native communication.
            webView.addJavascriptInterface(new SandboxBridge(this), "__sandboxNative");

            // Inject the bridge script and intercept requests.
            webView.setWebViewClient(new SandboxWebViewClient(this));
        }

        void postMessageToWebView(String jsonString) {
            String js = "(function() { " +
                    "if (window.__sandboxBridge && window.__sandboxBridge.onMessage) { " +
                    "window.__sandboxBridge.onMessage(" + jsonString + "); " +
                    "} " +
                    "})();";
            webView.evaluateJavascript(js, null);
        }

        void resolveRequest(String requestId, int status, String statusText,
                            Map<String, String> headers, String bodyBase64) {
            PendingRequest pending = pendingRequests.remove(requestId);
            if (pending == null) return;

            byte[] bodyBytes = null;
            if (bodyBase64 != null && !bodyBase64.equals("null")) {
                try {
                    bodyBytes = Base64.decode(bodyBase64, Base64.DEFAULT);
                } catch (Exception e) {
                    Log.w(TAG, "Base64 decode failed for request " + requestId, e);
                }
            }

            String contentType = headers.getOrDefault("Content-Type", "application/octet-stream");
            String encoding = contentType.contains("text/") ? "UTF-8" : null;

            InputStream body = bodyBytes != null
                    ? new ByteArrayInputStream(bodyBytes)
                    : new ByteArrayInputStream(new byte[0]);

            WebResourceResponse response = new WebResourceResponse(
                    contentType, encoding, status, statusText, headers, body
            );

            pending.resolve(response);
        }
    }

    /**
     * WebViewClient that intercepts all requests and forwards them to JS.
     */
    private static class SandboxWebViewClient extends WebViewClient {
        private final SandboxInstance sandbox;
        private boolean bridgeInjected = false;

        SandboxWebViewClient(SandboxInstance sandbox) {
            this.sandbox = sandbox;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            String url = request.getUrl().toString();

            // Only intercept requests to the sandbox domain.
            if (!url.contains(".sandbox.native")) {
                return null;
            }

            String requestId = UUID.randomUUID().toString();

            // Create a pending request with a blocking latch.
            PendingRequest pending = new PendingRequest();
            sandbox.pendingRequests.put(requestId, pending);

            // Rewrite URL to include the sandbox ID for the JS handler.
            String path = request.getUrl().getPath();
            if (path == null || path.isEmpty()) path = "/";
            String rewrittenURL = "https://" + sandbox.id + ".sandbox.native" + path;

            // Serialise the request.
            JSObject serialisedRequest = new JSObject();
            serialisedRequest.put("url", rewrittenURL);
            serialisedRequest.put("method", request.getMethod());

            JSObject headers = new JSObject();
            for (Map.Entry<String, String> entry : request.getRequestHeaders().entrySet()) {
                headers.put(entry.getKey(), entry.getValue());
            }
            serialisedRequest.put("headers", headers);
            serialisedRequest.put("body", JSONObject.NULL);

            // Emit to JS.
            sandbox.plugin.emitFetchRequest(sandbox.id, requestId, serialisedRequest);

            // Block this thread until JS responds (with a timeout).
            WebResourceResponse response = pending.awaitResponse(10000);

            if (response != null) {
                return response;
            }

            // Timeout — return error response.
            sandbox.pendingRequests.remove(requestId);
            return new WebResourceResponse(
                    "text/plain", "UTF-8", 504,
                    "Gateway Timeout", new HashMap<>(),
                    new ByteArrayInputStream("Request timed out".getBytes())
            );
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);

            if (!bridgeInjected) {
                bridgeInjected = true;
                view.evaluateJavascript(getBridgeScript(), null);
            }
        }

        private String getBridgeScript() {
            return "(function() {" +
                    "'use strict';" +
                    "var messageListeners = [];" +
                    "window.__sandboxBridge = {" +
                    "  onMessage: function(data) {" +
                    "    var event = {" +
                    "      data: data," +
                    "      origin: 'https://" + sandbox.id + ".sandbox.native'," +
                    "      source: window.parent," +
                    "      type: 'message'" +
                    "    };" +
                    "    for (var i = 0; i < messageListeners.length; i++) {" +
                    "      try { messageListeners[i](event); } catch(e) {}" +
                    "    }" +
                    "  }" +
                    "};" +
                    "var origAdd = window.addEventListener;" +
                    "window.addEventListener = function(type, fn, opts) {" +
                    "  if (type === 'message' && typeof fn === 'function') messageListeners.push(fn);" +
                    "  return origAdd.call(window, type, fn, opts);" +
                    "};" +
                    "var origRemove = window.removeEventListener;" +
                    "window.removeEventListener = function(type, fn, opts) {" +
                    "  if (type === 'message') {" +
                    "    var idx = messageListeners.indexOf(fn);" +
                    "    if (idx !== -1) messageListeners.splice(idx, 1);" +
                    "  }" +
                    "  return origRemove.call(window, type, fn, opts);" +
                    "};" +
                    "if (!window.parent || window.parent === window) window.parent = {};" +
                    "window.parent.postMessage = function(data) {" +
                    "  if (data && typeof data === 'object' && data.jsonrpc === '2.0') {" +
                    "    try { window.__sandboxNative.postMessage(JSON.stringify(data)); } catch(e) {}" +
                    "  }" +
                    "};" +
                    "})();";
        }
    }

    /**
     * JavaScript interface exposed to the sandbox WebView.
     */
    private static class SandboxBridge {
        private final SandboxInstance sandbox;

        SandboxBridge(SandboxInstance sandbox) {
            this.sandbox = sandbox;
        }

        @JavascriptInterface
        public void postMessage(String json) {
            try {
                JSONObject obj = new JSONObject(json);
                JSObject jsObj = new JSObject();
                for (java.util.Iterator<String> it = obj.keys(); it.hasNext(); ) {
                    String key = it.next();
                    jsObj.put(key, obj.get(key));
                }
                sandbox.plugin.emitScriptMessage(sandbox.id, jsObj);
            } catch (JSONException e) {
                Log.w(TAG, "Failed to parse script message", e);
            }
        }
    }

    /**
     * A pending request that blocks the WebViewClient thread until resolved.
     */
    private static class PendingRequest {
        private WebResourceResponse response;
        private final java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(1);

        void resolve(WebResourceResponse response) {
            this.response = response;
            latch.countDown();
        }

        WebResourceResponse awaitResponse(long timeoutMs) {
            try {
                latch.await(timeoutMs, java.util.concurrent.TimeUnit.MILLISECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return response;
        }
    }
}
