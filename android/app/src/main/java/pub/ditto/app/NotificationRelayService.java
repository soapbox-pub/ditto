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

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

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
 * - One always-open WebSocket per configured relay, each with a live REQ
 *   ({kinds, #p: user, since}). Events arrive the moment a relay accepts
 *   them — no polling latency.
 * - OkHttp pingInterval keeps sockets alive through NATs and detects silent
 *   drops; failures reconnect with exponential backoff (1s → 5 min cap).
 * - A network callback reconnects immediately when connectivity returns.
 * - Config changes (login/logout/relay or preference changes) rebuild the
 *   connections via a SharedPreferences listener.
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

    private OkHttpClient httpClient;
    private NostrPoller poller;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private final List<RelayConnection> connections = new ArrayList<>();

    // Config (from SharedPreferences, written by DittoNotificationPlugin).
    private String userPubkey;
    private final List<String> relayUrls = new ArrayList<>();
    private final List<Integer> enabledKinds = new ArrayList<>();
    private final List<String> authors = new ArrayList<>();

    // Event ids already notified — dedupes across relays and reconnects.
    private final Set<String> notifiedIds = new HashSet<>();

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
                .pingInterval(30, TimeUnit.SECONDS) // keep sockets alive + detect drops
                .build();

        poller = new NostrPoller(this);

        registerNetworkCallback();
        registerConfigListener();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        loadConfigAndReconnect();
        return START_STICKY;
    }

    /**
     * Android 15+ calls this when the dataSync foreground-service time budget
     * runs out. We must stop promptly or the system raises an ANR. Schedule a
     * retry through BootReceiver — it succeeds once the budget resets (the
     * user opens the app) when the app is exempt from battery optimizations.
     */
    @Override
    public void onTimeout(int startId) {
        Log.w(TAG, "dataSync time budget exhausted; stopping and scheduling retry");
        BootReceiver.scheduleRetry(this, 15 * 60 * 1_000);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
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
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        userPubkey = prefs.getString("userPubkey", null);

        relayUrls.clear();
        relayUrls.addAll(parseStringArray(prefs.getString("relayUrls", null)));

        enabledKinds.clear();
        enabledKinds.addAll(parseIntArray(prefs.getString("enabledKinds", null)));

        authors.clear();
        authors.addAll(parseStringArray(prefs.getString("authors", null)));

        if (userPubkey == null || relayUrls.isEmpty() || enabledKinds.isEmpty()) {
            Log.d(TAG, "No config (pubkey/relays/kinds); disconnecting.");
            closeAllConnections();
            return;
        }

        // Rebuild all connections with the current filter.
        closeAllConnections();
        for (String url : new LinkedHashSet<>(relayUrls)) {
            RelayConnection rc = new RelayConnection(url);
            connections.add(rc);
            rc.connect();
        }
    }

    private void closeAllConnections() {
        for (RelayConnection rc : connections) {
            rc.close();
        }
        connections.clear();
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
            if (closed || !isNetworkAvailable()) return;
            mainEosed = false;
            backfill.clear();
            Request request = new Request.Builder().url(relayUrl).build();
            ws = httpClient.newWebSocket(request, new WebSocketListener() {
                @Override
                public void onOpen(WebSocket webSocket, Response response) {
                    backoffMs = INITIAL_BACKOFF_MS;
                    Log.d(TAG, "WS open: " + relayUrl);
                    sendMainReq(webSocket);
                }

                @Override
                public void onMessage(WebSocket webSocket, String text) {
                    handler.post(() -> onRelayMessage(text, RelayConnection.this));
                }

                @Override
                public void onFailure(WebSocket webSocket, Throwable t, Response response) {
                    Log.w(TAG, "WS failure (" + relayUrl + "): " + t.getMessage());
                    handler.post(RelayConnection.this::scheduleReconnect);
                }

                @Override
                public void onClosed(WebSocket webSocket, int code, String reason) {
                    handler.post(() -> {
                        if (!closed) scheduleReconnect();
                    });
                }
            });
        }

        void sendMainReq(WebSocket webSocket) {
            try {
                long lastSeen = poller.getLastSeenTimestamp();
                if (lastSeen == 0) {
                    lastSeen = (System.currentTimeMillis() / 1000) - 300; // 5 min ago on first run
                    poller.setLastSeenTimestamp(lastSeen);
                }

                JSONObject filter = new JSONObject();
                JSONArray kinds = new JSONArray();
                for (int kind : enabledKinds) kinds.put(kind);
                filter.put("kinds", kinds);
                filter.put("#p", new JSONArray().put(userPubkey));
                filter.put("since", lastSeen + 1);
                filter.put("limit", BACKFILL_LIMIT);

                // When "only from people I follow" is enabled, restrict authors.
                if (!authors.isEmpty()) {
                    JSONArray authorsArr = new JSONArray();
                    for (String author : authors) authorsArr.put(author);
                    filter.put("authors", authorsArr);
                }

                webSocket.send(reqMessage(subMain, filter));
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
                ws.send(reqMessage(eventPrefix + Long.toHexString(System.nanoTime()), f));
            } catch (JSONException ignored) {}
        }

        void closeSub(String subId) {
            if (ws == null) return;
            try {
                JSONArray close = new JSONArray();
                close.put("CLOSE");
                close.put(subId);
                ws.send(close.toString());
            } catch (Exception ignored) {}
        }

        void scheduleReconnect() {
            if (closed) return;
            ws = null;
            long delay = backoffMs;
            backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
            handler.postDelayed(this::connect, delay);
        }

        void close() {
            closed = true;
            if (ws != null) {
                try { ws.close(1000, "service reconfigured"); } catch (Exception ignored) {}
                ws = null;
            }
        }

        void resetAndConnectNow() {
            backoffMs = INITIAL_BACKOFF_MS;
            if (ws == null && !closed) connect();
        }
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
                Log.w(TAG, "CLOSED from " + rc.relayUrl + " sub=" + sub + " reason=" + msg.optString(2));
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
                if (rc.mainEosed) {
                    processBatch(java.util.Collections.singletonList(event));
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
     * Process a batch of notification events (a single live event, or the
     * buffered backfill after EOSE). Resolves referenced events first (for
     * ownership checks + body snippets), then either shows one summary (large
     * backfill) or per-event rich notifications with resolved author profiles.
     */
    private void processBatch(List<JSONObject> events) {
        if (userPubkey == null) return;

        if (notifiedIds.size() > MAX_NOTIFIED_IDS) notifiedIds.clear();
        if (eventCache.size() > MAX_CACHED_EVENTS) eventCache.clear();

        List<JSONObject> candidates = new ArrayList<>();
        long newestTs = poller.getLastSeenTimestamp();

        for (JSONObject event : events) {
            String id = event.optString("id");
            if (id.isEmpty() || notifiedIds.contains(id)) continue;
            String sender = NostrPoller.getSenderPubkey(event);
            long ts = event.optLong("created_at", 0);
            if (ts > newestTs) newestTs = ts;
            if (sender.equals(userPubkey)) continue; // skip self-interactions
            notifiedIds.add(id);
            candidates.add(event);
        }

        // Advance last-seen over everything (including self/dup events) so a
        // reconnect doesn't re-fetch them.
        poller.setLastSeenTimestamp(newestTs);

        if (candidates.isEmpty()) return;

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
     * Resolve {@code pubkey} to a profile, then invoke {@code cb}. Serves from
     * cache when present, otherwise issues a kind-0 REQ on EVERY open relay (a
     * user's kind-0 may live on a different relay than the one the event came
     * from). Waits up to {@link #LOOKUP_TIMEOUT_MS}, keeping the newest kind-0
     * seen across relays. Concurrent lookups for the same author coalesce.
     */
    private void resolveAuthor(String pubkey, ProfileCallback cb) {
        Profile cached = profileCache.get(pubkey);
        if (cached != null) {
            cb.onProfile(cached);
            return;
        }
        List<ProfileCallback> waiters = pendingProfiles.get(pubkey);
        if (waiters != null) {
            waiters.add(cb); // a fetch is already in flight; piggyback on it
            return;
        }
        waiters = new ArrayList<>();
        waiters.add(cb);
        pendingProfiles.put(pubkey, waiters);

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
                handler.post(() -> {
                    for (RelayConnection rc : connections) {
                        rc.resetAndConnectNow();
                    }
                });
            }

            @Override
            public void onLost(Network network) {
                Log.d(TAG, "Network lost");
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
