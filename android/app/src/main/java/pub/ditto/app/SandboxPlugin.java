package pub.ditto.app;

import android.graphics.Color;
import android.graphics.PorterDuff;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
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
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

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

            // Add the container (WebView + spinner overlay) on top of the
            // Capacitor WebView. The parent is a CoordinatorLayout — using
            // the wrong LayoutParams type causes a ClassCastException when
            // it intercepts touch events.
            View capWebView = getBridge().getWebView();
            ViewGroup parent = (ViewGroup) capWebView.getParent();
            CoordinatorLayout.LayoutParams params = new CoordinatorLayout.LayoutParams(pxWidth, pxHeight);
            params.leftMargin = pxX;
            params.topMargin = pxY;
            parent.addView(sandbox.container, params);

            // Load the initial page. The native spinner overlay sits on
            // top of the WebView and animates independently.
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
            sandbox.container.setLayoutParams(params);

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
                ViewGroup parent = (ViewGroup) sandbox.container.getParent();
                if (parent != null) {
                    parent.removeView(sandbox.container);
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
        /** Wrapper layout that holds the WebView and the loading overlay. */
        final FrameLayout container;
        final WebView webView;
        final SandboxPlugin plugin;
        private final ConcurrentHashMap<String, PendingRequest> pendingRequests = new ConcurrentHashMap<>();
        /** Native spinner overlay, shown while the sandbox content loads. */
        private ProgressBar spinner;

        SandboxInstance(String id, SandboxPlugin plugin) {
            this.id = id;
            this.plugin = plugin;

            this.container = new FrameLayout(plugin.getActivity());
            this.webView = new WebView(plugin.getActivity());

            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(false);
            settings.setDatabaseEnabled(true);

            webView.setBackgroundColor(Color.parseColor("#14161f"));

            // Add JavaScript interface for script->native communication.
            webView.addJavascriptInterface(new SandboxBridge(this), "__sandboxNative");

            // Inject the bridge script and intercept requests.
            webView.setWebViewClient(new SandboxWebViewClient(this));

            // Build the container: WebView fills it, spinner overlays on top.
            container.addView(webView, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT));

            // Native spinner overlay — uses the Android indeterminate
            // ProgressBar which animates on the render thread, so it keeps
            // spinning even when the main/IO threads are busy.
            spinner = new ProgressBar(plugin.getActivity());
            spinner.setIndeterminate(true);
            spinner.getIndeterminateDrawable().setColorFilter(
                    Color.parseColor("#7c5cdc"), PorterDuff.Mode.SRC_IN);
            FrameLayout.LayoutParams spinnerParams = new FrameLayout.LayoutParams(
                    dpToPx(plugin, 32), dpToPx(plugin, 32), Gravity.CENTER);
            container.addView(spinner, spinnerParams);

            // Dark background behind the spinner.
            View overlay = new View(plugin.getActivity());
            overlay.setBackgroundColor(Color.parseColor("#14161f"));
            // Insert the overlay between the WebView (index 0) and spinner (index 1)
            // so it covers the WebView but sits behind the spinner.
            container.addView(overlay, 1, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT));
        }

        /** Remove the native loading overlay. Safe to call multiple times. */
        void hideSpinner() {
            if (spinner != null) {
                // Remove spinner and overlay (indices 2 and 1 after WebView at 0).
                if (container.getChildCount() > 2) container.removeViewAt(2); // spinner
                if (container.getChildCount() > 1) container.removeViewAt(1); // overlay
                spinner = null;
            }
        }

        private static int dpToPx(SandboxPlugin plugin, int dp) {
            float density = plugin.getActivity().getResources().getDisplayMetrics().density;
            return Math.round(dp * density);
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

            // Block until JS responds. Each asset is fetched from a Blossom
            // server over the network, so we need a generous timeout.  The
            // WebView IO thread pool has ~6 threads; if all are blocked,
            // subsequent requests queue until a thread frees up.
            WebResourceResponse response = pending.awaitResponse(60000);

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

            // Remove the native spinner once the first page has finished
            // loading (all initial resources resolved). This runs on the
            // main thread, so the removal is safe.
            sandbox.hideSpinner();
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
     * A pending request that blocks the WebViewClient IO thread until JS
     * responds with the complete resource.
     */
    private static class PendingRequest {
        private volatile WebResourceResponse response;
        private final CountDownLatch latch = new CountDownLatch(1);

        void resolve(WebResourceResponse response) {
            this.response = response;
            latch.countDown();
        }

        WebResourceResponse awaitResponse(long timeoutMs) {
            try {
                latch.await(timeoutMs, TimeUnit.MILLISECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return response;
        }
    }
}
