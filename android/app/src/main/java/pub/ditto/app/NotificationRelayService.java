package pub.ditto.app;

import android.app.ForegroundServiceStartNotAllowedException;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.net.ConnectException;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

import javax.net.ssl.SSLHandshakeException;
import javax.net.ssl.SSLPeerUnverifiedException;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

/**
 * Foreground service that holds persistent WebSocket subscriptions to the
 * user's relays and turns incoming Nostr events into rich Android
 * notifications in real time.
 *
 * Architecture (modeled on Armada's NotificationRelayService):
 * - The filters are napp subscriptions handed over by the JS layer through
 *   {@link DittoNotificationPlugin#setSubscriptions} — the same ones Tenna and
 *   the nostr-push service watch. One always-open WebSocket per relay any
 *   subscription names, each with one live REQ carrying every filter aimed at
 *   that relay (plus {@code since}). Events arrive the moment a relay accepts
 *   them — no polling latency.
 * - OkHttp pingInterval keeps sockets alive through NATs and detects silent
 *   drops; failures reconnect with exponential backoff (1s → 5 min cap). A
 *   circuit breaker quarantines a relay after three failures in a row, over
 *   at least ten minutes, that retrying can't fix (DNS, refused/TLS, HTTP
 *   error, auth wall) until the network returns, the config changes, or the
 *   app comes forward.
 * - A network callback reconnects immediately when connectivity returns.
 * - Config changes (login/logout/relay or preference changes) reach the
 *   service via a SharedPreferences listener. Open sockets are kept and
 *   re-REQ'd only if their filters changed; an account switch starts over.
 * - Rich text needs context: the referenced event (for "reacted to your
 *   post: …" snippets and ownership checks) and the author's kind-0 profile
 *   (for the sender's name + avatar). Both resolve through one-shot REQs
 *   broadcast across all open relay sockets, with in-memory caches and
 *   in-flight de-duplication, capped by a 4s timeout so a notification is
 *   never blocked on a slow relay.
 * - Backfill after (re)connect is buffered until EOSE: small batches show
 *   individual rich notifications, large ones collapse into one summary.
 *
 * Android 15+ limits dataSync foreground services to ~6h/day in the
 * background. onTimeout() stops the service cleanly (avoiding the ANR) and
 * schedules a retry via BootReceiver; opening the app also restarts it.
 */
public class NotificationRelayService extends Service {

    private static final String TAG = "NotificationRelaySvc";
    private static final String CHANNEL_ID = "ditto_background_service";
    private static final int NOTIFICATION_ID = 1;
    private static final String PREFS_NAME = "ditto_notification_config";

    // Reconnect backoff bounds for relay connection failures.
    private static final long INITIAL_BACKOFF_MS = 1_000;
    private static final long MAX_BACKOFF_MS = 5 * 60 * 1_000;

    // A connection must survive this long before a subsequent failure resets
    // the backoff. Resetting in onOpen instead (the old behavior) meant a
    // relay that accepts the handshake but drops the socket right after
    // (auth-walled, overloaded, misbehaving proxy) reconnected every 1s
    // forever — a battery-melting hot loop while the phone sleeps.
    private static final long STABLE_CONNECTION_MS = 60_000;

    // A relay is quarantined only after this many permanent-looking failures
    // in a row (see classifyFailure) that have also kept failing for at least
    // QUARANTINE_AFTER_MS. The count alone isn't enough: with the backoff
    // starting at 1s, three strikes land within ~7s, so a relay refusing
    // connections through a restart would be written off until the app next
    // came forward. Ten minutes of failing is several retries at the growing
    // backoff, well past any restart.
    private static final int PERMANENT_FAILURE_THRESHOLD = 3;
    private static final long QUARANTINE_AFTER_MS = 10 * 60 * 1_000;

    // Referenced-event / profile lookups resolve with whatever arrived once
    // this timeout expires, so a slow relay can't hold a notification hostage.
    private static final long LOOKUP_TIMEOUT_MS = 4_000;

    // Backfill batches larger than this collapse into one summary notification.
    private static final int MAX_INDIVIDUAL_NOTIFICATIONS = 5;

    // Cap on backfill: newest N events when the service was offline for a while.
    private static final int BACKFILL_LIMIT = 50;

    // Memory caps for the long-lived dedupe/cache sets — the service can run
    // for days. When exceeded they reset; the persisted last-seen timestamp
    // still prevents old events from re-notifying.
    private static final int MAX_NOTIFIED_IDS = 2_000;
    private static final int MAX_CACHED_EVENTS = 500;

    // Rolling window of recent events fed to the flood detector. Big enough to
    // hold a burst's worth of copies (ECHO needs 3+, DENSITY 4+) so a live
    // singleton is judged against the crowd it arrived with, small enough that
    // the O(n) shape/merge pass stays cheap on every event.
    private static final int FLOOD_WINDOW = 300;

    // Live events arrive one at a time, so a crowd-based detector can only
    // confirm a flood retrospectively — by which point the burst's leading edge
    // (the first SWARM_MIN_AUTHORS-1 events, before the crowd is visible) has
    // already fired, and a native notification can't be un-fired. So candidate
    // events from senders the reader does NOT follow are held this long before
    // firing; as the rest of the burst arrives the buffer is re-checked (and
    // again at flush), so the whole wall folds before any of it alerts. Followed
    // senders skip the hold and fire instantly — they're trust-exempt anyway. A
    // backfill batch (reconnect) already arrives as a crowd, so it skips the
    // hold; iOS polls a batch and has no leading edge, so this is Android-only.
    private static final long STASIS_MS = 12_000;

    // The running service, for the app-foreground edge (see onAppForegrounded).
    private static volatile NotificationRelayService instance;

    private OkHttpClient httpClient;
    private NostrPoller poller;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private final List<RelayConnection> connections = new ArrayList<>();

    // Frames posted to the handler and not yet handled (profiling builds only).
    private final java.util.concurrent.atomic.AtomicInteger pendingFrames =
            new java.util.concurrent.atomic.AtomicInteger();

    // Config (from SharedPreferences, written by DittoNotificationPlugin).
    private String userPubkey;
    // Relay URL → the filters to REQ there, from every subscription naming it.
    private final Map<String, List<JSONObject>> relayFilters = new java.util.LinkedHashMap<>();
    // Full follow set — the flood detector's trust exemption (a followed
    // author's copy of a pitch is never folded), and the "only from people I
    // follow" re-check for when the filters had to go without `authors`.
    private final Set<String> follows = new HashSet<>();
    private boolean onlyFollowing = false;

    // Event ids already notified — dedupes across relays and reconnects.
    // Insertion-ordered so that at the cap the OLDEST ids are evicted one at a
    // time (rememberBoundedId), rather than the whole set being flushed — a
    // wholesale clear briefly reopens the door to re-notifying anything still
    // inside the `since` window whose id was just dropped.
    private final LinkedHashSet<String> notifiedIds = new LinkedHashSet<>();

    // Rolling window of recent events (any kind, pre-notification) so the
    // crowd-based flood detectors can see a burst even though live events
    // arrive one at a time. Raw events are kept so both detectors can read the
    // fields they need (reply flood reads content; mention swarm reads
    // created_at + p tags). Newest-appended; capped at FLOOD_WINDOW.
    private final java.util.ArrayDeque<JSONObject> recentEvents = new java.util.ArrayDeque<>();

