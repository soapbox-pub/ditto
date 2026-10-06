package pub.ditto.app;

import android.os.Process;
import android.os.SystemClock;
import android.os.Trace;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * What the background notification service costs, per operation.
 *
 * PROFILING BUILDS ONLY: {@link #ON} is {@code BuildConfig.PROFILE}, set by
 * building with {@code -PdittoProfile=true} (see scripts/android-profile.sh).
 * It is a compile-time constant, so every {@code if (ServiceProfiler.ON)} guard
 * — and every label string built inside one — is dead code in a normal build
 * and removed by javac/R8. Call sites that build a label MUST guard with it;
 * the methods themselves also return early, for the ones that don't.
 *
 * Aggregates are keyed by a free-form label ("frame.handle", "batch.process",
 * "frame.in dn") into count / total / max nanoseconds / units, so a thousand
 * cheap calls read differently from one expensive one. {@link #begin} also
 * opens a Perfetto trace section of the same name, so a system trace of the
 * app shows the service's work on the thread it ran on.
 *
 * Read it without the app UI:
 *
 *   adb shell dumpsys activity service pub.ditto.app.profile/pub.ditto.app.NotificationRelayService
 *   adb shell dumpsys activity service pub.ditto.app.profile/pub.ditto.app.NotificationRelayService reset
 *
 * Ported from Armada.
 */
public final class ServiceProfiler {
    private ServiceProfiler() {}

    public static final boolean ON = BuildConfig.PROFILE;

    /** label → {count, totalNs, maxNs, units}. */
    private static final Map<String, long[]> stats = new ConcurrentHashMap<>();

    // Guarded by ON so a normal build — and plain-JVM unit tests, where every
    // android.os method is an unmocked stub — never touches the clocks just by
    // loading this class.
    private static volatile long windowStartMs = ON ? SystemClock.elapsedRealtime() : 0;
    private static volatile long windowStartCpuMs = ON ? Process.getElapsedCpuTime() : 0;

    /** Count one occurrence of {@code label}. */
    public static void count(String label) {
        if (!ON) return;
        add(label, 0, 0);
    }

    /** Count {@code units} of something (bytes, rows) under {@code label}. */
    public static void units(String label, long units) {
        if (!ON) return;
        add(label, 0, units);
    }

    /**
     * Start timing {@code label}; pair with {@link #end} in a finally. Also
     * opens a trace section, which must be closed on the SAME thread.
     */
    public static long begin(String label) {
        if (!ON) return 0;
        Trace.beginSection(label.length() > 127 ? label.substring(0, 127) : label);
        return SystemClock.elapsedRealtimeNanos();
    }

    public static void end(String label, long startNs) {
        if (!ON) return;
        Trace.endSection();
        add(label, SystemClock.elapsedRealtimeNanos() - startNs, 0);
    }

    /** Record an operation measured elsewhere (e.g. across a callback). */
    public static void elapsed(String label, long startNs) {
        if (!ON) return;
        add(label, SystemClock.elapsedRealtimeNanos() - startNs, 0);
    }

    /** The clock {@link #elapsed} measures against. */
    public static long now() {
        return ON ? SystemClock.elapsedRealtimeNanos() : 0;
    }

    /** Keep the high-water mark of a level (a queue depth) under {@code label}. */
    public static void peak(String label, long level) {
        if (!ON) return;
        long[] s = stats.computeIfAbsent(label, k -> new long[4]);
        synchronized (s) {
            s[0]++;
            if (level > s[2]) s[2] = level;
        }
    }

    private static void add(String label, long ns, long units) {
        long[] s = stats.computeIfAbsent(label, k -> new long[4]);
        synchronized (s) {
            s[0]++;
            s[1] += ns;
            if (ns > s[2]) s[2] = ns;
            s[3] += units;
        }
    }

    /** Start a fresh window: counters to zero, CPU and wall clocks rebased. */
    static void reset() {
        stats.clear();
        windowStartMs = SystemClock.elapsedRealtime();
        windowStartCpuMs = Process.getElapsedCpuTime();
    }

    /**
     * The window so far. {@code cpuMs} is the whole PROCESS's CPU time —
     * the WebView renderer runs in its own process, so while the app is in the
     * background this is essentially the service — and {@code gauges} are
     * sizes the caller samples now (caches, connections).
     */
    static JSONObject snapshot(Map<String, Long> gauges) throws JSONException {
        JSONObject out = new JSONObject();
        long wallMs = SystemClock.elapsedRealtime() - windowStartMs;
        long cpuMs = Process.getElapsedCpuTime() - windowStartCpuMs;
        out.put("windowSec", wallMs / 1000);
        out.put("cpuMs", cpuMs);
        out.put("cpuPct", wallMs > 0 ? Math.round(cpuMs * 1000.0 / wallMs) / 10.0 : 0);
        Runtime rt = Runtime.getRuntime();
        out.put("javaHeapMB", Math.round((rt.totalMemory() - rt.freeMemory()) / 1048576.0 * 10) / 10.0);
        out.put("nativeHeapMB", Math.round(android.os.Debug.getNativeHeapAllocatedSize() / 1048576.0 * 10) / 10.0);
        JSONObject g = new JSONObject();
        if (gauges != null) for (Map.Entry<String, Long> e : gauges.entrySet()) g.put(e.getKey(), e.getValue());
        out.put("gauges", g);

        List<Map.Entry<String, long[]>> rows = new ArrayList<>(stats.entrySet());
        rows.sort((a, b) -> {
            long ta = a.getValue()[1], tb = b.getValue()[1];
            if (ta != tb) return Long.compare(tb, ta);
            return Long.compare(b.getValue()[0], a.getValue()[0]);
        });
        JSONObject ops = new JSONObject();
        for (Map.Entry<String, long[]> e : rows) {
            long[] s;
            synchronized (e.getValue()) {
                s = e.getValue().clone();
            }
            JSONObject row = new JSONObject();
            row.put("count", s[0]);
            if (s[1] > 0) {
                row.put("totalMs", Math.round(s[1] / 1e5) / 10.0);
                row.put("maxMs", Math.round(s[2] / 1e5) / 10.0);
            } else if (s[2] > 0) {
                row.put("peak", s[2]);
            }
            if (s[3] > 0) row.put("units", s[3]);
            ops.put(e.getKey(), row);
        }
        out.put("ops", ops);
        return out;
    }

    /**
     * The subscription family of a relay frame, from its head alone: the verb,
     * plus for subscription-scoped verbs the first two characters of the sub
     * id — the service names every REQ with a two-letter family prefix ("dn-"
     * the live notification REQ, "dp-" profile lookups, "de-" referenced-event
     * lookups).
     */
    static String frameFamily(String text) {
        // ["EVENT","dn-18c…",{…}]
        int v0 = text.indexOf('"');
        if (v0 < 0) return "?";
        int v1 = text.indexOf('"', v0 + 1);
        if (v1 < 0) return "?";
        String verb = text.substring(v0 + 1, v1);
        if (!verb.equals("EVENT") && !verb.equals("EOSE") && !verb.equals("CLOSED")) return verb;
        int s0 = text.indexOf('"', v1 + 1);
        if (s0 < 0 || s0 + 3 > text.length()) return verb;
        return verb + " " + text.substring(s0 + 1, s0 + 3);
    }

    /** A relay URL down to its host, so a label names the relay but not its path or query. */
    static String host(String url) {
        int start = url.indexOf("://");
        start = start < 0 ? 0 : start + 3;
        int end = start;
        while (end < url.length() && url.charAt(end) != '/' && url.charAt(end) != '?') end++;
        return url.substring(start, end);
    }
}
