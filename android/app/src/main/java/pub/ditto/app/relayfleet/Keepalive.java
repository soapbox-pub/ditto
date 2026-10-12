package pub.ditto.app.relayfleet;

/**
 * The fleet's keepalive, on ONE clock for every socket.
 *
 * <p>Per-socket WebSocket pings run on as many unaligned timers as there are
 * relays, so fifteen relays pinged every 30s wake the cellular radio every two
 * seconds and it never drops back to idle. Here every socket is judged on the
 * same tick, so the probes that go out leave together.
 *
 * <p>A socket is probed (a REQ that matches nothing, answered with EOSE) once it
 * has been quiet for its relay's limit, and one that has not answered by the end
 * of {@link #PROBE_TIMEOUT_MS} is dead. The limit starts at
 * {@link #DEFAULT_QUIET_MS}; a relay seen to drop an idle socket sooner (a proxy
 * idle timeout) is probed just inside the quiet time it allowed, so it isn't
 * redialed and re-subscribed every couple of minutes. A tick where no socket is
 * due sends nothing and wakes nothing.
 */
public final class Keepalive {

    private Keepalive() {}

    /** The shared clock. Short, so a learned limit is honoured; a tick that sends nothing is free. */
    public static final long TICK_MS = 55 * 1000;

    /**
     * Quiet allowed before a probe when nothing is known about the relay: below
     * the idle timeouts mobile carrier NATs apply to TCP (rarely under 5 minutes).
     */
    public static final long DEFAULT_QUIET_MS = 3 * 60 * 1000;

    /** Floor for a learned limit, so a relay that drops sockets for other reasons can't make us chatty. */
    public static final long MIN_QUIET_MS = 45 * 1000;

    /** Margin kept below an observed idle drop. */
    static final long LEARN_MARGIN_MS = 15 * 1000;

    /** A session that ended after less quiet than this wasn't dropped for being idle. */
    static final long IDLE_DROP_MIN_MS = 50 * 1000;

    /** How long a probed socket has to answer before it is treated as dead. */
    public static final long PROBE_TIMEOUT_MS = 20 * 1000;

    public enum Action { NONE, PROBE, KILL }

    /**
     * What a tick does to one open socket. A socket is probed on the last tick
     * before it would exceed {@code quietLimitMs}, so it is never quiet longer.
     *
     * @param lastInboundAt when the socket last received a frame
     * @param probeSentAt   when the outstanding probe went out, or 0
     */
    public static Action onTick(long lastInboundAt, long probeSentAt, long quietLimitMs, long now) {
        if (probeSentAt > 0 && lastInboundAt < probeSentAt) {
            return now - probeSentAt >= PROBE_TIMEOUT_MS ? Action.KILL : Action.NONE;
        }
        return now - lastInboundAt + TICK_MS >= quietLimitMs ? Action.PROBE : Action.NONE;
    }

    /** Whether a probe sent at {@code probeSentAt} has gone unanswered too long. */
    public static boolean probeExpired(long lastInboundAt, long probeSentAt, long now) {
        return probeSentAt > 0 && lastInboundAt < probeSentAt && now - probeSentAt >= PROBE_TIMEOUT_MS;
    }

    /**
     * The relay's quiet limit after a session that had been open and ended
     * {@code quietAtEndMs} after its last inbound frame: an idle drop lowers it
     * to just under that quiet time; anything else leaves it.
     */
    public static long learn(long currentLimitMs, long quietAtEndMs) {
        if (quietAtEndMs < IDLE_DROP_MIN_MS) return currentLimitMs;
        return Math.min(currentLimitMs, Math.max(MIN_QUIET_MS, quietAtEndMs - LEARN_MARGIN_MS));
    }

    /**
     * Whether a socket failure was the relay ending the connection (EOF), as
     * opposed to the path failing under it (abort, reset, DNS, timeout).
     */
    public static boolean isPeerClose(Throwable t) {
        java.util.Set<Throwable> seen = java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<>());
        for (Throwable c = t; c != null && seen.add(c); c = c.getCause()) {
            if (c instanceof java.io.EOFException) return true;
        }
        return false;
    }
}