    // Live candidate events from non-followed senders, held for STASIS_MS so the
    // crowd forms before any of them fires (see STASIS_MS). Flushed as one batch
    // through processBatch on a fixed cadence: the timer is armed by the FIRST
    // held event and NOT reset by later ones, so an unbroken stream still flushes
    // (and folds) instead of deferring forever, and any held event alerts within
    // STASIS_MS of arriving.
    private final List<JSONObject> stasisBuffer = new ArrayList<>();
    // Ids currently staged in stasisBuffer, so a duplicate cross-relay delivery
    // is dropped before it splits one burst across two flush windows.
    private final Set<String> stasisBufferIds = new HashSet<>();
    private boolean stasisScheduled = false;
    private final Runnable flushStasisRunnable = this::flushStasis;

    // Referenced-event cache: id → event (the user's own posts, typically).
    private final Map<String, JSONObject> eventCache = new HashMap<>();
    private final List<EventLookup> pendingEventLookups = new ArrayList<>();

    // Profile cache: pubkey → parsed kind-0. `pendingProfiles` coalesces
    // concurrent lookups for the same author; `bestProfile` keeps the newest
    // kind-0 seen across relays while a lookup is in flight.
    private final Map<String, Profile> profileCache = new HashMap<>();
    private final Map<String, List<ProfileCallback>> pendingProfiles = new HashMap<>();
    private final Map<String, Profile> bestProfile = new HashMap<>();

    private ConnectivityManager.NetworkCallback networkCallback;
    private SharedPreferences.OnSharedPreferenceChangeListener configListener;
    private final Runnable reloadConfigRunnable = this::loadConfigAndReconnect;

    // ── Small types ───────────────────────────────────────────────────────────

    private static final class Profile {
        final String name;    // display_name > name, possibly null
        final String picture; // possibly null
        final long ts;        // created_at, newest wins across relays

        Profile(String name, String picture, long ts) {
            this.name = name;
            this.picture = picture;
            this.ts = ts;
        }
    }

    private interface ProfileCallback {
        /** Always invoked on the main handler; profile may be null. */
        void onProfile(Profile profile);
    }

    /** One in-flight batch lookup of referenced events by id. */
    private static final class EventLookup {
        final Set<String> waiting;
        final Runnable done;
        boolean completed = false;

        EventLookup(Set<String> waiting, Runnable done) {
            this.waiting = waiting;
            this.done = done;
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();

        // Android 15+ enforces time limits on dataSync foreground services. If
        // the budget is already exhausted when we try to startForeground(),
        // the system throws and we stop gracefully; opening the app resets the
        // budget and restarts the service.
        try {
            startForeground(NOTIFICATION_ID, buildForegroundNotification());
        } catch (Exception e) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                    && e instanceof ForegroundServiceStartNotAllowedException) {
                Log.w(TAG, "Foreground service start not allowed (time limit exhausted), stopping.");
                stopSelf();
                return;
            }
            throw e; // re-throw unexpected exceptions
        }

        httpClient = new OkHttpClient.Builder()
                .connectTimeout(10, TimeUnit.SECONDS)
                // Keepalive pings serve two purposes: refreshing NAT mappings
                // (idle entries get silently evicted, zombifying the socket)
                // and dead-peer detection (a receive-only socket never learns
                // the other side vanished; a missed pong fails the connection
                // and triggers reconnect + since-cursor backfill).
                //
                // 3 minutes sits well inside typical carrier NAT TCP timeouts
                // (15-30 min) while waking the radio ~6x less than the
                // conventional 30s. Worst case a socket dies right after a
                // pong and detection lags one interval — notifications arrive
                // a few minutes late, never lost.
                .pingInterval(3, TimeUnit.MINUTES)
                .build();

        poller = new NostrPoller(this);

