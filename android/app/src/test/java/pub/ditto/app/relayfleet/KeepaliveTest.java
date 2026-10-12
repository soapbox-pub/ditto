package pub.ditto.app.relayfleet;

import static pub.ditto.app.relayfleet.Keepalive.DEFAULT_QUIET_MS;
import static pub.ditto.app.relayfleet.Keepalive.MIN_QUIET_MS;
import static pub.ditto.app.relayfleet.Keepalive.PROBE_TIMEOUT_MS;
import static pub.ditto.app.relayfleet.Keepalive.TICK_MS;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import pub.ditto.app.relayfleet.Keepalive.Action;

import org.junit.Test;

public class KeepaliveTest {

    private static final long T = 10_000_000L;

    @Test
    public void aSocketWellInsideItsLimitIsLeftAlone() {
        assertEquals(Action.NONE, Keepalive.onTick(T - 30_000, 0, DEFAULT_QUIET_MS, T));
    }

    @Test
    public void aSocketIsProbedOnTheLastTickBeforeItsLimit() {
        long quiet = DEFAULT_QUIET_MS - TICK_MS;
        assertEquals(Action.NONE, Keepalive.onTick(T - quiet + 1, 0, DEFAULT_QUIET_MS, T));
        assertEquals(Action.PROBE, Keepalive.onTick(T - quiet, 0, DEFAULT_QUIET_MS, T));
    }

    @Test
    public void aShorterLimitIsProbedSooner() {
        long limit = 105_000;
        assertEquals(Action.PROBE, Keepalive.onTick(T - 50_000, 0, limit, T));
        assertEquals(Action.NONE, Keepalive.onTick(T - 50_000, 0, DEFAULT_QUIET_MS, T));
    }

    @Test
    public void anAnsweredProbeCountsAsTraffic() {
        long probe = T - 10_000;
        assertEquals(Action.NONE, Keepalive.onTick(probe + 200, probe, DEFAULT_QUIET_MS, T));
        assertFalse(Keepalive.probeExpired(probe + 200, probe, T));
    }

    @Test
    public void anUnansweredProbeKillsTheSocketOnlyAfterItsTimeout() {
        long probe = T;
        assertFalse(Keepalive.probeExpired(T - 1, probe, T + PROBE_TIMEOUT_MS - 1));
        assertTrue(Keepalive.probeExpired(T - 1, probe, T + PROBE_TIMEOUT_MS));
        assertEquals(Action.NONE, Keepalive.onTick(T - 1, probe, DEFAULT_QUIET_MS, T + PROBE_TIMEOUT_MS - 1));
        assertEquals(Action.KILL, Keepalive.onTick(T - 1, probe, DEFAULT_QUIET_MS, T + TICK_MS));
    }

    @Test
    public void anIdleDropLowersTheLimitJustUnderTheQuietItAllowed() {
        // git.nostrhub.io and git.shakespeare.diy dropped idle sockets at ~2 minutes.
        assertEquals(105_000, Keepalive.learn(DEFAULT_QUIET_MS, 120_000));
    }

    @Test
    public void aDropAfterLittleQuietTeachesNothing() {
        assertEquals(DEFAULT_QUIET_MS, Keepalive.learn(DEFAULT_QUIET_MS, 10_000));
    }

    @Test
    public void aLearnedLimitNeverRisesAndNeverFallsBelowTheFloor() {
        assertEquals(105_000, Keepalive.learn(105_000, 170_000));
        assertEquals(MIN_QUIET_MS, Keepalive.learn(DEFAULT_QUIET_MS, 52_000));
    }

    @Test
    public void quietSocketsLeaveTogetherSoTheRadioWakesOncePerLimit() {
        // Two sockets quiet since the same answered probe hit their limit on the same tick.
        long last = T - (DEFAULT_QUIET_MS - TICK_MS);
        assertEquals(Action.PROBE, Keepalive.onTick(last, 0, DEFAULT_QUIET_MS, T));
        assertEquals(Action.PROBE, Keepalive.onTick(last + 1_000, 0, DEFAULT_QUIET_MS, T + 1_000));
    }

    @Test
    public void onlyTheRelayEndingTheSocketCanBeAnIdleTimeout() {
        assertTrue(Keepalive.isPeerClose(new java.io.EOFException()));
        assertTrue(Keepalive.isPeerClose(new java.io.IOException("read", new java.io.EOFException())));
        assertFalse(Keepalive.isPeerClose(new java.net.SocketException("Software caused connection abort")));
        assertFalse(Keepalive.isPeerClose(new java.net.UnknownHostException("relay")));
    }
}
