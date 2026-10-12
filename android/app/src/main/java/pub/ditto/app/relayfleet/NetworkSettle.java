package pub.ditto.app.relayfleet;

/**
 * Hold reconnects until the network has stopped changing.
 *
 * <p>A phone at the edge of a weak Wi-Fi changes networks in bursts, and every
 * change drops every relay socket. Reconnecting the whole fleet on each change
 * spends a round of DNS, TLS, REQs and AUTH per relay that the next change,
 * seconds later, throws away. Waiting until the network has been quiet for
 * {@link #SETTLE_MS} spends that round once per burst instead of once per
 * change.
 */
public final class NetworkSettle {

    public static final long SETTLE_MS = 10_000L;
    /**
     * How long to hold connects while Android has not validated the default
     * network. A Wi-Fi that associates but passes no traffic can stay the
     * default, failing every connect. Past the grace the fleet tries anyway,
     * since some networks block the validation probe yet work, and its circuit
     * breaker takes over.
     */
    public static final long UNVALIDATED_GRACE_MS = 30_000L;

    private NetworkSettle() {}

    /** How long a connect must still wait, or 0 if the network has settled. */
    public static long delayMs(long nowMs, long lastChangeAtMs, long settleMs) {
        if (lastChangeAtMs <= 0) return 0;
        return Math.max(0, lastChangeAtMs + settleMs - nowMs);
    }

    /** How long a connect must wait for the default network to validate, or 0. */
    public static long unvalidatedDelayMs(boolean validated, long nowMs, long unvalidatedSinceMs, long graceMs) {
        if (validated || unvalidatedSinceMs <= 0) return 0;
        return Math.max(0, unvalidatedSinceMs + graceMs - nowMs);
    }
}
