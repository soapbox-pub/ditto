package pub.ditto.app;

import android.app.AlarmManager;
import android.app.ForegroundServiceStartNotAllowedException;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;

/**
 * Restarts the notification foreground service after a device reboot (or app
 * update) when the user has opted into "persistent" notification style.
 *
 * Without this, the START_STICKY service only comes back the next time the
 * user opens the app (MainActivity), so notifications silently stop after
 * every reboot.
 *
 * Android 15+ (API 35) disallows launching a dataSync foreground service
 * directly from a BOOT_COMPLETED receiver. When that happens we schedule a
 * short one-shot alarm and retry from the alarm broadcast instead — a
 * background FGS start is permitted there as long as the app is exempt from
 * battery optimizations, which the notification settings UI prompts the user
 * to grant when they enable persistent mode.
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "DittoBootReceiver";
    private static final String PREFS_NAME = "ditto_notification_config";
    private static final String ACTION_RETRY = "pub.ditto.app.ACTION_BOOT_RETRY";
    private static final int RETRY_REQUEST_CODE = 1001;
    private static final long RETRY_DELAY_MS = 15_000;

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                && !ACTION_RETRY.equals(action)) {
            return;
        }

        // Only start the service if the user opted into persistent mode and
        // the plugin has a valid config (i.e. someone is logged in).
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String style = prefs.getString("notificationStyle", "push");
        String pubkey = prefs.getString("userPubkey", null);
        if (!"persistent".equals(style) || pubkey == null) {
            return;
        }

        Intent serviceIntent = new Intent(context, NotificationRelayService.class);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
            Log.d(TAG, "Started NotificationRelayService (" + action + ")");
        } catch (Exception e) {
            boolean notAllowed = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                    && e instanceof ForegroundServiceStartNotAllowedException;
            if (notAllowed && !ACTION_RETRY.equals(action)) {
                // Android 15+ blocks dataSync FGS launch from BOOT_COMPLETED.
                // Retry once shortly via an alarm; succeeds when the app is
                // exempt from battery optimizations.
                Log.w(TAG, "FGS start not allowed from " + action + ", scheduling retry");
                scheduleRetry(context, RETRY_DELAY_MS);
            } else {
                Log.w(TAG, "Failed to start NotificationRelayService on " + action, e);
            }
        }
    }

    /**
     * Schedule a one-shot alarm that re-runs this receiver with ACTION_RETRY,
     * which restarts NotificationRelayService. Also used by the service itself
     * when Android's dataSync foreground-service time budget runs out.
     */
    static void scheduleRetry(Context context, long delayMs) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        Intent retryIntent = new Intent(context, BootReceiver.class).setAction(ACTION_RETRY);
        PendingIntent pending = PendingIntent.getBroadcast(
                context,
                RETRY_REQUEST_CODE,
                retryIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        alarmManager.setAndAllowWhileIdle(
                AlarmManager.ELAPSED_REALTIME_WAKEUP,
                SystemClock.elapsedRealtime() + delayMs,
                pending);
    }
}