        registerNetworkCallback();
        registerConfigListener();
        instance = this;
    }

    /**
     * The app came to the foreground: give every quarantined relay one fresh
     * look. Called from {@link MainActivity#onResume}; only the transition
     * re-arms, so quarantine still holds for as long as the app stays away.
     */
    static void onAppForegrounded() {
        NotificationRelayService svc = instance;
        if (svc == null) return;
        svc.handler.post(() -> {
            for (RelayConnection rc : svc.connections) {
                if (rc.quarantined) rc.onFleetEdge();
            }
        });
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // onCreate gave up (dataSync budget exhausted) and already called
        // stopSelf, but onStartCommand still runs. Connecting here would
        // dereference the never-built httpClient and crash; a sticky restart
        // would then crash again on every retry.
        if (httpClient == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        loadConfigAndReconnect();
        return START_STICKY;
    }

    /**
     * Android 15+ calls this when the dataSync foreground-service time budget
     * runs out. We must stop promptly or the system crashes the process with
     * ForegroundServiceDidNotStopInTimeException. Schedule a retry through
     * BootReceiver — it succeeds once the budget resets (the user opens the
     * app) when the app is exempt from battery optimizations.
     */
    @Override
    public void onTimeout(int startId, int fgsType) {
        handleTimeout();
    }

    /**
     * The API 34 form. The system never calls it for dataSync (only the
     * two-argument one above, on Android 15+); overriding only this one is
     * what let the budget timeout crash the app.
     */
    @Override
    public void onTimeout(int startId) {
        handleTimeout();
    }

    private void handleTimeout() {
        Log.w(TAG, "dataSync time budget exhausted; stopping and scheduling retry");
        BootReceiver.scheduleRetry(this, 15 * 60 * 1_000);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (instance == this) instance = null;
        closeAllConnections();
        unregisterNetworkCallback();
        unregisterConfigListener();
        handler.removeCallbacksAndMessages(null);
        if (httpClient != null) {
            httpClient.dispatcher().executorService().shutdownNow();
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // ── Config ────────────────────────────────────────────────────────────────

    private void loadConfigAndReconnect() {
        long t = ServiceProfiler.begin("config.reload");
        try {
            loadConfigAndReconnectInner();
        } finally {
            ServiceProfiler.end("config.reload", t);
        }
    }

    private void loadConfigAndReconnectInner() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String previousPubkey = userPubkey;
        userPubkey = prefs.getString("userPubkey", null);

        follows.clear();
        follows.addAll(parseStringArray(prefs.getString("follows", null)));
        onlyFollowing = prefs.getBoolean("onlyFollowing", false);

        relayFilters.clear();
        String subscriptions = prefs.getString("subscriptions", null);
        if (subscriptions != null) {
            loadSubscriptions(subscriptions);
        } else {
            loadLegacyConfig(prefs);
        }

        if (userPubkey == null || relayFilters.isEmpty()) {
            Log.d(TAG, "No config (pubkey/subscriptions); disconnecting.");
            closeAllConnections();
            return;
        }

        // A different account starts over: nothing held for the last one
        // (sockets, held events, lookups) may carry across.
        if (previousPubkey != null && !previousPubkey.equals(userPubkey)) {
            ServiceProfiler.count("config.reload account switch");
            closeAllConnections();
        }

        // Otherwise reuse what's already there. Tearing every socket down on
        // each config change (a follow, a relay or preference edit) cost a TLS
        // handshake and a full backfill REQ per relay, and redialed relays
        // that were down straight out of their retry wait. Now an open socket
        // keeps going and gets a fresh REQ only if its filters changed; one
        // waiting out a backoff keeps its wait and picks the new filters up
        // when it connects; a quarantined one gets one fresh look, since the
        // change may be what fixes it.
        Map<String, RelayConnection> existing = new HashMap<>();
        for (RelayConnection rc : connections) existing.put(rc.relayUrl, rc);
        connections.clear();
        for (String url : relayFilters.keySet()) {
            RelayConnection rc = existing.remove(url);
            if (rc == null || rc.closed) {
                ServiceProfiler.count("config.reload new relay");
                rc = new RelayConnection(url);
                connections.add(rc);
                rc.connect();
                continue;
            }
            connections.add(rc);
            if (rc.quarantined) {
                ServiceProfiler.count("config.reload unquarantine");
                rc.onFleetEdge();
            } else if (rc.socketOpen && rc.ws != null
                    && !filterSignature(relayFilters.get(url)).equals(rc.reqSignature)) {
                ServiceProfiler.count("config.reload re-REQ");
                rc.sendMainReq(rc.ws);
            } else if (rc.ws == null && !rc.retryPending) {
                rc.connect();
            } else {
                ServiceProfiler.count("config.reload kept");
            }
        }
        // Relays the new config no longer names.
        for (RelayConnection gone : existing.values()) {
            ServiceProfiler.count("config.reload dropped relay");
            gone.close();
        }
    }

    /** Group the subscriptions' filters by the relays they name. */
    private void loadSubscriptions(String raw) {
        try {
            JSONArray subs = new JSONArray(raw);
            for (int i = 0; i < subs.length(); i++) {
                JSONObject sub = subs.optJSONObject(i);
                if (sub == null) continue;
                JSONArray filters = sub.optJSONArray("filters");
                JSONArray relays = sub.optJSONArray("relays");
                if (filters == null || relays == null) continue;
                for (int r = 0; r < relays.length(); r++) {
                    String url = relays.optString(r);
                    if (url.isEmpty()) continue;
                    List<JSONObject> list = relayFilters.get(url);
                    if (list == null) {
                        list = new ArrayList<>();
                        relayFilters.put(url, list);
                    }
                    for (int f = 0; f < filters.length(); f++) {
                        JSONObject filter = filters.optJSONObject(f);
                        if (filter != null) list.add(filter);
                    }
                }
            }
        } catch (JSONException e) {
            Log.w(TAG, "Unreadable subscriptions", e);
            relayFilters.clear();
        }
    }

    /**
     * The config an older build wrote — relays, kinds, and an optional authors
     * list — as the one filter it stood for. Lets persistent mode survive an
     * app update that restarts this service before the app is next opened and
     * hands over real subscriptions.
     */
    private void loadLegacyConfig(SharedPreferences prefs) {
        List<String> relays = parseStringArray(prefs.getString("relayUrls", null));
        List<Integer> kinds = parseIntArray(prefs.getString("enabledKinds", null));
        List<String> authors = parseStringArray(prefs.getString("authors", null));
        if (userPubkey == null || relays.isEmpty() || kinds.isEmpty()) return;
        try {
            JSONObject filter = new JSONObject();
            filter.put("kinds", new JSONArray(kinds));
            filter.put("#p", new JSONArray().put(userPubkey));
            if (!authors.isEmpty()) filter.put("authors", new JSONArray(authors));
            for (String url : new LinkedHashSet<>(relays)) {
                List<JSONObject> list = new ArrayList<>();
                list.add(filter);
                relayFilters.put(url, list);
            }
        } catch (JSONException e) {
            Log.w(TAG, "Unreadable legacy config", e);
        }
    }

    /** Sizes worth watching over a long-running window (profiling builds). */
    private Map<String, Long> profileGauges() {
        Map<String, Long> g = new java.util.LinkedHashMap<>();
        long open = 0, quarantined = 0, retrying = 0;
        for (RelayConnection rc : connections) {
            if (rc.socketOpen) open++;
            if (rc.quarantined) quarantined++;
            if (rc.retryPending) retrying++;
        }
        g.put("connections", (long) connections.size());
        g.put("openSockets", open);
        g.put("quarantined", quarantined);
        g.put("retryPending", retrying);
        g.put("notifiedIds", (long) notifiedIds.size());
        g.put("eventCache", (long) eventCache.size());
        g.put("profileCache", (long) profileCache.size());
        g.put("recentEvents", (long) recentEvents.size());
        g.put("stasisBuffer", (long) stasisBuffer.size());
        g.put("follows", (long) follows.size());
        g.put("handlerQueue", (long) pendingFrames.get());
        return g;
    }

    /**
     * Profiling builds answer {@code adb shell dumpsys activity service
     * pub.ditto.app.profile/pub.ditto.app.NotificationRelayService [reset]}
     * with the profile — readable with the app UI dead, which is the state
     * being measured. Gauges are read from the binder thread without the
     * handler's ordering; they are sizes, so a torn read is harmless.
     */
    @Override
    protected void dump(java.io.FileDescriptor fd, java.io.PrintWriter writer, String[] args) {
        if (!ServiceProfiler.ON) {
            super.dump(fd, writer, args);
            return;
        }
        if (args != null && java.util.Arrays.asList(args).contains("reset")) {
            ServiceProfiler.reset();
            writer.println("{\"reset\":true}");
            return;
        }
        try {
            writer.println(ServiceProfiler.snapshot(profileGauges()).toString(2));
        } catch (Exception e) {
            writer.println("{\"error\":\"" + e.getMessage() + "\"}");
        }
    }

    private void closeAllConnections() {
        if (ServiceProfiler.ON) ServiceProfiler.units("socket.closeAll", connections.size());
        for (RelayConnection rc : connections) {
            rc.close();
        }
        connections.clear();
        // Drop any held events: their cursor never advanced (they're only added
        // to the window at flush), so a fresh connection re-fetches them. This
        // also prevents a held event from a prior account firing after a switch.
        handler.removeCallbacks(flushStasisRunnable);
        stasisScheduled = false;
        stasisBuffer.clear();
        stasisBufferIds.clear();
        // Fail any in-flight lookups so their notifications still fire.
        for (EventLookup lookup : new ArrayList<>(pendingEventLookups)) {
            completeEventLookup(lookup);
        }
        for (String pubkey : new ArrayList<>(pendingProfiles.keySet())) {
            resolveProfile(pubkey, bestProfile.get(pubkey));
        }
    }

    // ── Per-relay connection ──────────────────────────────────────────────────

    private class RelayConnection {
        final String relayUrl;
        WebSocket ws;
        long backoffMs = INITIAL_BACKOFF_MS;
        boolean closed = false;
        // The current socket finished its handshake (main thread only).
        boolean socketOpen = false;

        // When the current connection attempt started (main thread only).
        // Used by endSession to distinguish "stable connection finally
        // died" (reset backoff) from "relay drops us right away" (keep growing).
        long connectAttemptAt = 0;

        // Circuit breaker (see endSession). Consecutive sessions that ended
        // permanent-given-conditions, and whether that tally tripped: a
        // quarantined relay holds no socket and schedules no retry until
        // onFleetEdge re-arms it. firstPermanentAt is when the current run of
        // permanent failures began (0 when there is none).
        int consecutivePermanent = 0;
        long firstPermanentAt = 0;
        boolean quarantined = false;
        // A reconnect is scheduled after a backoff delay; a config reload keeps
        // the wait instead of redialing (see loadConfigAndReconnect).
        boolean retryPending = false;

        // This session's main REQ came back CLOSED auth-required. The service
        // has no signer to answer NIP-42, so the socket can deliver nothing.
        boolean mainWalled = false;
        // This session delivered at least one event on the main subscription.
        boolean deliveredAnything = false;
        // The filters the main REQ was last sent with, to tell on a config
        // reload whether this socket needs a fresh REQ.
        String reqSignature = null;

        // Single pending reconnect, cancellable — prevents a queued reconnect
        // and the network callback from racing to open duplicate sockets.
        final Runnable reconnectRunnable = this::connect;

        // Live notification subscription.
        final String subMain = "dn-" + Long.toHexString(System.nanoTime());
        // Prefix for one-shot kind-0 profile lookups (sub id = prefix + pubkey).
        final String profilePrefix = "dp-" + Long.toHexString(System.nanoTime() + 1) + "-";
        // Prefix for one-shot referenced-event lookups (sub id = prefix + nonce).
        final String eventPrefix = "de-" + Long.toHexString(System.nanoTime() + 2) + "-";

        // Backfill buffering: events streamed before EOSE on subMain are
        // batched so a reconnect after hours offline doesn't buzz N times.
        final List<JSONObject> backfill = new ArrayList<>();
        boolean mainEosed = false;

        RelayConnection(String relayUrl) {
            this.relayUrl = relayUrl;
        }

        void connect() {
            // ws != null guard: a socket is already open (or opening). Without
            // it, a stale queued reconnect firing after the network callback
            // already reconnected would open a second socket and orphan the
            // first — leaked sockets keep pinging and re-failing forever.
            retryPending = false;
            if (closed || quarantined || ws != null || !isNetworkAvailable()) return;
            connectAttemptAt = System.currentTimeMillis();
            if (ServiceProfiler.ON) {
                ServiceProfiler.count("socket.connect");
                ServiceProfiler.count("socket.connect " + ServiceProfiler.host(relayUrl));
            }
            socketOpen = false;
            mainEosed = false;
            mainWalled = false;
            deliveredAnything = false;
            backfill.clear();
            Request request = new Request.Builder().url(relayUrl).build();
            ws = httpClient.newWebSocket(request, new WebSocketListener() {
                @Override
                public void onOpen(WebSocket webSocket, Response response) {
                    Log.d(TAG, "WS open: " + relayUrl);
                    ServiceProfiler.count("socket.open");
                    handler.post(() -> {
                        if (closed || webSocket != ws) return;
                        socketOpen = true;
                        sendMainReq(webSocket);
                    });
                }

                @Override
                public void onMessage(WebSocket webSocket, String text) {
                    if (ServiceProfiler.ON) {
                        String family = ServiceProfiler.frameFamily(text);
                        ServiceProfiler.units("frame.in " + family, text.length());
                        ServiceProfiler.units("frame.in " + family + " " + ServiceProfiler.host(relayUrl), text.length());
                        ServiceProfiler.units("frame.in bytes", text.length());
                        ServiceProfiler.peak("handler.queue", pendingFrames.incrementAndGet());
                        long posted = ServiceProfiler.now();
                        handler.post(() -> {
                            pendingFrames.decrementAndGet();
                            // How long the frame sat behind other main-looper work.
                            ServiceProfiler.elapsed("frame.wait", posted);
                            long t = ServiceProfiler.begin("frame.handle");
                            try {
                                onRelayMessage(text, RelayConnection.this);
                            } finally {
                                ServiceProfiler.end("frame.handle", t);
                            }
                        });
                        return;
                    }
                    handler.post(() -> onRelayMessage(text, RelayConnection.this));
                }

                @Override
                public void onFailure(WebSocket webSocket, Throwable t, Response response) {
                    // A non-101 upgrade carries its HTTP status in `response`; a
                    // real socket failure has none (code 0).
                    int httpCode = response != null ? response.code() : 0;
                    Log.w(TAG, "WS failure (" + relayUrl + "): " + t.getMessage()
                            + (httpCode != 0 ? " [HTTP " + httpCode + "]" : ""));
                    if (ServiceProfiler.ON) {
                        ServiceProfiler.count("socket.failure");
                        ServiceProfiler.count("socket.failure " + ServiceProfiler.host(relayUrl)
                                + " " + classifyFailure(t, httpCode));
                    }
                    handler.post(() -> endSession(webSocket, classifyFailure(t, httpCode)));
                }

                @Override
                public void onClosed(WebSocket webSocket, int code, String reason) {
                    ServiceProfiler.count("socket.closed");
                    handler.post(() -> endSession(webSocket, null));
                }
            });
        }

        void sendMainReq(WebSocket webSocket) {
            try {
                // Fresh main subscription (a REQ reusing the id replaces the old
                // one): its backfill buffers again until the new EOSE.
                mainEosed = false;
                backfill.clear();
                long lastSeen = poller.getLastSeenTimestamp();
                if (lastSeen == 0) {
                    // Cold start seeds the cursor to NOW, not a rewind: a fresh
                    // service (first launch, or after the persisted timestamp is
                    // lost) must never dump pre-launch history the user has
                    // already seen in-app. History is the WebView's job; this
                    // service only announces what arrives from now forward.
                    // Mirrors Armada's cold-start cursor (no backlog request).
                    lastSeen = System.currentTimeMillis() / 1000;
                    poller.setLastSeenTimestamp(lastSeen);
                }

                List<JSONObject> filters = relayFilters.get(relayUrl);
                if (filters == null || filters.isEmpty()) return;
                reqSignature = filterSignature(filters);

                JSONArray req = new JSONArray();
                req.put("REQ");
                req.put(subMain);
                for (JSONObject source : filters) {
                    // Copy: the stored filter is shared across reconnects.
                    JSONObject filter = new JSONObject(source.toString());
                    // A filter's own `since` is honoured when it is later, as napp does.
                    filter.put("since", Math.max(lastSeen + 1, source.optLong("since", 0)));
                    filter.put("limit", BACKFILL_LIMIT);
                    req.put(filter);
                }

                String text = req.toString();
                if (ServiceProfiler.ON) {
                    ServiceProfiler.units("frame.out REQ dn", text.length());
                    ServiceProfiler.units("frame.out REQ dn " + ServiceProfiler.host(relayUrl), text.length());
                }
                webSocket.send(text);
            } catch (JSONException e) {
                Log.w(TAG, "Failed to build REQ", e);
            }
        }

        /** Fire a one-shot kind-0 REQ for {@code pubkey}. */
        void fetchProfile(String pubkey) {
            if (closed || ws == null) return;
            try {
                JSONObject f = new JSONObject();
                f.put("kinds", new JSONArray().put(0));
                f.put("authors", new JSONArray().put(pubkey));
                f.put("limit", 1);
                ServiceProfiler.count("frame.out REQ dp");
                ws.send(reqMessage(profilePrefix + pubkey, f));
            } catch (JSONException ignored) {}
        }

        /** Fire a one-shot REQ for a set of event ids. */
        void fetchEvents(Set<String> ids) {
            if (closed || ws == null || ids.isEmpty()) return;
            try {
                JSONArray idsArr = new JSONArray();
                for (String id : ids) idsArr.put(id);
                JSONObject f = new JSONObject();
                f.put("ids", idsArr);
                f.put("limit", ids.size());
                ServiceProfiler.count("frame.out REQ de");
                ws.send(reqMessage(eventPrefix + Long.toHexString(System.nanoTime()), f));
            } catch (JSONException ignored) {}
        }

        void closeSub(String subId) {
            if (ws == null) return;
            try {
                JSONArray close = new JSONArray();
                close.put("CLOSE");
                close.put(subId);
                ServiceProfiler.count("frame.out CLOSE");
                ws.send(close.toString());
            } catch (Exception ignored) {}
        }

        /**
         * The main REQ was closed auth-required. Nothing here can answer
         * NIP-42, so the socket would sit open delivering nothing while it
         * pings; end the session now and let the circuit breaker count it.
         */
        void onMainWalled() {
            mainWalled = true;
            WebSocket socket = ws;
            if (socket == null) return;
            try { socket.close(1000, "auth-required"); } catch (Exception ignored) {}
            endSession(socket, null);
        }

        /**
         * {@code socket} is gone (failed to open, or opened then died). Retry
         * after a growing delay, or — once {@link #PERMANENT_FAILURE_THRESHOLD}
         * sessions in a row, spanning at least {@link #QUARANTINE_AFTER_MS},
         * ended in a way retrying can't fix (host doesn't resolve,
         * connection/TLS refused, an HTTP error instead of an upgrade, or
         * auth-walled with nothing delivered) — quarantine the relay: no
         * socket and no retry until {@link #onFleetEdge} re-arms it. Without
         * this a dead relay was redialed every five minutes forever, and from
         * one second again on every network change. {@code failure} is the
         * transport's classification of an onFailure, or null for a close.
         * Callbacks from a socket that is no longer current are ignored, so an
         * old socket's late onClosed can't schedule a second reconnect.
         */
        void endSession(WebSocket socket, FailureKind failure) {
            if (closed || socket == null || socket != ws) return;
            boolean wasOpen = socketOpen;
            socketOpen = false;
            ws = null;
            long uptime = wasOpen && connectAttemptAt > 0
                    ? System.currentTimeMillis() - connectAttemptAt : 0;
            boolean permanent = failure == FailureKind.PERMANENT
                    || (wasOpen && mainWalled && !deliveredAnything);

            handler.removeCallbacks(reconnectRunnable);
            retryPending = false;
            if (permanent) {
                long now = System.currentTimeMillis();
                if (consecutivePermanent == 0) firstPermanentAt = now;
                consecutivePermanent++;
                if (consecutivePermanent >= PERMANENT_FAILURE_THRESHOLD
                        && now - firstPermanentAt >= QUARANTINE_AFTER_MS) {
                    quarantined = true;
                    ServiceProfiler.count("socket.quarantine");
                    Log.w(TAG, "Quarantined " + relayUrl
                            + "; no retry until a network, config or foreground change");
                    return;
                }
            } else {
                // Anything retrying might fix breaks the run.
                consecutivePermanent = 0;
                firstPermanentAt = 0;
                if (wasOpen && uptime >= STABLE_CONNECTION_MS) {
                    // Only a connection that stayed up for a while earns a
                    // backoff reset; instant drops keep doubling toward the
                    // 5-minute cap.
                    backoffMs = INITIAL_BACKOFF_MS;
                }
            }
            long delay = backoffMs;
            if (ServiceProfiler.ON) ServiceProfiler.units("socket.retry scheduled ms", delay);
            backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
            handler.postDelayed(reconnectRunnable, delay);
            retryPending = true;
        }

        void close() {
            closed = true;
            retryPending = false;
            socketOpen = false;
            handler.removeCallbacks(reconnectRunnable);
            if (ws != null) {
                try { ws.close(1000, "service reconfigured"); } catch (Exception ignored) {}
                ws = null;
            }
        }

        /**
         * Something changed that could change the outcome — connectivity
         * returned, the config was rebuilt, or the app came forward. Clear any
         * quarantine and backoff, and connect now if there's no socket.
         */
        void onFleetEdge() {
            if (closed) return;
            quarantined = false;
            consecutivePermanent = 0;
            firstPermanentAt = 0;
            backoffMs = INITIAL_BACKOFF_MS;
            handler.removeCallbacks(reconnectRunnable);
            retryPending = false;
            if (ws == null) connect();
        }
    }

    /** How a socket failure bears on the circuit breaker. */
    enum FailureKind { PERMANENT, TRANSIENT }

    /**
     * Classify a socket failure. Deliberately conservative: only a host that
     * doesn't resolve, a connection refused or failing TLS, and a WebSocket
     * upgrade answered with an HTTP error are permanent — everything else
     * (timeouts, protocol errors, a mid-session drop) is retried on the
     * bounded backoff. {@code httpCode} is the status of a failed upgrade, or 0
     * when no HTTP response arrived. 408 and 429 mean "try later", so they
     * stay transient; a relay 503ing or refusing through a restart still
     * recovers, since quarantine also needs {@link #QUARANTINE_AFTER_MS} of
     * failing. Ported from Armada.
     */
    static FailureKind classifyFailure(Throwable t, int httpCode) {
        if (httpCode >= 400 && httpCode != 408 && httpCode != 429) {
            return FailureKind.PERMANENT;
        }
        int hops = 0;
        for (Throwable c = t; c != null && hops < 8; c = c.getCause(), hops++) {
            if (c instanceof UnknownHostException
                    || c instanceof ConnectException
                    || c instanceof SSLHandshakeException
                    || c instanceof SSLPeerUnverifiedException) {
                return FailureKind.PERMANENT;
            }
        }
        return FailureKind.TRANSIENT;
    }

    /** A stable string for a relay's filter list, to detect a changed REQ. */
    private static String filterSignature(List<JSONObject> filters) {
        if (filters == null) return "";
        return new JSONArray(filters).toString();
    }

    private static String reqMessage(String subId, JSONObject filter) throws JSONException {
        JSONArray req = new JSONArray();
        req.put("REQ");
        req.put(subId);
        req.put(filter);
        return req.toString();
    }

    // ── Relay message routing ─────────────────────────────────────────────────

    private void onRelayMessage(String text, RelayConnection rc) {
        try {
            JSONArray msg = new JSONArray(text);
            String type = msg.optString(0);

            if ("EOSE".equals(type)) {
                String sub = msg.optString(1);
                if (rc.subMain.equals(sub)) {
                    rc.mainEosed = true;
                    if (!rc.backfill.isEmpty()) {
                        List<JSONObject> batch = new ArrayList<>(rc.backfill);
                        rc.backfill.clear();
                        processBatch(batch);
                    }
                } else if (sub.startsWith(rc.profilePrefix)) {
                    // No kind-0 on this relay; resolve if it was the last hope
                    // is handled by the lookup timeout — just close the sub.
                    rc.closeSub(sub);
                } else if (sub.startsWith(rc.eventPrefix)) {
                    rc.closeSub(sub);
                }
                return;
            }

            if ("CLOSED".equals(type)) {
                String sub = msg.optString(1);
                String reason = msg.optString(2);
                Log.w(TAG, "CLOSED from " + rc.relayUrl + " sub=" + sub + " reason=" + reason);
                if (rc.subMain.equals(sub) && reason.startsWith("auth-required")) {
                    rc.onMainWalled();
                }
                return;
            }

            if (!"EVENT".equals(type)) return;

            String sub = msg.optString(1);
            JSONObject event = msg.optJSONObject(2);
            if (event == null) return;

            // Kind-0 from a profile lookup: newest across relays wins.
            if (sub.startsWith(rc.profilePrefix)) {
                String pubkey = sub.substring(rc.profilePrefix.length());
                rc.closeSub(sub);
                Profile parsed = parseProfile(event);
                Profile prev = bestProfile.get(pubkey);
                if (prev == null || parsed.ts >= prev.ts) {
                    bestProfile.put(pubkey, parsed);
                }
                resolveProfile(pubkey, bestProfile.get(pubkey));
                return;
            }

            // Referenced event from a lookup: cache it + advance pending batches.
            if (sub.startsWith(rc.eventPrefix)) {
                String id = event.optString("id");
                if (!id.isEmpty()) {
                    eventCache.put(id, event);
                    onReferencedEventArrived(id);
                }
                return;
            }

            if (rc.subMain.equals(sub)) {
                rc.deliveredAnything = true;
                if (rc.mainEosed) {
                    // Live singleton: hold non-followed senders in stasis so the
                    // crowd forms before any of the burst fires. Backfill (below)
                    // already arrives as a crowd, so it skips the hold.
                    enqueueLiveEvent(event);
                } else {
                    rc.backfill.add(event);
                }
            }
        } catch (Exception e) {
            // Ignore non-JSON / unexpected frames.
        }
    }

    // ── Event processing ──────────────────────────────────────────────────────

    /**
     * Route one live event. A followed (or self) sender is trust-exempt — never
     * folded — so it fires immediately with no delay. Every other sender is held
     * in the stasis buffer for {@link #STASIS_MS} so the crowd forms before any
     * of the burst fires; the timer is armed by the FIRST held event and not
     * reset by later ones, so an unbroken stream still flushes on cadence.
     */
    private void enqueueLiveEvent(JSONObject event) {
        String sender = NostrPoller.getSenderPubkey(event);
        if (sender.equals(userPubkey) || follows.contains(sender)) {
            processBatch(java.util.Collections.singletonList(event));
            return;
        }
        String id = event.optString("id");
        // Dedup before buffering: the same event is redelivered across relay
        // sockets, and holding N copies both wastes the flush and — worse — lets
        // a burst's copies straddle the flush boundary, splitting one crowd into
        // two sub-threshold windows that each fire unfolded. `notifiedIds` only
        // dedups at processBatch (too late), so guard on both it and the buffer.
        if (id.isEmpty() || notifiedIds.contains(id) || stasisBufferIds.contains(id)) return;
        stasisBuffer.add(event);
        stasisBufferIds.add(id);
        if (!stasisScheduled) {
            stasisScheduled = true;
            handler.postDelayed(flushStasisRunnable, STASIS_MS);
        }
    }

    /** Flush all held events through {@link #processBatch} as one crowd. */
    private void flushStasis() {
        stasisScheduled = false;
        if (stasisBuffer.isEmpty()) return;
        if (ServiceProfiler.ON) ServiceProfiler.units("stasis.flush", stasisBuffer.size());
        List<JSONObject> batch = new ArrayList<>(stasisBuffer);
        stasisBuffer.clear();
        stasisBufferIds.clear();
        processBatch(batch);
    }

    /**
     * Process a batch of notification events (held live events flushed from the
     * stasis buffer, or the buffered backfill after EOSE). Resolves referenced
     * events first (for ownership checks + body snippets), then either shows one
     * summary (large batch) or per-event rich notifications with resolved author
     * profiles.
     */
    private void processBatch(List<JSONObject> events) {
        long t = ServiceProfiler.begin("batch.process");
        try {
            processBatchInner(events);
        } finally {
            ServiceProfiler.end("batch.process", t);
        }
    }

    private void processBatchInner(List<JSONObject> events) {
        if (userPubkey == null) return;
        if (ServiceProfiler.ON) ServiceProfiler.units("batch.events", events.size());

        if (eventCache.size() > MAX_CACHED_EVENTS) eventCache.clear();

        List<JSONObject> candidates = new ArrayList<>();
        long newestTs = poller.getLastSeenTimestamp();
        long nowSec = System.currentTimeMillis() / 1000;

        for (JSONObject event : events) {
            String id = event.optString("id");
            if (id.isEmpty() || notifiedIds.contains(id)) continue;
            String sender = NostrPoller.getSenderPubkey(event);
            long ts = event.optLong("created_at", 0);
            // Clamp the cursor to `now` so a validly signed event carrying a
            // far-future created_at can't jump last-seen forward and silently
            // skip everything until then. Mirrors Armada's advanceInclusiveSince.
            newestTs = advanceInclusiveSince(newestTs, ts, nowSec);
            if (sender.equals(userPubkey)) continue; // skip self-interactions
            // "Only from people I follow", re-checked here for when the follow
            // set was too big to send as the filters' `authors`.
            if (onlyFollowing && !follows.isEmpty() && !follows.contains(sender)) continue;
            // Bounded LRU insert: at the cap the oldest id is evicted, never the
            // whole set. `id` is known-new here (contains() rejected dupes above).
            rememberBoundedId(notifiedIds, id, MAX_NOTIFIED_IDS);
            candidates.add(event);
        }

        // Advance last-seen over everything (including self/dup events) so a
        // reconnect doesn't re-fetch them.
        poller.setLastSeenTimestamp(newestTs);

        if (candidates.isEmpty()) return;
        if (ServiceProfiler.ON) ServiceProfiler.units("batch.candidates", candidates.size());

        // Flood suppression: fold this batch into a rolling window of recent
        // events so the crowd-based detectors can see a burst even though live
        // events arrive one at a time, then drop any candidate that belongs to
        // a likely-spam flood. Two orthogonal detectors run and their verdicts
        // are unioned, mirroring the web client's useNotificationFlood:
        //   - FloodDetector (reply flood) reads CONTENT — one pitch echoed
        //     across a crowd, or hammered by a single key.
        //   - MentionSwarmDetector reads the ENVELOPE — a burst of one-shot
        //     strangers all naming the same co-victims, which catches a
        //     mad-libs generator that writes a unique message every time
        //     (content clustering has nothing to hold onto).
        // The reader's own events and events from people they follow are never
        // suppressed by either.
        for (JSONObject event : candidates) {
            recentEvents.addLast(event);
            while (recentEvents.size() > FLOOD_WINDOW) recentEvents.removeFirst();
        }
        List<FloodDetector.Event> floodWindow = new ArrayList<>();
        List<MentionSwarmDetector.Event> swarmWindow = new ArrayList<>();
        for (JSONObject event : recentEvents) {
            String windowId = event.optString("id");
            String windowSender = NostrPoller.getSenderPubkey(event);
            floodWindow.add(new FloodDetector.Event(
                    windowId, windowSender, event.optString("content")));
            swarmWindow.add(new MentionSwarmDetector.Event(
                    windowId, windowSender, event.optLong("created_at", 0), pTagsOf(event)));
        }
        // floodIds returns a fresh set, so the swarm ids can merge into it.
        long tFlood = ServiceProfiler.begin("flood.detect");
        Set<String> flooded = FloodDetector.floodIds(floodWindow, userPubkey, follows);
        flooded.addAll(MentionSwarmDetector.swarmIds(swarmWindow, userPubkey, follows));
        ServiceProfiler.end("flood.detect", tFlood);
        if (!flooded.isEmpty()) {
            if (ServiceProfiler.ON) ServiceProfiler.units("flood.folded", flooded.size());
            candidates.removeIf(event -> flooded.contains(event.optString("id")));
            if (candidates.isEmpty()) return;
        }

        // Collect referenced-event ids for kinds whose notification depends on
        // the user's own post (ownership check + snippet).
        Set<String> refIds = new LinkedHashSet<>();
        for (JSONObject event : candidates) {
            String refId = referencedIdFor(event);
            if (refId != null && !eventCache.containsKey(refId)) {
                refIds.add(refId);
            }
        }

        resolveReferencedEvents(refIds, () -> {
            // Ownership filter: reactions/reposts/highlights on posts the user
            // didn't author (they were merely tagged) are not notifications.
            // When the referenced event couldn't be fetched, keep the event —
            // better a notification with less context than a silently missing one.
            List<JSONObject> notifiable = new ArrayList<>();
            for (JSONObject event : candidates) {
                int kind = event.optInt("kind");
                if (kind == 7 || kind == 6 || kind == 16 || kind == 9802) {
                    String refId = NostrPoller.getReferencedEventId(event);
                    if (refId != null) {
                        JSONObject ref = eventCache.get(refId);
                        if (ref != null && !userPubkey.equals(ref.optString("pubkey"))) continue;
                    }
                }
                notifiable.add(event);
            }

            if (notifiable.isEmpty()) return;

            if (notifiable.size() > MAX_INDIVIDUAL_NOTIFICATIONS) {
                ServiceProfiler.count("notify.summary");
                poller.showSummaryNotification(notifiable.size());
                return;
            }

            for (JSONObject event : notifiable) {
                String refId = NostrPoller.getReferencedEventId(event);
                JSONObject ref = refId != null ? eventCache.get(refId) : null;
                String sender = NostrPoller.getSenderPubkey(event);
                resolveAuthor(sender, profile -> poller.showEventNotification(
                        event,
                        profile != null ? profile.name : null,
                        profile != null ? profile.picture : null,
                        ref,
                        this::mentionName,
                        httpClient
                ));
            }
        });
    }

    /**
     * Referenced-event id for kinds that act on one of the user's posts.
     * Kind 1 replies/mentions, comments, voice messages, and letters ARE the
     * content — no lookup needed for them (the comment kind still benefits
     * from the parent's noun, but it isn't worth a blocking fetch).
     */
    private String referencedIdFor(JSONObject event) {
        int kind = event.optInt("kind");
        if (kind == 7 || kind == 6 || kind == 16 || kind == 9735 || kind == 9802) {
            return NostrPoller.getReferencedEventId(event);
        }
        return null;
    }

    /**
     * Every {@code p} tag value on an event, for mention-swarm cohorts. The
     * reader is kept in the list here; {@link MentionSwarmDetector} strips it.
     */
    private static List<String> pTagsOf(JSONObject event) {
        List<String> pTags = new ArrayList<>();
        JSONArray tags = event.optJSONArray("tags");
        if (tags == null) return pTags;
        for (int i = 0; i < tags.length(); i++) {
            JSONArray tag = tags.optJSONArray(i);
            if (tag != null && tag.length() >= 2 && "p".equals(tag.optString(0))) {
                String value = tag.optString(1);
                if (!value.isEmpty()) pTags.add(value);
            }
        }
        return pTags;
    }

    // ── Referenced-event resolution ───────────────────────────────────────────

    /**
     * Fetch the given event ids (skipping cached ones) by broadcasting a
     * one-shot REQ to every open relay, then run {@code done}. Completes early
     * when every id has arrived, otherwise on the lookup timeout.
     */
    private void resolveReferencedEvents(Set<String> ids, Runnable done) {
        Set<String> waiting = new HashSet<>();
        for (String id : ids) {
            if (!eventCache.containsKey(id)) waiting.add(id);
        }
        if (waiting.isEmpty()) {
            done.run();
            return;
        }

        if (ServiceProfiler.ON) ServiceProfiler.units("lookup.events", waiting.size());
        EventLookup lookup = new EventLookup(waiting, done);
        pendingEventLookups.add(lookup);

        boolean sentAny = false;
        for (RelayConnection rc : connections) {
            if (rc.ws != null && !rc.closed) {
                rc.fetchEvents(waiting);
                sentAny = true;
            }
        }
        if (!sentAny) {
            completeEventLookup(lookup);
            return;
        }

        handler.postDelayed(() -> completeEventLookup(lookup), LOOKUP_TIMEOUT_MS);
    }

    /** An event arrived from a lookup sub — advance every pending batch. */
    private void onReferencedEventArrived(String id) {
        List<EventLookup> completed = null;
        for (EventLookup lookup : pendingEventLookups) {
            lookup.waiting.remove(id);
            if (lookup.waiting.isEmpty()) {
                if (completed == null) completed = new ArrayList<>();
                completed.add(lookup);
            }
        }
        if (completed != null) {
            for (EventLookup lookup : completed) {
                completeEventLookup(lookup);
            }
        }
    }

    private void completeEventLookup(EventLookup lookup) {
        if (lookup.completed) return;
        lookup.completed = true;
        pendingEventLookups.remove(lookup);
        lookup.done.run();
    }

    // ── Profile (kind 0) resolution ───────────────────────────────────────────

    /**
     * Display name for a MENTIONED pubkey, resolved best-effort from the
     * in-memory profile cache ONLY — never the network, so resolving a mention
     * in a notification body can't delay or block the notification. Returns null
     * when the author isn't cached, so {@link NotificationContent} keeps the raw
     * {@code nostr:npub…} token rather than inventing a wrong name.
     */
    private String mentionName(String pubkeyHex) {
        Profile held = profileCache.get(pubkeyHex);
        if (held != null && held.name != null && !held.name.isEmpty()) {
            return held.name;
        }
        return null;
    }

    /**
     * Resolve {@code pubkey} to a profile, then invoke {@code cb}. Serves from
     * cache when present, otherwise issues a kind-0 REQ on EVERY open relay (a
     * user's kind-0 may live on a different relay than the one the event came
     * from). Waits up to {@link #LOOKUP_TIMEOUT_MS}, keeping the newest kind-0
     * seen across relays. Concurrent lookups for the same author coalesce.
     */
    private void resolveAuthor(String pubkey, ProfileCallback cb) {
        Profile cached = profileCache.get(pubkey);
        if (cached != null) {
            ServiceProfiler.count("lookup.profile cache hit");
            cb.onProfile(cached);
            return;
        }
        List<ProfileCallback> waiters = pendingProfiles.get(pubkey);
        if (waiters != null) {
            ServiceProfiler.count("lookup.profile coalesced");
            waiters.add(cb); // a fetch is already in flight; piggyback on it
            return;
        }
        waiters = new ArrayList<>();
        waiters.add(cb);
        pendingProfiles.put(pubkey, waiters);
        ServiceProfiler.count("lookup.profile fetch");

        boolean sentAny = false;
        for (RelayConnection rc : connections) {
            if (rc.ws != null && !rc.closed) {
                rc.fetchProfile(pubkey);
                sentAny = true;
            }
        }
        if (!sentAny) {
            resolveProfile(pubkey, null);
            return;
        }

        // Fallback if no relay answers in time: resolve with the best profile
        // gathered so far (possibly null) — the notification fires name-less
        // rather than hanging.
        handler.postDelayed(() -> {
            if (pendingProfiles.containsKey(pubkey)) {
                resolveProfile(pubkey, bestProfile.get(pubkey));
            }
        }, LOOKUP_TIMEOUT_MS);
    }

    /** Cache the result (if any) and flush all pending waiters for this pubkey. */
    private void resolveProfile(String pubkey, Profile profile) {
        if (profile != null) {
            profileCache.put(pubkey, profile);
        }
        bestProfile.remove(pubkey);
        // Close any profile subs still open for this pubkey on other relays.
        for (RelayConnection rc : connections) {
            rc.closeSub(rc.profilePrefix + pubkey);
        }
        List<ProfileCallback> waiters = pendingProfiles.remove(pubkey);
        if (waiters == null) return;
        for (ProfileCallback cb : waiters) {
            cb.onProfile(profile);
        }
    }

    /** Parse a kind-0 event's content into a {@link Profile}. */
    private static Profile parseProfile(JSONObject event) {
        long ts = event.optLong("created_at", 0);
        try {
            JSONObject meta = new JSONObject(event.optString("content", "{}"));
            String name = meta.optString("display_name", "");
            if (name.isEmpty()) name = meta.optString("name", "");
            String picture = meta.optString("picture", "");
            return new Profile(
                    name.isEmpty() ? null : name,
                    picture.isEmpty() ? null : picture,
                    ts
            );
        } catch (JSONException e) {
            return new Profile(null, null, ts);
        }
    }

    // ── Network monitoring ────────────────────────────────────────────────────

    private void registerNetworkCallback() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return;

        NetworkRequest request = new NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build();

        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                Log.d(TAG, "Network available, reconnecting");
                ServiceProfiler.count("network.available");
                handler.post(() -> {
                    for (RelayConnection rc : connections) {
                        rc.onFleetEdge();
                    }
                });
            }

            @Override
            public void onLost(Network network) {
                Log.d(TAG, "Network lost");
                ServiceProfiler.count("network.lost");
            }
        };

        cm.registerNetworkCallback(request, networkCallback);
    }

    private void unregisterNetworkCallback() {
        if (networkCallback == null) return;
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm != null) {
            try { cm.unregisterNetworkCallback(networkCallback); } catch (Exception ignored) {}
        }
    }

    private boolean isNetworkAvailable() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        Network network = cm.getActiveNetwork();
        if (network == null) return false;
        NetworkCapabilities caps = cm.getNetworkCapabilities(network);
        return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    // ── Config change listener ────────────────────────────────────────────────

    private void registerConfigListener() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        // The plugin writes several keys in one commit, which fires this once
        // per key — debounce so we rebuild the connections only once.
        configListener = (sharedPreferences, key) -> {
            ServiceProfiler.count("config.prefs change");
            handler.removeCallbacks(reloadConfigRunnable);
            handler.postDelayed(reloadConfigRunnable, 500);
        };
        prefs.registerOnSharedPreferenceChangeListener(configListener);
    }

    private void unregisterConfigListener() {
        if (configListener == null) return;
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.unregisterOnSharedPreferenceChangeListener(configListener);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Advance the last-seen cursor to the newest observed second without
     * letting a far-future timestamp move it past `now`. `since` is inclusive,
     * so the maximum observed second (not +1) is kept to preserve later
     * same-second / out-of-order delivery; notifiedIds absorbs the overlap.
     * Pure and Android-free for JVM regression coverage. Ported from Armada.
     */
    static long advanceInclusiveSince(long currentSinceSec, long eventCreatedAtSec, long nowSec) {
        if (nowSec < 0L) return currentSinceSec;
        // Recover too if the wall clock moved backwards after a prior sample:
        // replaying a little is safe, a cursor stuck in the future is not.
        long safeCurrent = Math.min(currentSinceSec, nowSec);
        if (eventCreatedAtSec < 0L) return safeCurrent;
        long safeEvent = Math.min(eventCreatedAtSec, nowSec);
        return Math.max(safeCurrent, safeEvent);
    }

    /**
     * Bounded insertion-order set update: append `id`, evicting the OLDEST ids
     * one at a time once the set exceeds `maximum` — never a wholesale flush.
     * Pure and Android-free for JVM regression coverage. Ported from Armada.
     */
    static void rememberBoundedId(LinkedHashSet<String> ids, String id, int maximum) {
        if (ids == null || id == null || id.isEmpty() || maximum <= 0) return;
        // Refresh an explicitly re-added id to the newest end. Ordinary relay
        // duplicates are rejected by contains() before here and stay cheap.
        ids.remove(id);
        ids.add(id);
        while (ids.size() > maximum) {
            java.util.Iterator<String> iterator = ids.iterator();
            if (!iterator.hasNext()) break;
            iterator.next();
            iterator.remove();
        }
    }

    private List<String> parseStringArray(String json) {
        List<String> values = new ArrayList<>();
        if (json != null) {
            try {
                JSONArray arr = new JSONArray(json);
                for (int i = 0; i < arr.length(); i++) {
                    values.add(arr.getString(i));
                }
            } catch (JSONException e) {
                Log.w(TAG, "Failed to parse string array", e);
            }
        }
        return values;
    }

    private List<Integer> parseIntArray(String json) {
        List<Integer> values = new ArrayList<>();
        if (json != null) {
            try {
                JSONArray arr = new JSONArray(json);
                for (int i = 0; i < arr.length(); i++) {
                    values.add(arr.getInt(i));
                }
            } catch (JSONException e) {
                Log.w(TAG, "Failed to parse int array", e);
            }
        }
        return values;
    }

    private Notification buildForegroundNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, notificationIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Ditto")
                .setContentText("Connected for instant notifications")
                .setSmallIcon(R.drawable.ic_stat_ditto)
                .setContentIntent(pendingIntent)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .setSilent(true)
                .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Background Connection",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Keeps Ditto connected for instant notifications");
            channel.setShowBadge(false);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
}
