package pub.ditto.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Receives FCM push messages from the nostr-push server.
 *
 * When the app is backgrounded/killed, Android auto-displays the message's
 * `notification` block (title/body sent by nostr-push) and this service's
 * onMessageReceived is NOT called for the display — only for the `data` block.
 * When the app is in the foreground, onMessageReceived is always called, so we
 * render the notification ourselves here for parity.
 *
 * Uses the same notification channel and tap behavior as the polling path
 * (NostrPoller) so notifications look consistent regardless of delivery method.
 */
public class DittoFirebaseMessagingService extends FirebaseMessagingService {

    private static final String TAG = "DittoFCM";
    private static final String CHANNEL_ID = "ditto_notifications";
    private static int notificationCounter = 1000;

    @Override
    public void onNewToken(String token) {
        // The token can rotate. The JS layer re-fetches and re-registers on
        // app start via useFcmNotifications; nothing to do here beyond logging.
        Log.d(TAG, "FCM token refreshed (len=" + (token != null ? token.length() : 0) + ")");
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        String title = null;
        String body = null;

        RemoteMessage.Notification notification = message.getNotification();
        if (notification != null) {
            title = notification.getTitle();
            body = notification.getBody();
        }

        // Fall back to the data payload (nostr-push mirrors title/body there too
        // in some cases, and data-only messages have no notification block).
        Map<String, String> data = message.getData();
        if ((title == null || body == null) && data != null) {
            if (title == null) title = data.get("title");
            if (body == null) body = data.get("body");
        }

        if (title == null && body == null) {
            Log.d(TAG, "Received FCM message with no title/body — ignoring");
            return;
        }

        showNotification(title != null ? title : "Ditto", body != null ? body : "");
    }

    private void showNotification(String title, String body) {
        createNotificationChannel();

        NotificationManager manager =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        int id = notificationCounter++;

        Intent intent = new Intent(this, MainActivity.class);
        intent.setData(Uri.parse("https://ditto.pub/notifications"));
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, id, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(body)
                .setSmallIcon(R.drawable.ic_stat_ditto)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true);

        manager.notify(id, builder.build());
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Notifications",
                    NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("Nostr notification alerts");

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
}
