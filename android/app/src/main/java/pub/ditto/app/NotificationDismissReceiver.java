package pub.ditto.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Resets {@link NostrPoller}'s accumulated-message state when the user
 * dismisses the combined notification (swipe, clear-all, or tap with
 * autoCancel), so the next event starts a fresh notification instead of
 * re-showing already-seen messages.
 */
public class NotificationDismissReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        NostrPoller.clearAccumulatedMessages();
    }
}
