package pub.ditto.app;

import android.util.Base64;
import android.util.Log;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

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
 * Capacitor plugin that intercepts requests from sandbox iframes in the
 * main Capacitor WebView.
 *
 * On Android, each sandbox iframe loads from
 * {@code https://<sandbox-id>.sandbox.native/path}. A custom
 * {@link BridgeWebViewClient} subclass intercepts these requests via
 * {@code shouldInterceptRequest}, forwards them to the JS layer as "fetch"
 * events, and blocks the WebView IO thread until JS responds with
 * {@code respondToFetch()}.
 *
 * Each unique hostname is a different web origin, so localStorage / IndexedDB
 * are fully isolated per sandbox — no separate WebView instances needed.
 */
@CapacitorPlugin(name = "SandboxPlugin")
public class SandboxPlugin extends Plugin {

    private static final String TAG = "SandboxPlugin";

    /** Pending requests waiting for JS to respond. */
    private final ConcurrentHashMap<String, PendingRequest> pendingRequests = new ConcurrentHashMap<>();

    @Override
    public void load() {
        // Replace the main WebView's client with our subclass that intercepts
        // sandbox iframe requests.
        Bridge bridge = getBridge();
        bridge.setWebViewClient(new SandboxBridgeWebViewClient(bridge, this));
    }

    @PluginMethod
    public void respondToFetch(PluginCall call) {
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

        PendingRequest pending = pendingRequests.remove(requestId);
        if (pending == null) {
            call.resolve();
            return;
        }

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

        WebResourceResponse webResponse = new WebResourceResponse(
                contentType, encoding, status, statusText, headers, body
        );

        pending.resolve(webResponse);
        call.resolve();
    }

    void emitFetchRequest(String sandboxId, String requestId, JSObject request) {
        JSObject data = new JSObject();
        data.put("id", sandboxId);
        data.put("requestId", requestId);
        data.put("request", request);
        notifyListeners("fetch", data);
    }

    // -------------------------------------------------------------------------
    // Custom BridgeWebViewClient that intercepts sandbox iframe requests
    // -------------------------------------------------------------------------

    /**
     * Extends Capacitor's BridgeWebViewClient to additionally intercept
     * requests from sandbox iframes (URLs matching *.sandbox.native).
     */
    private static class SandboxBridgeWebViewClient extends BridgeWebViewClient {
        private final SandboxPlugin plugin;

        SandboxBridgeWebViewClient(Bridge bridge, SandboxPlugin plugin) {
            super(bridge);
            this.plugin = plugin;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            String host = request.getUrl().getHost();

            // Intercept requests to *.sandbox.native (from sandbox iframes).
            if (host != null && host.endsWith(".sandbox.native")) {
                return handleSandboxRequest(request, host);
            }

            // Everything else: delegate to Capacitor's default handling.
            return super.shouldInterceptRequest(view, request);
        }

        private WebResourceResponse handleSandboxRequest(WebResourceRequest request, String host) {
            // Extract sandbox ID from the hostname (e.g. "abc123.sandbox.native" -> "abc123").
            String sandboxId = host.replace(".sandbox.native", "");

            String requestId = UUID.randomUUID().toString();
            PendingRequest pending = new PendingRequest();
            plugin.pendingRequests.put(requestId, pending);

            // Serialise the request for the JS layer.
            String path = request.getUrl().getPath();
            if (path == null || path.isEmpty()) path = "/";
            String rewrittenURL = "https://" + sandboxId + ".sandbox.native" + path;

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
            plugin.emitFetchRequest(sandboxId, requestId, serialisedRequest);

            // Block until JS responds. The WebView IO thread pool has ~6
            // threads; pre-fetching blobs in JS before setting the iframe src
            // ensures this blocking time is minimal (cache hits).
            WebResourceResponse response = pending.awaitResponse(60000);

            if (response != null) {
                return response;
            }

            // Timeout — return error response.
            plugin.pendingRequests.remove(requestId);
            return new WebResourceResponse(
                    "text/plain", "UTF-8", 504,
                    "Gateway Timeout", new HashMap<>(),
                    new ByteArrayInputStream("Request timed out".getBytes())
            );
        }
    }

    // -------------------------------------------------------------------------
    // Pending request helper
    // -------------------------------------------------------------------------

    /**
     * A pending request that blocks the WebView IO thread until JS responds.
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
