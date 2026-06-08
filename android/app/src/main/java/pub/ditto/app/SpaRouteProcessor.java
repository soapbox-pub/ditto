package pub.ditto.app;

import android.content.Context;
import android.content.res.AssetManager;

import com.getcapacitor.ProcessedRoute;
import com.getcapacitor.RouteProcessor;

import java.io.IOException;
import java.io.InputStream;

/**
 * Rewrites client-side (SPA) routes to {@code /index.html} so React Router can
 * handle them.
 *
 * <p>Capacitor's {@code WebViewLocalServer} only falls back to {@code index.html}
 * when the final path segment contains no {@code .} (period). A NIP-05 route such
 * as {@code /alex@gleasonator.com} ends in {@code .com}, so Capacitor treats it as
 * a static file request, fails to find the asset, and the WebView reports
 * {@code net::ERR_INVALID_RESPONSE} instead of letting the SPA render a page.
 *
 * <p>This processor is consulted for every asset request. Real bundled assets
 * (anything that exists under {@code public/}) are served unchanged; any other
 * path is rewritten to {@code /index.html} so the SPA boots at that route.
 */
public class SpaRouteProcessor implements RouteProcessor {

    /** Asset directory Capacitor serves the web build from. */
    private static final String ASSET_BASE = "public";

    private final AssetManager assets;

    public SpaRouteProcessor(Context context) {
        this.assets = context.getAssets();
    }

    @Override
    public ProcessedRoute process(String basePath, String path) {
        ProcessedRoute route = new ProcessedRoute();
        route.setAsset(true);

        String normalized = (path == null || path.isEmpty()) ? "/" : path;

        // The root and any path that resolves to a real bundled asset are served
        // as-is. Everything else is a client-side route → serve the SPA shell.
        String resolved;
        if ("/".equals(normalized) || assetExists(normalized)) {
            resolved = normalized;
        } else {
            resolved = "/index.html";
        }

        // Capacitor consumes the returned path inconsistently: for normal asset
        // requests it prepends the asset base itself (passing basePath="" here),
        // but for the root "/" and html5mode fallbacks it opens getPath()
        // directly (passing basePath="public"). Prepending the supplied basePath
        // satisfies both — without it, the root load fails with
        // net::ERR_CONNECTION_REFUSED ("localhost refused to connect").
        route.setPath(basePath + resolved);

        return route;
    }

    /**
     * Returns true if {@code path} (relative to the served asset root) maps to a
     * real file in the APK's bundled assets. Querying the {@link AssetManager}
     * directly is the only reliable way to tell a static asset apart from a
     * client-side route, since both can contain dots.
     */
    private boolean assetExists(String path) {
        String assetPath = ASSET_BASE + path;
        try (InputStream stream = assets.open(assetPath, AssetManager.ACCESS_RANDOM)) {
            return true;
        } catch (IOException e) {
            return false;
        }
    }
}
