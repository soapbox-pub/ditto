package pub.ditto.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/**
 * {@code FrameHead}: reading a frame's subscription id, event id and
 * created_at without parsing it, so a copy of an event the service already
 * handled costs a string scan instead of a JSON parse. It must never return
 * the wrong id: a wrong match would drop an unseen event. Ported from Armada.
 */
public class FrameHeadTest {

    private static final String ID = "a".repeat(64);

    private static String frame(String sub, JSONObject event) {
        return new JSONArray().put("EVENT").put(sub).put(event).toString();
    }

    private static JSONObject event(String content) throws Exception {
        return new JSONObject()
                .put("id", ID)
                .put("pubkey", "b".repeat(64))
                .put("created_at", 1760000000L)
                .put("kind", 1)
                .put("tags", new JSONArray().put(new JSONArray().put("p").put("c".repeat(64))))
                .put("content", content)
                .put("sig", "d".repeat(128));
    }

    @Test
    public void readsTheSubEventIdAndCreatedAt() throws Exception {
        NotificationRelayService.FrameHead head = NotificationRelayService.FrameHead.of(frame("dn-18c", event("x")));
        assertNotNull(head);
        assertEquals("dn-18c", head.sub);
        assertEquals(ID, head.id);
        assertEquals(1760000000L, head.createdAt);
    }

    @Test
    public void fieldsSpelledInsideContentAreNeverTaken() throws Exception {
        // The content comes first here and carries the exact sequences, quoted:
        // escaping means the frame can only hold them as \"id\":\" and \"created_at\":.
        String forged = "\"id\":\"" + "e".repeat(64) + "\",\"created_at\":1";
        String text = "[\"EVENT\",\"dn-1\",{\"content\":" + JSONObject.quote(forged)
                + ",\"id\":\"" + ID + "\",\"created_at\":1760000000}]";
        NotificationRelayService.FrameHead head = NotificationRelayService.FrameHead.of(text);
        assertNotNull(head);
        assertEquals(ID, head.id);
        assertEquals(1760000000L, head.createdAt);
    }

    @Test
    public void aMissingCreatedAtIsUnknown() {
        NotificationRelayService.FrameHead head =
                NotificationRelayService.FrameHead.of("[\"EVENT\",\"dn-1\",{\"id\":\"" + ID + "\"}]");
        assertNotNull(head);
        assertEquals(-1L, head.createdAt);
    }

    @Test
    public void anythingElseIsLeftToTheParser() {
        assertNull(NotificationRelayService.FrameHead.of("[\"EOSE\",\"dn-1\"]"));
        assertNull(NotificationRelayService.FrameHead.of("[\"EVENT\",\"dn-1\",{\"id\": \"" + ID + "\"}]"));
        assertNull(NotificationRelayService.FrameHead.of("[\"EVENT\",\"dn-1\",{\"id\":\"" + ID.substring(1) + "\"}]"));
        assertNull(NotificationRelayService.FrameHead.of("[\"EVENT\",\"dn-1\",{\"id\":\"" + ID));
        assertNull(NotificationRelayService.FrameHead.of("[\"EVENT\",\"dn-1\",{\"id\":\"" + "Z".repeat(64) + "\"}]"));
    }
}
